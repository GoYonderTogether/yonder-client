//! One file's content search for `grep`: a stream of chunks, with long lines matched in windows.
//!
//! A line longer than [`GREP_LINE_BYTES`] is no longer skipped. It is matched window by window and
//! each window keeps [`GREP_WINDOW_OVERLAP`] bytes of the one before, so a hit is found and reported
//! with its byte position in the file and its column in the line, and `read` can be pointed at it.
//! A match longer than the overlap that straddles a window boundary can be missed.
//!
//! A NUL byte, or a known binary header in the first chunk, ends the file with no matches and is
//! counted in `binary_skipped`, so the caller can say that a file was not searched.

use crate::local_files_binary;
use crate::local_files_grep::{window, Query};
use crate::local_files_limits::{
    GREP_LINE_BYTES, GREP_MATCH_OVERHEAD, GREP_PAYLOAD_BYTES, GREP_SCAN_BYTES, GREP_WINDOW_OVERLAP,
    SNIFF_BYTES,
};
use crate::local_files_scan::{Budget, StopReason};
use crate::local_files_text::check;
use serde_json::{json, Value};
use std::io::Read;
use std::sync::atomic::AtomicBool;

pub struct Outcome {
    pub matches: Vec<Value>,
    /// `output: files` only: one `{ path, count }` per matching file.
    pub files: Vec<Value>,
    pub stop: Option<StopReason>,
    pub hits_payload: usize,
    pub binary_skipped: usize,
}

/// What one file contributed, so the caller can stop the whole scan.
pub enum Progress {
    Continue,
    Stop(StopReason),
}

/// The line being read: its number, where it starts in the file, and how much of its head has
/// already been dropped from `buf` by earlier windows.
struct State {
    number: usize,
    start: u64,
    skipped: usize,
    done: bool,
    buf: Vec<u8>,
    hits: usize,
}

type Mark = (usize, usize, usize);

fn rollback(outcome: &mut Outcome, mark: Mark) {
    outcome.matches.truncate(mark.0);
    outcome.hits_payload = mark.1;
    outcome.files.truncate(mark.2);
}

/// Record a hit on the current line; one hit per line, the rest of the line is not read for more.
fn hit(
    query: &Query,
    st: &mut State,
    text: &str,
    found: (usize, usize),
    shown: &str,
    outcome: &mut Outcome,
) -> Result<Option<StopReason>, &'static str> {
    st.hits += 1;
    st.done = true;
    if query.files_only {
        return Ok(None);
    }
    let column = st.skipped + found.0;
    let value = json!({
        "path": shown,
        "line": st.number,
        "text": window(text, found.0, found.1),
        "byteOffset": st.start + column as u64,
        "column": column,
    });
    let size = serde_json::to_vec(&value)
        .map_err(|_| "operation_failed")?
        .len()
        + GREP_MATCH_OVERHEAD;
    if outcome.hits_payload + size > GREP_PAYLOAD_BYTES {
        return Ok(Some(StopReason::Budget));
    }
    outcome.hits_payload += size;
    outcome.matches.push(value);
    Ok((outcome.matches.len() >= query.limit).then_some(StopReason::Results))
}

/// The line is complete (its newline, or the end of the file): match what is left of it.
fn finish_line(
    query: &Query,
    st: &mut State,
    shown: &str,
    outcome: &mut Outcome,
) -> Result<Option<StopReason>, &'static str> {
    let mut buf = std::mem::take(&mut st.buf);
    if st.done {
        return Ok(None);
    }
    if buf.last() == Some(&b'\r') {
        buf.pop();
    }
    let Ok(text) = std::str::from_utf8(&buf) else {
        return Ok(None);
    };
    let Some(found) = query.regex.find(text) else {
        return Ok(None);
    };
    hit(
        query,
        st,
        text,
        (found.start(), found.end()),
        shown,
        outcome,
    )
}

/// The line outgrew the buffer: match the window, and keep only its tail for the next one.
fn window_step(
    query: &Query,
    st: &mut State,
    shown: &str,
    outcome: &mut Outcome,
) -> Result<Option<StopReason>, &'static str> {
    let mut buf = std::mem::take(&mut st.buf);
    let valid = match std::str::from_utf8(&buf) {
        Ok(_) => buf.len(),
        Err(error) => error.valid_up_to(),
    };
    let text = std::str::from_utf8(&buf[..valid]).unwrap_or("");
    if let Some(found) = query.regex.find(text) {
        return hit(
            query,
            st,
            text,
            (found.start(), found.end()),
            shown,
            outcome,
        );
    }
    // Cut at a character boundary so the next window never starts inside a character.
    let mut cut = buf.len() - GREP_WINDOW_OVERLAP;
    while cut < buf.len() && buf[cut] & 0xC0 == 0x80 {
        cut += 1;
    }
    buf.drain(..cut);
    st.skipped += cut;
    st.buf = buf;
    Ok(None)
}

/// Read one file as a stream and collect its matches (or, for `output: files`, its count).
#[allow(clippy::too_many_arguments)]
pub fn search_file(
    query: &Query,
    mut file: std::fs::File,
    shown: &str,
    outcome: &mut Outcome,
    cancelled: &AtomicBool,
    expires: u64,
    budget: &Budget,
    scanned: &mut u64,
) -> Result<Progress, &'static str> {
    if !file.metadata().map_err(|_| "operation_failed")?.is_file() {
        return Ok(Progress::Continue);
    }
    let mark = (
        outcome.matches.len(),
        outcome.hits_payload,
        outcome.files.len(),
    );
    let mut st = State {
        number: 1,
        start: 0,
        skipped: 0,
        done: false,
        buf: Vec::new(),
        hits: 0,
    };
    let mut chunk = vec![0u8; SNIFF_BYTES];
    let mut pos = 0u64;
    // A stop reached before the end of the file is held back: the rest of the file is still read for
    // a NUL byte, because a file that turns out to be binary contributes no matches at all.
    let mut pending: Option<StopReason> = None;
    loop {
        check(cancelled, expires)?;
        if budget.expired() || *scanned >= GREP_SCAN_BYTES {
            if let Some(stop) = pending {
                return Ok(Progress::Stop(stop));
            }
            rollback(outcome, mark);
            return Ok(Progress::Stop(StopReason::Budget));
        }
        let want = (GREP_SCAN_BYTES - *scanned).min(chunk.len() as u64) as usize;
        let n = file
            .read(&mut chunk[..want])
            .map_err(|_| "operation_failed")?;
        if n == 0 {
            break;
        }
        *scanned += n as u64;
        let bytes = &chunk[..n];
        if (pos == 0 && local_files_binary::is_binary(bytes)) || bytes.contains(&0) {
            rollback(outcome, mark);
            outcome.binary_skipped += 1;
            return Ok(Progress::Continue);
        }
        if pending.is_some() {
            pos += n as u64;
            continue;
        }
        let mut from = 0usize;
        while from < n {
            let newline = bytes[from..].iter().position(|byte| *byte == b'\n');
            let end = newline.map_or(n, |at| from + at);
            if !st.done {
                st.buf.extend_from_slice(&bytes[from..end]);
                if st.buf.len() > GREP_LINE_BYTES {
                    if let Some(stop) = window_step(query, &mut st, shown, outcome)? {
                        pending = Some(stop);
                        break;
                    }
                }
            }
            if newline.is_none() {
                break;
            }
            if let Some(stop) = finish_line(query, &mut st, shown, outcome)? {
                pending = Some(stop);
                break;
            }
            st.number += 1;
            st.start = pos + end as u64 + 1;
            st.skipped = 0;
            st.done = false;
            st.buf.clear();
            from = end + 1;
        }
        pos += n as u64;
    }
    if let Some(stop) = pending {
        return Ok(Progress::Stop(stop));
    }
    if !st.done && !st.buf.is_empty() {
        if let Some(stop) = finish_line(query, &mut st, shown, outcome)? {
            return Ok(Progress::Stop(stop));
        }
    }
    if query.files_only && st.hits > 0 {
        let value = json!({"path": shown, "count": st.hits});
        let size = serde_json::to_vec(&value)
            .map_err(|_| "operation_failed")?
            .len()
            + GREP_MATCH_OVERHEAD;
        if outcome.hits_payload + size > GREP_PAYLOAD_BYTES {
            return Ok(Progress::Stop(StopReason::Budget));
        }
        outcome.hits_payload += size;
        outcome.files.push(value);
        if outcome.files.len() >= query.limit {
            return Ok(Progress::Stop(StopReason::Results));
        }
    }
    Ok(Progress::Continue)
}

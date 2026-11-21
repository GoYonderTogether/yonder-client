//! `grep`: content search over a folder grant or one file.
//!
//! Per-line matching, one match per matching line, `line` from 1, and `path` in the same form as
//! `search`, so a result can be handed straight to `read`'s `offset`. Text is cut to a window
//! around the hit (at most [`GREP_TEXT_CHARS`] characters, up to [`GREP_TEXT_LEAD`] of them before
//! it), so a minified line still shows the part that matched.
//!
//! The regex is `regex`'s syntax: no look-around and no backreferences. A pattern that does not
//! compile is `invalid_pattern`, not an empty result — otherwise a Bot retries the same pattern
//! forever. `literal: true` escapes the query, which is how to search text that happens to contain
//! regex punctuation.
//!
//! Reading is chunked and the per-line buffer is capped, so one absurd line costs a skip and not
//! the device's memory.

use crate::local_files_limits::{
    GREP_FILE_BYTES, GREP_LIMIT_DEFAULT, GREP_LIMIT_MAX, GREP_LINE_BYTES, GREP_MATCH_OVERHEAD,
    GREP_PAYLOAD_BYTES, GREP_SCAN_BYTES, GREP_TEXT_CHARS, GREP_TEXT_LEAD, PATTERN_CHARS,
    REGEX_SIZE_BYTES,
};
use crate::local_files_scan::{Budget, NameFilter, Options, StopReason};
use crate::local_files_text::check;
use regex::Regex;
use serde_json::{json, Value};
use std::io::Read;
use std::path::Path;
use std::sync::atomic::AtomicBool;

const CHUNK: usize = 64 * 1024;

pub struct Query {
    pub regex: Regex,
    pub limit: usize,
}

/// Compile the caller's pattern, applying `literal` and `caseSensitive`.
pub fn query(
    pattern: &str,
    literal: bool,
    case_sensitive: bool,
    limit: usize,
) -> Result<Query, &'static str> {
    if pattern.is_empty() || pattern.chars().count() > PATTERN_CHARS || pattern.contains('\0') {
        return Err("invalid_pattern");
    }
    let body = if literal {
        regex::escape(pattern)
    } else {
        pattern.to_owned()
    };
    let source = if case_sensitive {
        format!("(?-i:{body})")
    } else {
        format!("(?i:{body})")
    };
    let regex = regex::RegexBuilder::new(&source)
        .size_limit(REGEX_SIZE_BYTES)
        .dfa_size_limit(REGEX_SIZE_BYTES)
        .build()
        .map_err(|_| "invalid_pattern")?;
    if limit == 0 || limit > GREP_LIMIT_MAX {
        return Err("path_invalid");
    }
    Ok(Query { regex, limit })
}

/// `limit` from the command, or the default; 0 when it is outside 1..=200.
pub fn limit_from(value: Option<u64>) -> usize {
    match value {
        None => GREP_LIMIT_DEFAULT,
        Some(count) if count >= 1 && count <= GREP_LIMIT_MAX as u64 => count as usize,
        Some(_) => 0,
    }
}

/// The matched line as the Bot sees it: at most [`GREP_TEXT_CHARS`] characters, around the hit.
pub fn window(line: &str, hit_start: usize, hit_end: usize) -> String {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= GREP_TEXT_CHARS {
        return line.to_owned();
    }
    let start_char = line[..hit_start].chars().count();
    let hit_chars = line[hit_start..hit_end].chars().count();
    let width = GREP_TEXT_CHARS.max(hit_chars.min(GREP_TEXT_CHARS));
    let mut from = start_char.saturating_sub(GREP_TEXT_LEAD);
    if from + width > chars.len() {
        from = chars.len() - width;
    }
    chars[from..from + width].iter().collect()
}

pub struct Outcome {
    pub matches: Vec<Value>,
    pub stop: Option<StopReason>,
    pub hits_payload: usize,
}

/// What one file contributed, so the caller can stop the whole scan.
enum Progress {
    Continue,
    Stop(StopReason),
}

/// Read one file line by line and collect matches.
///
/// A NUL byte in the leading window marks the file binary and ends it with no matches. Lines over
/// [`GREP_LINE_BYTES`] are skipped without being buffered; their remainder is discarded.
fn search_file(
    query: &Query,
    mut file: std::fs::File,
    shown: &str,
    outcome: &mut Outcome,
    cancelled: &AtomicBool,
    expires: u64,
    budget: &Budget,
    scanned: &mut u64,
) -> Result<Progress, &'static str> {
    let metadata = file.metadata().map_err(|_| "operation_failed")?;
    if !metadata.is_file() || metadata.len() > GREP_FILE_BYTES {
        return Ok(Progress::Continue);
    }
    let mut chunk = [0u8; CHUNK];
    let mut pending: Vec<u8> = Vec::new();
    // Past the cap: the rest of the line is thrown away instead of buffered.
    let mut discarding = false;
    let mut number = 0usize;
    let first_match = outcome.matches.len();
    let first_payload = outcome.hits_payload;
    let mut pending_stop = None;
    let mut file_bytes = 0u64;
    loop {
        check(cancelled, expires)?;
        if budget.expired() || *scanned >= GREP_SCAN_BYTES {
            outcome.matches.truncate(first_match);
            outcome.hits_payload = first_payload;
            return Ok(Progress::Stop(StopReason::Budget));
        }
        let remaining =
            (GREP_SCAN_BYTES - *scanned).min(GREP_FILE_BYTES.saturating_sub(file_bytes));
        if remaining == 0 {
            outcome.matches.truncate(first_match);
            outcome.hits_payload = first_payload;
            return Ok(Progress::Stop(StopReason::Budget));
        }
        let count = file
            .read(&mut chunk[..remaining.min(CHUNK as u64) as usize])
            .map_err(|_| "operation_failed")?;
        if count == 0 {
            break;
        }
        *scanned += count as u64;
        file_bytes += count as u64;
        if chunk[..count].contains(&0) {
            outcome.matches.truncate(first_match);
            outcome.hits_payload = first_payload;
            return Ok(Progress::Continue);
        }
        if pending_stop.is_some() {
            continue;
        }
        let mut from = 0usize;
        while from < count {
            let rest = &chunk[from..count];
            let newline = rest.iter().position(|byte| *byte == b'\n');
            let end = newline.map(|at| from + at).unwrap_or(count);
            if !discarding {
                pending.extend_from_slice(&chunk[from..end]);
                if pending.len() > GREP_LINE_BYTES {
                    discarding = true;
                    pending.clear();
                }
            }
            match newline {
                Some(at) => {
                    number += 1;
                    if !discarding {
                        if let Some(stop) = take_line(query, &mut pending, shown, number, outcome)?
                        {
                            pending_stop = Some(stop);
                            break;
                        }
                    }
                    discarding = false;
                    pending.clear();
                    from = from + at + 1;
                }
                None => break,
            }
        }
    }
    if pending_stop.is_none() && !discarding && !pending.is_empty() {
        number += 1;
        if let Some(stop) = take_line(query, &mut pending, shown, number, outcome)? {
            return Ok(Progress::Stop(stop));
        }
    }
    Ok(match pending_stop {
        Some(stop) => Progress::Stop(stop),
        None => Progress::Continue,
    })
}

/// Match one complete line (without its newline) and append the match if it hit.
fn take_line(
    query: &Query,
    line: &mut Vec<u8>,
    shown: &str,
    number: usize,
    outcome: &mut Outcome,
) -> Result<Option<StopReason>, &'static str> {
    if line.last() == Some(&b'\r') {
        line.pop();
    }
    let Ok(text) = std::str::from_utf8(line) else {
        return Ok(None);
    };
    let Some(found) = query.regex.find(text) else {
        return Ok(None);
    };
    let text = window(text, found.start(), found.end());
    let value = json!({"path": shown, "line": number, "text": text});
    let size = serde_json::to_vec(&value)
        .map_err(|_| "operation_failed")?
        .len()
        + GREP_MATCH_OVERHEAD;
    if outcome.hits_payload + size > GREP_PAYLOAD_BYTES {
        return Ok(Some(StopReason::Budget));
    }
    outcome.hits_payload += size;
    outcome.matches.push(value);
    if outcome.matches.len() >= query.limit {
        return Ok(Some(StopReason::Results));
    }
    Ok(None)
}

/// Search every candidate under `root`.
///
/// `root` may be a file. A file the caller named explicitly is searched even when a `.gitignore`
/// would hide it: the grant, not the ignore rules, decides what may be read.
pub fn run(
    anchor: &Path,
    root: &Path,
    shown_root: &str,
    max_path_units: usize,
    filter: &NameFilter,
    options: &Options,
    query: &Query,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let mut budget = Budget::new(expires);
    let walk = crate::local_files_scan::walk(
        anchor,
        root,
        filter,
        options,
        usize::MAX,
        cancelled,
        &mut budget,
    )?;
    let mut outcome = Outcome {
        matches: Vec::new(),
        stop: walk.stop,
        hits_payload: 0,
    };
    let mut scanned: u64 = 0;
    for entry in &walk.entries {
        if entry.is_dir {
            continue;
        }
        check(cancelled, expires)?;
        if budget.expired() {
            outcome.stop = Some(StopReason::Budget);
            break;
        }
        let is_root = entry.path == root;
        let relative = entry.path.strip_prefix(root).unwrap_or(&entry.path);
        let shown = shown_path(shown_root, relative, is_root);
        if !crate::local_files_operations::path_in_budget(&shown, max_path_units) {
            outcome.stop = Some(StopReason::Budget);
            break;
        }
        let Ok(file) = crate::local_files_scan::open_candidate(&walk.root, root, &entry.path)
        else {
            continue;
        };
        match search_file(
            query,
            file,
            &shown,
            &mut outcome,
            cancelled,
            expires,
            &budget,
            &mut scanned,
        )? {
            Progress::Continue => (),
            Progress::Stop(reason) => {
                outcome.stop = Some(reason);
                break;
            }
        }
    }
    let mut result = json!({
        "kind": "grep",
        "path": shown_root,
        "matches": outcome.matches,
        "truncated": outcome.stop.is_some(),
    });
    if let Some(reason) = outcome.stop {
        result["stopReason"] = json!(reason.as_str());
    }
    Ok(result)
}

/// The path a result reports: the folder scope's relative posix path, or the device's own path.
fn shown_path(shown_root: &str, relative: &Path, is_root: bool) -> String {
    if is_root {
        return shown_root.to_owned();
    }
    let tail = relative.to_string_lossy().replace('\\', "/");
    if shown_root.is_empty() || shown_root == "." {
        return tail;
    }
    format!("{}/{}", shown_root.trim_end_matches('/'), tail)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn grep_keeps_line_numbers_after_skipped_long_lines_and_respects_ignore() {
        let root = std::env::temp_dir().join(format!(
            "yonder-grep-{}-{}",
            std::process::id(),
            crate::local_files_text::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        std::fs::write(root.join(".gitignore"), "ignored.txt\n").unwrap();
        std::fs::write(root.join("ignored.txt"), "needle\n").unwrap();
        std::fs::write(
            root.join("found.txt"),
            format!("{}\nneedle\n", "x".repeat(GREP_LINE_BYTES + 1)),
        )
        .unwrap();
        let result = run(
            &root,
            &root,
            ".",
            1024,
            &NameFilter::none(&root),
            &Options {
                ignored_rules: true,
                hidden: false,
            },
            &query("needle", true, false, 100).unwrap(),
            &AtomicBool::new(false),
            u64::MAX,
        )
        .unwrap();
        assert_eq!(result["matches"].as_array().unwrap().len(), 1);
        assert_eq!(result["matches"][0]["path"], "found.txt");
        assert_eq!(result["matches"][0]["line"], 2);
        std::fs::remove_dir_all(root).unwrap();
    }
}

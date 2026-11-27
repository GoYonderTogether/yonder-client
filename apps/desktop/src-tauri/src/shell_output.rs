//! Reading a job's log: the bounded tail a result carries, one log page, and the `.exit` file.

use crate::shell_limits::{SHELL_LOG_BYTES, SHELL_OUTPUT_BYTES, SHELL_OUTPUT_HEAD_BYTES};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Cut `bytes` to at most `max` at a UTF-8 character boundary: `from_end` keeps the tail, else the
/// head. A command may print something that is not valid UTF-8 (a file name, a binary dump); that
/// text is decoded lossily, because an error name is more useful to the model than a failed result.
fn cut(bytes: &[u8], max: usize, from_end: bool) -> Vec<u8> {
    if bytes.len() <= max {
        return bytes.to_vec();
    }
    if from_end {
        let mut start = bytes.len() - max;
        // Step back while the cut lands inside a multi-byte character.
        while start < bytes.len() && (bytes[start] & 0xC0) == 0x80 {
            start += 1;
        }
        bytes[start..].to_vec()
    } else {
        let mut end = max;
        while end > 0 && (bytes[end] & 0xC0) == 0x80 {
            end -= 1;
        }
        bytes[..end].to_vec()
    }
}

/// The result's `output`: the whole log up to the cap, else its first 16 KiB and last 48 KiB.
/// `truncated` says whether anything was left out, so the model knows to read `outputPath`.
pub fn bounded(log: &Path) -> (String, bool) {
    let bytes = std::fs::read(log).unwrap_or_default();
    if bytes.len() <= SHELL_OUTPUT_BYTES {
        return (String::from_utf8_lossy(&bytes).into_owned(), false);
    }
    let head = cut(&bytes, SHELL_OUTPUT_HEAD_BYTES, false);
    let tail = cut(&bytes, SHELL_OUTPUT_BYTES - SHELL_OUTPUT_HEAD_BYTES, true);
    let mut body = head;
    body.extend_from_slice(&tail);
    (String::from_utf8_lossy(&body).into_owned(), true)
}

/// The completion event's tail, capped at `SHELL_EVENT_TAIL_BYTES`.
pub fn tail(log: &Path, max: usize) -> String {
    let bytes = std::fs::read(log).unwrap_or_default();
    String::from_utf8_lossy(&cut(&bytes, max, true)).into_owned()
}

/// One page of a log at an absolute byte offset, up to [`SHELL_LOG_BYTES`]. `next` is where the
/// following page starts; `offset` is where this one did (clamped to the file's length).
///
/// This runner never deletes bytes from a live log, so `truncated` (which means "bytes before
/// `offset` are gone") is always false here; it stays in the result shape because the server and
/// the model share it with other implementations.
pub fn page(log: &Path, offset: u64) -> Result<(String, u64, u64, bool), &'static str> {
    let mut file = std::fs::File::open(log).map_err(|_| "output_unavailable")?;
    let length = file.metadata().map_err(|_| "output_unavailable")?.len();
    let start = offset.min(length);
    file.seek(SeekFrom::Start(start))
        .map_err(|_| "output_unavailable")?;
    let mut bytes = Vec::with_capacity(SHELL_LOG_BYTES);
    (&mut file)
        .take(SHELL_LOG_BYTES as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "output_unavailable")?;
    let next = start + bytes.len() as u64;
    Ok((String::from_utf8_lossy(&bytes).into_owned(), start, next, false))
}

/// The wrapper's recorded exit code. Absent until the wrapper has written it.
pub fn exit_code(path: &Path) -> Option<i64> {
    let text = std::fs::read_to_string(path).ok()?;
    text.trim().parse().ok()
}
//! Reading and splicing file bytes for the local file tools.
//!
//! Two rules decide the shape of this module:
//!
//! * One `read` result — body, line numbers and whole-file hash — comes from one consistent pass
//!   over one file version. If the file moves under us, the whole call fails with `conflict`
//!   instead of returning a page that belongs to no version.
//! * `edit` checks the SHA-256 of the file's **raw** bytes and keeps every byte it was not asked to
//!   change: BOM, untouched line endings, permissions. Matching `oldString` in either LF or CRLF
//!   form is what makes a multi-line old string work on a CRLF file.

use crate::local_files_limits::{MAX_FILE_BYTES, MAX_INPUT_BYTES, MAX_PAGE_BYTES};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX)
}

/// `cancelled` when the user stopped the command, or the command's own expiry passed.
///
/// A scan's internal deadline is not this: that one ends the scan with a partial result and
/// `stopReason: "budget"`, because the Bot asked a question the device could partly answer.
pub fn check(cancelled: &AtomicBool, expires: u64) -> Result<(), &'static str> {
    if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
        Err("cancelled")
    } else {
        Ok(())
    }
}

/// A symlink on Unix, or any name-surrogate reparse point on Windows — a junction included.
///
/// Walkers report a Windows junction as a plain directory, so the attribute, not the file type, is
/// what keeps a scan from stepping through it.
pub fn link_like(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

/// Open a candidate file for reading: never through a link, never a directory, never a device.
///
/// `O_NOFOLLOW` closes the window between "the entry looked like a file" and "we opened it": if a
/// walked entry was swapped for a link in that window, the open fails and the caller skips it.
pub fn open_regular(path: &Path) -> Result<File, &'static str> {
    let file = crate::local_files_scan::scan_io::open_root(path)?;
    let metadata = file.metadata().map_err(|_| "operation_failed")?;
    if !metadata.is_file() {
        return Err("unsupported_file");
    }
    Ok(file)
}

/// One file version: the bytes and the SHA-256 of exactly those bytes.
pub struct Snapshot {
    pub bytes: Vec<u8>,
    pub hash: String,
}

/// The identity and size of one version; a change in any of them means the file moved on.
pub fn stamp(metadata: &fs::Metadata) -> (u64, u64, Option<SystemTime>) {
    #[cfg(unix)]
    let (device, inode) = {
        use std::os::unix::fs::MetadataExt;
        (metadata.dev(), metadata.ino())
    };
    #[cfg(not(unix))]
    let (device, inode) = (0u64, 0u64);
    (metadata.len(), device ^ inode, metadata.modified().ok())
}

/// Compare native file identities, rejecting missing Windows identity fields.
pub(crate) fn same_handle(a: &File, b: &File) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (a.metadata(), b.metadata()) {
            (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
            _ => false,
        }
    }
    #[cfg(windows)]
    {
        use cap_primitives::fs::_WindowsByHandle;
        match (
            cap_primitives::fs::Metadata::from_file(a),
            cap_primitives::fs::Metadata::from_file(b),
        ) {
            (Ok(a), Ok(b)) => match (
                a.volume_serial_number(),
                a.file_index(),
                b.volume_serial_number(),
                b.file_index(),
            ) {
                (Some(av), Some(ai), Some(bv), Some(bi)) => av == bv && ai == bi,
                _ => false,
            },
            _ => false,
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (a, b);
        false
    }
}

/// Read a file once, hash it in the same pass, and fail if it changes while being read.
///
/// Returns `too_large` above [`MAX_FILE_BYTES`], `unsupported_file` for anything that is not plain
/// UTF-8 text without NUL bytes, and `conflict` when the bytes read are not exactly one stable
/// version (the file grew, shrank, or was replaced by another inode).
pub fn snapshot(
    path: &Path,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Snapshot, &'static str> {
    let mut handle = open_regular(path)?;
    let before = handle.metadata().map_err(|_| "operation_failed")?;
    if before.len() > MAX_FILE_BYTES {
        return Err("too_large");
    }
    let expected = before.len();
    let mut bytes = Vec::with_capacity(expected as usize);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65_536];
    let mut read: u64 = 0;
    let mut ticks = 0u32;
    loop {
        if ticks % 8 == 0 {
            check(cancelled, expires)?;
        }
        ticks = ticks.wrapping_add(1);
        let count = handle.read(&mut buffer).map_err(|_| "operation_failed")?;
        if count == 0 {
            break;
        }
        read += count as u64;
        if read > expected {
            // The file grew past the version we started on: what we hold spans two versions.
            return Err("conflict");
        }
        hasher.update(&buffer[..count]);
        bytes.extend_from_slice(&buffer[..count]);
    }
    if read != expected {
        return Err("conflict");
    }
    let after = handle.metadata().map_err(|_| "operation_failed")?;
    if stamp(&after) != stamp(&before)
        || open_regular(path)
            .map(|current| !same_handle(&handle, &current))
            .unwrap_or(true)
        || fs::symlink_metadata(path)
            .map(|m| link_like(&m) || stamp(&m) != stamp(&before))
            .unwrap_or(true)
    {
        return Err("conflict");
    }
    check(cancelled, expires)?;
    if bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
        return Err("unsupported_file");
    }
    Ok(Snapshot {
        bytes,
        hash: format!("{:x}", hasher.finalize()),
    })
}

/// One page: the exact bytes from the start of line `start_line` through the end of `end_line`.
///
/// Byte-exact on purpose: the text a Bot reads can be pasted back as `oldString` unchanged.
pub struct Page {
    pub content: Vec<u8>,
    pub start_line: usize,
    pub end_line: usize,
    pub total_lines: usize,
    pub truncated: bool,
}

/// Read and hash one stable version with bounded buffers.
pub fn read_page(
    path: &Path,
    offset: usize,
    limit: usize,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<(Page, String), &'static str> {
    let mut file = open_regular(path)?;
    let before = file.metadata().map_err(|_| "operation_failed")?;
    if before.len() > MAX_FILE_BYTES {
        return Err("too_large");
    }
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; 65536];
    let mut carry = Vec::new();
    let mut line = Vec::new();
    let mut length = 0usize;
    let mut total = 0usize;
    let mut returned = 0usize;
    let mut content = Vec::new();
    let mut full = false;
    let mut read = 0u64;
    let mut finish_line =
        |line: &mut Vec<u8>, length: &mut usize, total: &mut usize| -> Result<(), &'static str> {
            *total += 1;
            if *total >= offset && returned < limit && !full {
                if *length > MAX_PAGE_BYTES {
                    if returned == 0 {
                        return Err("line_too_long");
                    }
                    full = true;
                } else {
                    if line.last() == Some(&b'\r') {
                        line.pop();
                    }
                    let extra = line.len() + usize::from(returned > 0);
                    if content.len() + extra > MAX_PAGE_BYTES {
                        full = true;
                    } else {
                        if returned > 0 {
                            content.push(b'\n');
                        }
                        content.extend_from_slice(line);
                        returned += 1;
                    }
                }
            }
            line.clear();
            *length = 0;
            Ok(())
        };
    loop {
        check(cancelled, expires)?;
        let n = file.read(&mut chunk).map_err(|_| "operation_failed")?;
        if n == 0 {
            break;
        }
        read += n as u64;
        if read > before.len() {
            return Err("conflict");
        }
        hasher.update(&chunk[..n]);
        if chunk[..n].contains(&0) {
            return Err("unsupported_file");
        }
        carry.extend_from_slice(&chunk[..n]);
        match std::str::from_utf8(&carry) {
            Ok(_) => carry.clear(),
            Err(e) if e.error_len().is_none() => {
                let valid = e.valid_up_to();
                carry.drain(..valid);
            }
            Err(_) => return Err("unsupported_file"),
        }
        for &byte in &chunk[..n] {
            if byte == b'\n' {
                finish_line(&mut line, &mut length, &mut total)?;
            } else {
                length += 1;
                if line.len() <= MAX_PAGE_BYTES {
                    line.push(byte);
                }
            }
        }
    }
    if !carry.is_empty() {
        return Err("unsupported_file");
    }
    if length > 0 {
        finish_line(&mut line, &mut length, &mut total)?;
    }
    drop(finish_line);
    if read != before.len()
        || open_regular(path)
            .map(|current| !same_handle(&file, &current))
            .unwrap_or(true)
        || stamp(&file.metadata().map_err(|_| "operation_failed")?) != stamp(&before)
        || fs::symlink_metadata(path)
            .map(|m| link_like(&m) || stamp(&m) != stamp(&before))
            .unwrap_or(true)
    {
        return Err("conflict");
    }
    check(cancelled, expires)?;
    Ok((
        Page {
            content,
            start_line: offset,
            end_line: offset - 1 + returned,
            total_lines: total,
            truncated: offset - 1 + returned < total,
        },
        format!("{:x}", hasher.finalize()),
    ))
}

/// The newline convention a replacement follows when the match itself has none.
pub fn dominant_newline(bytes: &[u8]) -> &'static str {
    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut previous = 0u8;
    for byte in bytes {
        if *byte == b'\n' {
            if previous == b'\r' {
                crlf += 1;
            } else {
                lf += 1;
            }
        }
        previous = *byte;
    }
    if crlf > lf {
        "\r\n"
    } else {
        "\n"
    }
}

/// A pattern as it must appear in the file, and the newline its replacement uses.
struct Variant {
    needle: String,
}

fn variants(old: &str, _file: &[u8]) -> Vec<Variant> {
    let lf = old.replace("\r\n", "\n");
    if !lf.contains('\n') {
        return vec![Variant { needle: lf }];
    }
    vec![
        Variant { needle: lf.clone() },
        Variant {
            needle: lf.replace('\n', "\r\n"),
        },
    ]
}

fn next_hit(text: &str, variants: &[Variant], from: usize) -> Option<(usize, usize)> {
    variants
        .iter()
        .filter_map(|variant| {
            text[from..]
                .find(&variant.needle)
                .map(|at| (from + at, from + at + variant.needle.len()))
        })
        .min_by_key(|hit| hit.0)
}

/// Splice `old` out of `bytes` and `new` in, keeping every other byte.
///
/// `replace_all` replaces every non-overlapping hit; otherwise the hit must be unique. Failures are
/// `path_invalid` (argument shape: empty or NUL-bearing old, equal strings, over 65,536 bytes),
/// `no_match`, `multiple_matches`, `too_large` (result above the file cap) and `unsupported_file`.
pub fn splice(
    bytes: &[u8],
    old: &str,
    new: &str,
    replace_all: bool,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<(Vec<u8>, usize), &'static str> {
    if old.is_empty()
        || old.contains('\0')
        || new.contains('\0')
        || old.len() > MAX_INPUT_BYTES
        || new.len() > MAX_INPUT_BYTES
        || old == new
    {
        return Err("path_invalid");
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "unsupported_file")?;
    let variants = variants(old, bytes);
    let normalized = new.replace("\r\n", "\n");
    let replacement = if dominant_newline(bytes) == "\r\n" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let mut output = Vec::with_capacity(bytes.len());
    let mut cursor = 0usize;
    let mut count = 0usize;
    while let Some((start, end)) = next_hit(text, &variants, cursor) {
        if count % 4096 == 0 {
            check(cancelled, expires)?;
        }
        count += 1;
        if count > 1 && !replace_all {
            return Err("multiple_matches");
        }
        if output
            .len()
            .saturating_add(start - cursor)
            .saturating_add(replacement.len())
            > MAX_FILE_BYTES as usize
        {
            return Err("too_large");
        }
        output.extend_from_slice(&bytes[cursor..start]);
        output.extend_from_slice(replacement.as_bytes());
        cursor = end;
    }
    if count == 0 {
        return Err("no_match");
    }
    if output.len().saturating_add(bytes.len() - cursor) > MAX_FILE_BYTES as usize {
        return Err("too_large");
    }
    output.extend_from_slice(&bytes[cursor..]);
    check(cancelled, expires)?;
    Ok((output, count))
}

/// 1-based line numbers of up to `LIMIT` hits, for the `multiple_matches` hint.
pub fn hit_lines(bytes: &[u8], old: &str, limit: usize) -> Vec<usize> {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return Vec::new();
    };
    if old.is_empty() {
        return Vec::new();
    }
    let variants = variants(old, bytes);
    let mut hits = Vec::new();
    let mut cursor = 0;
    let mut line = 1;
    while hits.len() < limit {
        let Some((start, end)) = next_hit(text, &variants, cursor) else {
            break;
        };
        line += bytes[cursor..start]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count();
        hits.push(line);
        line += bytes[start..end]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count();
        cursor = end;
    }
    hits
}

/// Whether the final path component is a link or reparse point.
pub fn link_at(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| link_like(&m))
        .unwrap_or(false)
}

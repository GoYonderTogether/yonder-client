//! `read` on the byte-range argument set (toolsVersion 7).
//!
//! One streaming pass over the file gives the page, the line count and the whole-file SHA-256, so
//! all three come from one version of the file. There is no size ceiling: memory holds one chunk
//! and at most one line prefix. A binary file is recognised from its first chunk, before size matters.
//! A first line over the page limit comes back cut at a character boundary with its total length, so
//! a file that is one huge line can still be read by byte range.

use crate::local_files_binary;
use crate::local_files_limits::{MAX_PAGE_BYTES, SNIFF_BYTES};
use crate::local_files_text::{check, link_like, open_regular, same_handle, stamp};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::AtomicBool;

/// Where a page starts: a 1-based line, or a 0-based byte position.
#[derive(Clone, Copy)]
pub enum Start {
    Line(usize),
    Byte(u64),
}

pub struct Page {
    pub content: Vec<u8>,
    pub start_line: usize,
    pub end_line: usize,
    pub total_lines: usize,
    pub truncated: bool,
    /// Total bytes of the cut line (without its newline); present only when the first line was cut.
    pub line_bytes: Option<u64>,
    pub start_byte: u64,
    pub end_byte: u64,
}

struct Scan {
    offset: usize,
    from_byte: Option<u64>,
    limit: usize,
    line_no: usize,
    line_len: u64,
    line_start: u64,
    buf: Vec<u8>,
    collect_len: u64,
    adjusting: bool,
    started: bool,
    start_line: usize,
    start_byte: u64,
    returned: usize,
    full: bool,
    total: usize,
    content: Vec<u8>,
    end_byte: u64,
    line_bytes: Option<u64>,
}

impl Scan {
    fn eligible(&self, p: u64) -> bool {
        match self.from_byte {
            Some(b) => p >= b,
            None => self.line_no >= self.offset,
        }
    }

    fn begin(&mut self, p: u64) {
        if !self.started {
            self.started = true;
            self.start_line = self.line_no;
            self.start_byte = if self.from_byte.is_some() {
                p
            } else {
                self.line_start
            };
        }
    }

    fn byte(&mut self, p: u64, b: u8) {
        self.line_len += 1;
        if self.full || self.returned >= self.limit || !self.eligible(p) {
            return;
        }
        // A byte position inside a character moves on to the next character boundary.
        if self.adjusting {
            if b & 0xC0 == 0x80 {
                return;
            }
            self.adjusting = false;
        }
        self.begin(p);
        if self.buf.len() <= MAX_PAGE_BYTES {
            self.buf.push(b);
        }
        self.collect_len += 1;
    }

    /// A line ends at `p`: its newline, or the end of the file for an unterminated last line.
    fn end_line(&mut self, p: u64) {
        self.total += 1;
        if !self.full && self.returned < self.limit && self.eligible(p) {
            self.adjusting = false;
            self.begin(p);
            self.take(p);
        }
        self.line_no += 1;
        self.line_len = 0;
        self.line_start = p + 1;
        self.buf.clear();
        self.collect_len = 0;
    }

    fn take(&mut self, p: u64) {
        let mut line = std::mem::take(&mut self.buf);
        let collected = self.collect_len as usize;
        let over = collected > MAX_PAGE_BYTES + 1
            || (collected == MAX_PAGE_BYTES + 1 && line.last() != Some(&b'\r'));
        if over {
            if self.returned == 0 {
                let mut cut = MAX_PAGE_BYTES;
                while cut > 0 && line[cut] & 0xC0 == 0x80 {
                    cut -= 1;
                }
                self.content.extend_from_slice(&line[..cut]);
                self.line_bytes = Some(self.line_len);
                self.end_byte = self.start_byte + cut as u64;
                self.returned = 1;
            }
            self.full = true;
            return;
        }
        let cr = line.last() == Some(&b'\r');
        if cr {
            line.pop();
        }
        let extra = line.len() + usize::from(self.returned > 0);
        if self.content.len() + extra > MAX_PAGE_BYTES {
            self.full = true;
            return;
        }
        if self.returned > 0 {
            self.content.push(b'\n');
        }
        self.content.extend_from_slice(&line);
        self.returned += 1;
        self.end_byte = p - u64::from(cr);
    }
}

/// Read one page and the whole-file hash from one stable version of the file.
pub fn read_page(
    path: &Path,
    start: Start,
    limit: usize,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<(Page, String), &'static str> {
    let file = open_regular(path)?;
    let before = file.metadata().map_err(|_| "operation_failed")?;
    let size = before.len();
    // A byte position at or past the end is an empty page, as a line past the end is.
    let (offset, from_byte) = match start {
        Start::Line(line) => (line, None),
        Start::Byte(at) => (1, Some(if at < size { at } else { u64::MAX })),
    };
    let mut scan = Scan {
        offset,
        from_byte,
        limit,
        line_no: 1,
        line_len: 0,
        line_start: 0,
        buf: Vec::new(),
        collect_len: 0,
        adjusting: from_byte.is_some(),
        started: false,
        start_line: 0,
        start_byte: 0,
        returned: 0,
        full: false,
        total: 0,
        content: Vec::new(),
        end_byte: 0,
        line_bytes: None,
    };
    let hash = scan_text(path, file, before, cancelled, expires, |pos, bytes| {
        for (i, &b) in bytes.iter().enumerate() {
            let p = pos + i as u64;
            if b == b'\n' {
                scan.end_line(p);
            } else {
                scan.byte(p, b);
            }
        }
    })?;
    if scan.line_len > 0 {
        scan.end_line(size);
    }
    let start_line = if scan.started {
        scan.start_line
    } else if from_byte.is_some() {
        scan.total + 1
    } else {
        offset
    };
    let end_line = start_line - 1 + scan.returned;
    let (start_byte, end_byte) = if scan.started {
        (scan.start_byte, scan.end_byte)
    } else {
        (size, size)
    };
    let page = Page {
        content: scan.content,
        start_line,
        end_line,
        total_lines: scan.total,
        truncated: scan.line_bytes.is_some() || end_line < scan.total,
        line_bytes: scan.line_bytes,
        start_byte,
        end_byte,
    };
    Ok((page, hash))
}

pub struct PreviewPage {
    pub content: Vec<u8>,
    pub next_offset: Option<u64>,
    pub sha256: String,
}

/// Preserve the file's exact UTF-8 bytes so the viewer can concatenate its pages.
pub fn read_preview_page(
    path: &Path,
    offset: u64,
    expected_sha256: Option<&str>,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<PreviewPage, &'static str> {
    let file = open_regular(path)?;
    let before = file.metadata().map_err(|_| "operation_failed")?;
    let size = before.len();
    let mut content = Vec::new();
    let sha256 = scan_text(path, file, before, cancelled, expires, |pos, bytes| {
        let start = offset.saturating_sub(pos);
        if start < bytes.len() as u64 && content.len() <= MAX_PAGE_BYTES {
            let remaining = &bytes[start as usize..];
            let count = remaining.len().min(MAX_PAGE_BYTES + 1 - content.len());
            content.extend_from_slice(&remaining[..count]);
        }
    })?;
    if expected_sha256.is_some_and(|expected| expected != sha256) {
        return Err("conflict");
    }
    let continuation = |byte: &u8| byte & 0xC0 == 0x80;
    if offset > size || content.first().is_some_and(continuation) {
        return Err("path_invalid");
    }
    if content.len() > MAX_PAGE_BYTES {
        let mut end = MAX_PAGE_BYTES;
        while continuation(&content[end]) {
            end -= 1;
        }
        if content[end - 1] == b'\r' && content[end] == b'\n' {
            end -= 1;
        }
        content.truncate(end);
    }
    let end = offset + content.len() as u64;
    Ok(PreviewPage {
        content,
        next_offset: (end < size).then_some(end),
        sha256,
    })
}

fn scan_text(
    path: &Path,
    mut file: fs::File,
    before: fs::Metadata,
    cancelled: &AtomicBool,
    expires: u64,
    mut process: impl FnMut(u64, &[u8]),
) -> Result<String, &'static str> {
    let size = before.len();
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; SNIFF_BYTES];
    let mut carry: Vec<u8> = Vec::new();
    let mut pos = 0u64;
    let mut first = true;
    loop {
        check(cancelled, expires)?;
        let n = file.read(&mut chunk).map_err(|_| "operation_failed")?;
        if n == 0 {
            break;
        }
        if pos + n as u64 > size {
            return Err("conflict");
        }
        let bytes = &chunk[..n];
        // The first chunk decides binary before anything else; later chunks only look for NUL.
        if (first && local_files_binary::is_binary(bytes)) || bytes.contains(&0) {
            return Err("binary_file");
        }
        first = false;
        hasher.update(bytes);
        carry.extend_from_slice(bytes);
        match std::str::from_utf8(&carry) {
            Ok(_) => carry.clear(),
            Err(e) if e.error_len().is_none() => {
                let valid = e.valid_up_to();
                carry.drain(..valid);
            }
            Err(_) => return Err("unsupported_file"),
        }
        process(pos, bytes);
        pos += n as u64;
    }
    if !carry.is_empty() {
        return Err("unsupported_file");
    }
    if pos != size
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
    Ok(format!("{:x}", hasher.finalize()))
}

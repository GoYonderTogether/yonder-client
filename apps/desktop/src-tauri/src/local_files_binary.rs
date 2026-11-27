//! Recognising a binary file for `read`, before its size is looked at.
//!
//! A binary file is reported as `binary_file` with its size and the kind this module can name, so a
//! Bot is told what the file is instead of being told it is too large. Only a few common headers are
//! known; anything else with a NUL byte is `unknown`. There is no parser for any of these formats.

/// The kind of a file from its first bytes, or `unknown`.
pub fn file_type(head: &[u8]) -> &'static str {
    if head.starts_with(b"SQLite format 3\0") {
        "sqlite"
    } else if head.starts_with(b"%PDF-") {
        "pdf"
    } else if head.starts_with(&[0x50, 0x4b, 0x03, 0x04]) {
        "zip"
    } else if head.starts_with(&[0x1f, 0x8b]) {
        "gzip"
    } else if head.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        "png"
    } else if head.starts_with(&[0xff, 0xd8, 0xff]) {
        "jpeg"
    } else if head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a") {
        "gif"
    } else {
        "unknown"
    }
}

/// The size and kind of a file that `read` refused as binary, for the failure receipt.
pub fn describe(path: &std::path::Path) -> Option<(u64, &'static str)> {
    use std::io::Read;
    let mut file = crate::local_files_text::open_regular(path).ok()?;
    let size = file.metadata().ok()?.len();
    let mut head = vec![0u8; crate::local_files_limits::SNIFF_BYTES];
    let count = file.read(&mut head).ok()?;
    Some((size, file_type(&head[..count])))
}

/// True when the leading bytes hold a NUL or start with a known binary header.
pub fn is_binary(head: &[u8]) -> bool {
    head.contains(&0) || file_type(head) != "unknown"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_common_headers_and_flags_nul() {
        let mut sqlite = b"SQLite format 3\0".to_vec();
        sqlite.extend_from_slice(&[0u8; 32]);
        assert_eq!(file_type(&sqlite), "sqlite");
        assert!(is_binary(&sqlite));
        assert_eq!(file_type(b"%PDF-1.7\n"), "pdf");
        assert_eq!(file_type(&[0x50, 0x4b, 0x03, 0x04, 1]), "zip");
        assert_eq!(file_type(&[0x1f, 0x8b, 8]), "gzip");
        assert_eq!(
            file_type(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
            "png"
        );
        assert_eq!(file_type(&[0xff, 0xd8, 0xff, 0xe0]), "jpeg");
        assert_eq!(file_type(b"GIF89a.."), "gif");
        assert_eq!(file_type(b"plain text"), "unknown");
        assert!(!is_binary(b"plain text\n{\"a\":1}"));
        assert!(is_binary(b"text\0more"));
        assert_eq!(file_type(b"text\0more"), "unknown");
    }
}

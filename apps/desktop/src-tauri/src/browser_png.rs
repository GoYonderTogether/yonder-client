//! Read the pixel size out of a PNG header, so a screenshot result can say how large the image is
//! without decoding it. A malformed or truncated header is `None`: the image may still be viewable,
//! and the caller reports width and height as zero rather than refusing a usable picture.

/// `(width, height)` from the IHDR chunk; `None` unless the bytes are a PNG whose header parses.
pub fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if width == 0 || height == 0 {
        return None;
    }
    Some((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_real_png_header_gives_its_size() {
        let mut png = Vec::new();
        png.extend_from_slice(b"\x89PNG\r\n\x1a\n");
        png.extend_from_slice(&[0, 0, 0, 13]);
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&1280u32.to_be_bytes());
        png.extend_from_slice(&720u32.to_be_bytes());
        assert_eq!(dimensions(&png), Some((1280, 720)));
    }

    #[test]
    fn a_non_png_or_short_header_is_none() {
        assert_eq!(dimensions(b"hello"), None);
        assert_eq!(dimensions(&[0u8; 40]), None);
    }
}
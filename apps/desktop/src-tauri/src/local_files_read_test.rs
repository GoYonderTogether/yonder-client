use crate::local_files_binary::describe;
use crate::local_files_mutations::nonce;
use crate::local_files_read::{read_page, Page, Start};
use crate::local_files_text::hash;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

fn dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "yonder-read-{name}-{}-{}",
        std::process::id(),
        nonce()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir.canonicalize().unwrap()
}

fn page(path: &Path, start: Start, limit: usize) -> Result<(Page, String), &'static str> {
    read_page(path, start, limit, &AtomicBool::new(false), u64::MAX)
}

#[test]
fn a_file_that_is_one_huge_line_can_be_read_to_the_end_by_byte_range() {
    let root = dir("one-line");
    let body: Vec<u8> = (0..200_000u32).map(|i| b'a' + (i % 26) as u8).collect();
    let path = root.join("messages.json");
    fs::write(&path, &body).unwrap();
    let (first, whole) = page(&path, Start::Line(1), 2000).unwrap();
    assert_eq!(whole, hash(&body));
    assert_eq!(first.line_bytes, Some(200_000));
    assert_eq!((first.start_byte, first.end_byte), (0, 65_536));
    assert!(first.truncated);
    assert_eq!(first.total_lines, 1);
    let mut rebuilt = first.content.clone();
    let mut next = first.end_byte;
    loop {
        let (more, again) = page(&path, Start::Byte(next), 2000).unwrap();
        assert_eq!(again, whole);
        assert_eq!(more.start_byte, next);
        assert_eq!(more.start_line, 1);
        rebuilt.extend_from_slice(&more.content);
        next = more.end_byte;
        if more.line_bytes.is_none() {
            assert!(!more.truncated);
            break;
        }
    }
    assert_eq!(rebuilt, body);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn byte_offsets_report_their_line_and_start_on_a_character() {
    let root = dir("bytes");
    let path = root.join("t.txt");
    fs::write(&path, "one\ntwo\nthree\n").unwrap();
    let (p, _) = page(&path, Start::Byte(4), 2000).unwrap();
    assert_eq!(p.content, b"two\nthree");
    assert_eq!((p.start_line, p.end_line, p.total_lines), (2, 3, 3));
    assert_eq!((p.start_byte, p.end_byte), (4, 13));
    assert!(!p.truncated);
    let (past, _) = page(&path, Start::Byte(14), 2000).unwrap();
    assert!(past.content.is_empty());
    assert!(!past.truncated);
    assert_eq!((past.start_line, past.end_line), (4, 3));
    let accented = root.join("accent.txt");
    fs::write(&accented, "a\u{e9}\nb\n").unwrap();
    let (inside, _) = page(&accented, Start::Byte(2), 2000).unwrap();
    assert_eq!(inside.content, b"\nb");
    assert_eq!(inside.start_byte, 3);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_file_over_the_old_size_ceiling_pages_with_the_whole_file_hash() {
    let root = dir("big");
    let path = root.join("big.log");
    let body = b"abcd\n".repeat(6_900_000);
    assert!(body.len() as u64 > 32 * 1024 * 1024);
    fs::write(&path, &body).unwrap();
    let (p, h) = page(&path, Start::Line(10), 2).unwrap();
    assert_eq!(p.content, b"abcd\nabcd");
    assert_eq!(
        (p.start_line, p.end_line, p.total_lines),
        (10, 11, 6_900_000)
    );
    assert!(p.truncated);
    assert_eq!((p.start_byte, p.end_byte), (45, 54));
    assert_eq!(h, hash(&body));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_binary_file_is_reported_with_its_type_before_its_size_matters() {
    let root = dir("binary");
    let path = root.join("archive.sqlite3");
    let mut body = b"SQLite format 3\0".to_vec();
    body.resize(33 * 1024 * 1024, 7);
    fs::write(&path, &body).unwrap();
    assert_eq!(page(&path, Start::Line(1), 2000).err(), Some("binary_file"));
    assert_eq!(describe(&path), Some((body.len() as u64, "sqlite")));
    let nul = root.join("data.bin");
    fs::write(&nul, b"text\n\0more").unwrap();
    assert_eq!(page(&nul, Start::Line(1), 2000).err(), Some("binary_file"));
    assert_eq!(describe(&nul), Some((10, "unknown")));
    let latin = root.join("latin1.txt");
    fs::write(&latin, [b'a', 0xff, b'\n']).unwrap();
    assert_eq!(
        page(&latin, Start::Line(1), 2000).err(),
        Some("unsupported_file")
    );
    fs::remove_dir_all(root).unwrap();
}

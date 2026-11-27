//! `grep`: content search over a folder grant or one file.
//!
//! Per-line matching, one match per matching line, `line` from 1, and `path` in the same form as
//! `search`, so a result can be handed straight to `read`. Each match also carries `byteOffset` (the
//! hit's byte position in the file) and `column` (its byte position in the line), both 0-based, so
//! `read` with `byteOffset` reaches the hit even in a file that is one huge line. Text is cut to a
//! window around the hit (at most [`GREP_TEXT_CHARS`] characters, up to [`GREP_TEXT_LEAD`] of them
//! before it).
//!
//! The regex is `regex`'s syntax: no look-around and no backreferences. A pattern that does not
//! compile is `invalid_pattern`, not an empty result, otherwise a Bot retries the same pattern
//! forever. `literal: true` escapes the query, which is how to search text that happens to contain
//! regex punctuation.
//!
//! The per-file stream lives in [`crate::local_files_grep_file`]; this file compiles the query,
//! walks the candidates and shapes the result. `output: "files"` lists each matching file with its
//! count of matching lines instead of the lines.

use crate::local_files_grep_file::{search_file, Outcome, Progress};
use crate::local_files_limits::{
    GREP_LIMIT_DEFAULT, GREP_LIMIT_MAX, GREP_TEXT_CHARS, GREP_TEXT_LEAD, PATTERN_CHARS,
    REGEX_SIZE_BYTES,
};
use crate::local_files_scan::{Budget, NameFilter, Options, StopReason};
use crate::local_files_text::check;
use regex::Regex;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::AtomicBool;

pub struct Query {
    pub regex: Regex,
    pub limit: usize,
    /// `output: "files"`: report matching files with counts instead of matching lines.
    pub files_only: bool,
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
    Ok(Query {
        regex,
        limit,
        files_only: false,
    })
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

/// Search every candidate under `root`.
///
/// `root` may be a file. A file the caller named explicitly is searched even when a `.gitignore`
/// would hide it: the grant, not the ignore rules, decides what may be read.
#[allow(clippy::too_many_arguments)]
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
        files: Vec::new(),
        stop: walk.stop,
        hits_payload: 0,
        binary_skipped: 0,
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
        "binaryFilesSkipped": outcome.binary_skipped,
    });
    if query.files_only {
        result["files"] = json!(outcome.files);
    }
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
    use crate::local_files_limits::GREP_LINE_BYTES;
    use std::sync::atomic::AtomicBool;

    fn fixture(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "yonder-{name}-{}-{}",
            std::process::id(),
            crate::local_files_text::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }

    fn search(root: &Path, query: &Query) -> Value {
        run(
            root,
            root,
            ".",
            1024,
            &NameFilter::none(root),
            &Options {
                ignored_rules: true,
                hidden: false,
            },
            query,
            &AtomicBool::new(false),
            u64::MAX,
        )
        .unwrap()
    }

    #[test]
    fn grep_keeps_line_numbers_after_long_lines_and_respects_ignore() {
        let root = fixture("grep");
        std::fs::write(root.join(".gitignore"), "ignored.txt\n").unwrap();
        std::fs::write(root.join("ignored.txt"), "needle\n").unwrap();
        std::fs::write(
            root.join("found.txt"),
            format!("{}\nneedle\n", "x".repeat(GREP_LINE_BYTES + 1)),
        )
        .unwrap();
        let result = search(&root, &query("needle", true, false, 100).unwrap());
        assert_eq!(result["matches"].as_array().unwrap().len(), 1);
        assert_eq!(result["matches"][0]["path"], "found.txt");
        assert_eq!(result["matches"][0]["line"], 2);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_hit_inside_a_very_long_line_is_found_with_its_byte_position() {
        let root = fixture("grep-long");
        let body = format!("{}needle{}\nneedle\n", "x".repeat(100_000), "y".repeat(10));
        std::fs::write(root.join("one.json"), &body).unwrap();
        let result = search(&root, &query("needle", true, false, 100).unwrap());
        let matches = result["matches"].as_array().unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0]["line"], 1);
        assert_eq!(matches[0]["byteOffset"], 100_000);
        assert_eq!(matches[0]["column"], 100_000);
        assert!(matches[0]["text"].as_str().unwrap().chars().count() <= 300);
        assert!(matches[0]["text"].as_str().unwrap().contains("needle"));
        assert_eq!(matches[1]["line"], 2);
        assert_eq!(matches[1]["byteOffset"], 100_017);
        assert_eq!(matches[1]["column"], 0);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn files_output_counts_lines_and_binary_files_are_reported_as_skipped() {
        let root = fixture("grep-files");
        std::fs::write(root.join("a.txt"), "needle\nother\nneedle\n").unwrap();
        std::fs::write(root.join("b.bin"), b"needle\0binary").unwrap();
        let mut q = query("needle", true, false, 100).unwrap();
        q.files_only = true;
        let result = search(&root, &q);
        assert!(result["matches"].as_array().unwrap().is_empty());
        assert_eq!(result["files"].as_array().unwrap().len(), 1);
        assert_eq!(result["files"][0]["path"], "a.txt");
        assert_eq!(result["files"][0]["count"], 2);
        assert_eq!(result["binaryFilesSkipped"], 1);
        std::fs::remove_dir_all(root).unwrap();
    }
}

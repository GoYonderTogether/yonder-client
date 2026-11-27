//! The device side of the file connectors: which operations each connector may run, and how.
//!
//! The connector split is the authorization model, so it is checked here as well as on the server:
//! `local-files` is the read connector (`list`, `read`, `search`, `index`, `grep`) and
//! `computer-control` is the write connector (`create`, `edit`, `delete`, `restore`). A device
//! still checks it, because a device command must never trust its sender for what it may touch.
//!
//! Each operation's rules live in their own module — [`local_files_text`] for bytes and versions,
//! [`local_files_scan`] for walking, [`local_files_grep`] for content search — and this file owns
//! the argument contract and the result shapes both sides agree on in TOOLS-V2.

use crate::local_files_access;
use crate::local_files_grep;
use crate::local_files_limits::{MAX_OFFSET, MAX_READ_LINES, SCAN_RESULTS};
use crate::local_files_mutations::{delete, restore, write};
use crate::local_files_scan::{self, NameFilter, Options};
use crate::local_files_store::{Context, Grant};
use crate::local_files_text::{self as text, check};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

// ponytail: local mutations share one lock; use per-path locks if write throughput warrants it.
static MUTATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());
// ponytail: one scan per device process; use a bounded pool if concurrent scans are needed.
static SCAN: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Bumped when an operation's arguments or results change shape; the server reads it from
/// `connector.ready` to decide whether to offer this device the newer parameters.
pub const TOOLS_VERSION: u64 = 4;

const READ_OPERATIONS: [&str; 5] = ["list", "read", "search", "index", "grep"];
const WRITE_OPERATIONS: [&str; 4] = ["create", "edit", "delete", "restore"];

pub(crate) fn path_in_budget(path: &str, max_units: usize) -> bool {
    path.encode_utf16().count() <= max_units
}
fn search_result_path(path: &Path, folder_scope: bool) -> String {
    let value = path.to_string_lossy();
    if folder_scope {
        value.replace('\\', "/")
    } else {
        value.into_owned()
    }
}
pub(crate) fn home() -> Result<PathBuf, &'static str> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or("not_found")
}
pub fn resolve(grant: &Grant, path: &str, new: bool) -> Result<PathBuf, &'static str> {
    if grant.scope == "folder" {
        if text::link_at(&grant.root.join(path)) {
            return Err("unsupported_file");
        }
        return local_files_access::resolve(&grant.root, path);
    }
    let target = Path::new(path);
    if path.is_empty() || path.len() > 4096 || !target.is_absolute() || path.contains('\0') {
        return Err("path_invalid");
    }
    if !new && text::link_at(target) {
        return Err("unsupported_file");
    }
    if new {
        let parent = target
            .parent()
            .ok_or("path_invalid")?
            .canonicalize()
            .map_err(|_| "not_found")?;
        Ok(parent.join(target.file_name().ok_or("path_invalid")?))
    } else {
        target.canonicalize().map_err(|_| "not_found")
    }
}
/// `offset` and `limit` for `read`, clamped to the documented ranges.
fn read_range(args: &Value) -> Result<(usize, usize), &'static str> {
    let offset = match args.get("offset") {
        None | Some(Value::Null) => 1,
        Some(value) => match value.as_u64() {
            Some(v) if v >= 1 && v <= MAX_OFFSET as u64 => v as usize,
            _ => return Err("path_invalid"),
        },
    };
    let limit = match args.get("limit") {
        None | Some(Value::Null) => MAX_READ_LINES,
        Some(value) => match value.as_u64() {
            Some(v) if v >= 1 && v <= MAX_READ_LINES as u64 => v as usize,
            _ => return Err("path_invalid"),
        },
    };
    Ok((offset, limit))
}

fn flag(args: &Value, key: &str) -> Result<bool, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err("path_invalid"),
    }
}

fn string_arg<'a>(args: &'a Value, key: &str) -> Result<Option<&'a str>, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.as_str())),
        Some(_) => Err("path_invalid"),
    }
}

/// Read one page of a text file: body, line range, whole-file hash, from one consistent read.
fn read(
    grant: &Grant,
    path: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let start = if path.is_empty() {
        return Err("path_invalid");
    } else {
        path.to_owned()
    };
    let target = resolve(grant, &start, false)?;
    let (offset, limit) = read_range(args)?;
    let (page, hash) = text::read_page(&target, offset, limit, cancelled, expires)?;
    let body = String::from_utf8(page.content).map_err(|_| "unsupported_file")?;
    Ok(json!({
        "kind": "read",
        "path": path,
        "content": body,
        "hash": hash,
        "startLine": page.start_line,
        "endLine": page.end_line,
        "totalLines": page.total_lines,
        "truncated": page.truncated,
    }))
}

fn listing(
    path: &str,
    start: &str,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let target = Path::new(path).canonicalize().map_err(|_| "not_found")?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for (index, entry) in fs::read_dir(&target)
        .map_err(|_| "permission_denied")?
        .enumerate()
    {
        check(cancelled, expires)?;
        if index == SCAN_RESULTS {
            truncated = true;
            break;
        }
        let entry = entry.map_err(|_| "operation_failed")?;
        if entry.file_name() == ".yonder-trash" {
            continue;
        }
        let kind = entry.file_type().map_err(|_| "operation_failed")?;
        if kind.is_file() || kind.is_dir() {
            entries.push(json!({
                "name": entry.file_name().to_string_lossy(),
                "type": if kind.is_dir() { "directory" } else { "file" },
            }));
        }
    }
    Ok(json!({"kind": "list", "path": start, "entries": entries, "truncated": truncated}))
}

/// `search` and `index`: file names only, or every entry when there is no query.
fn search(
    grant: &Grant,
    operation: &str,
    raw: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let query = match string_arg(args, "query")? {
        Some(value) if value.len() > 200 || value.contains('\0') => return Err("path_invalid"),
        value => value.unwrap_or("").trim().to_lowercase(),
    };
    let glob = string_arg(args, "glob")?;
    let start = if raw.is_empty() {
        home()?.to_string_lossy().into_owned()
    } else {
        raw.to_owned()
    };
    let target = resolve(grant, &start, false)?;
    let shown_root = if grant.scope == "folder" {
        search_result_path(&Path::new(&start), true)
    } else {
        start.clone()
    };
    let filter = NameFilter::both(&query, glob, &target)?;
    let options = Options {
        ignored_rules: !flag(args, "includeIgnored")?,
        hidden: flag(args, "includeHidden")?,
    };
    let mut budget = local_files_scan::Budget::new(expires);
    let anchor = if grant.scope == "folder" {
        &grant.root
    } else {
        &target
    };
    let walked = local_files_scan::walk(
        anchor,
        &target,
        &filter,
        &options,
        SCAN_RESULTS,
        cancelled,
        &mut budget,
    )?;
    let mut entries = Vec::new();
    let mut payload = 0usize;
    let mut stop = walked.stop;
    for entry in &walked.entries {
        let shown = shown_entry(grant, &target, &entry.path, &shown_root);
        let max_path = if grant.scope == "folder" { 1024 } else { 4096 };
        if !path_in_budget(&shown, max_path) {
            stop = Some(local_files_scan::StopReason::Budget);
            break;
        }
        let item = json!({"path": shown, "type": if entry.is_dir { "directory" } else { "file" }});
        let size = serde_json::to_vec(&item)
            .map_err(|_| "operation_failed")?
            .len()
            + 1;
        if payload + size > crate::local_files_limits::GREP_PAYLOAD_BYTES {
            stop = Some(local_files_scan::StopReason::Budget);
            break;
        }
        payload += size;
        entries.push(item);
    }
    let mut result = json!({"kind": operation, "path": shown_root, "entries": entries, "truncated": stop.is_some()});
    if let Some(reason) = stop {
        result["stopReason"] = json!(reason.as_str());
    }
    Ok(result)
}

/// The path one entry reports: relative to the folder grant, or the device's own path.
fn shown_entry(grant: &Grant, target: &Path, entry: &Path, shown_root: &str) -> String {
    if grant.scope != "folder" {
        return search_result_path(entry, false);
    }
    let relative = entry.strip_prefix(target).unwrap_or(entry);
    let tail = search_result_path(relative, true);
    if shown_root == "." || shown_root.is_empty() {
        return tail;
    }
    format!("{}/{}", shown_root.trim_end_matches('/'), tail)
}

/// `grep`: content search over a directory or one file.
fn grep(
    grant: &Grant,
    raw: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    if raw.is_empty() {
        return Err("path_invalid");
    }
    let pattern = string_arg(args, "query")?.ok_or("invalid_pattern")?;
    let limit = local_files_grep::limit_from(args.get("limit").and_then(|value| value.as_u64()));
    let literal = flag(args, "literal")?;
    let case_sensitive = flag(args, "caseSensitive")?;
    let query = local_files_grep::query(pattern, literal, case_sensitive, limit)?;
    let target = resolve(grant, raw, false)?;
    let shown_root = if grant.scope == "folder" {
        search_result_path(Path::new(raw), true)
    } else {
        raw.to_owned()
    };
    let filter = match string_arg(args, "glob")? {
        Some(pattern) => NameFilter::glob(&target, pattern)?,
        None => NameFilter::none(&target),
    };
    let options = Options {
        ignored_rules: !flag(args, "includeIgnored")?,
        hidden: flag(args, "includeHidden")?,
    };
    let anchor = if grant.scope == "folder" {
        &grant.root
    } else {
        &target
    };
    local_files_grep::run(
        anchor,
        &target,
        &shown_root,
        if grant.scope == "folder" { 1024 } else { 4096 },
        &filter,
        &options,
        &query,
        cancelled,
        expires,
    )
}

/// Recover candidate lines only when the file still matches the requested version.
pub fn candidate_lines(
    grant: &Grant,
    path: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Vec<usize>, &'static str> {
    let target = resolve(grant, path, false).map_err(|_| "conflict")?;
    let snapshot = text::snapshot(&target, cancelled, expires).map_err(|error| {
        if error == "cancelled" {
            error
        } else {
            "conflict"
        }
    })?;
    if args["expectedHash"].as_str() != Some(snapshot.hash.as_str()) {
        return Err("conflict");
    }
    Ok(args["oldString"]
        .as_str()
        .map(|old| text::hit_lines(&snapshot.bytes, old, 5))
        .unwrap_or_default())
}

pub fn execute(
    grant: &Grant,
    context: &Context,
    operation: &str,
    path: &str,
    args: &Value,
    recovery: &Path,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    check(cancelled, expires)?;
    let reading = READ_OPERATIONS.contains(&operation);
    if !reading && !WRITE_OPERATIONS.contains(&operation) {
        return Err("permission_denied");
    }
    let _scan = if matches!(operation, "search" | "index" | "grep") {
        Some(SCAN.try_lock().map_err(|_| "operation_failed")?)
    } else {
        None
    };
    let _mutation = if reading {
        None
    } else {
        Some(MUTATIONS.lock().map_err(|_| "operation_failed")?)
    };
    check(cancelled, expires)?;
    if reading && grant.connector_id != "local-files" {
        return Err("permission_denied");
    }
    if !reading && (grant.connector_id != "computer-control" || !grant.capabilities.file_tools) {
        return Err("permission_denied");
    }
    if operation == "restore" {
        return restore(grant, context, path, args, recovery, cancelled, expires);
    }
    match operation {
        "read" => read(grant, path, args, cancelled, expires),
        "list" => {
            let start = if path.is_empty() { "." } else { path };
            let target = resolve(grant, start, false)?;
            listing(
                target.to_str().ok_or("path_invalid")?,
                path,
                cancelled,
                expires,
            )
        }
        "search" | "index" => search(grant, operation, path, args, cancelled, expires),
        "grep" => grep(grant, path, args, cancelled, expires),
        "create" | "edit" => {
            let target = resolve(grant, path, operation == "create")?;
            write(operation, path, &target, args, cancelled, expires)
        }
        "delete" => {
            let target = resolve(grant, path, false)?;
            delete(
                grant, context, path, &target, args, recovery, cancelled, expires,
            )
        }
        _ => Err("path_invalid"),
    }
}

#[cfg(test)]
#[path = "local_files_operations_test.rs"]
mod tests;

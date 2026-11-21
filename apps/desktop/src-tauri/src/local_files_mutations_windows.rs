use crate::local_files_limits::{MAX_FILE_BYTES, MAX_INPUT_BYTES};
use crate::local_files_mutations::nonce;
use crate::local_files_text::{self as text, check, hash};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_primitives::fs::{self as cap, OpenOptions};
use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::AtomicBool;

fn open(dir: &std::fs::File, name: &Path, create: bool) -> Result<std::fs::File, &'static str> {
    let mut options = OpenOptions::new();
    options
        .write(true)
        .create_new(create)
        .follow(FollowSymlinks::No);
    let file = cap::open(dir, name, &options).map_err(|_| "permission_denied")?;
    if text::link_like(&file.metadata().map_err(|_| "operation_failed")?) {
        return Err("unsupported_file");
    }
    Ok(file)
}

pub fn edit(
    path: &str,
    target: &Path,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let parent_path = target.parent().ok_or("path_invalid")?;
    let name = Path::new(target.file_name().ok_or("path_invalid")?);
    let parent = crate::local_files_scan::scan_io::open_root(parent_path)?;
    let original = open(&parent, name, false)?;
    let metadata = original.metadata().map_err(|_| "operation_failed")?;
    if metadata.permissions().readonly() {
        return Err("permission_denied");
    }
    let current = text::snapshot(target, cancelled, expires)?;
    let current_handle = text::open_regular(target)?;
    if !text::same_handle(&original, &current_handle) {
        return Err("conflict");
    }
    if args["expectedHash"].as_str() != Some(current.hash.as_str()) {
        return Err("conflict");
    }
    let content = args.get("content");
    let old = args.get("oldString");
    let new = args.get("newString");
    let (output, replacements) = if let Some(content) = content {
        if old.is_some() || new.is_some() || args.get("replaceAll").is_some() {
            return Err("path_invalid");
        }
        let value = content.as_str().ok_or("path_invalid")?;
        if value.contains('\0') {
            return Err("path_invalid");
        }
        if value.len() > MAX_INPUT_BYTES {
            return Err("too_large");
        }
        (value.as_bytes().to_vec(), None)
    } else {
        let old = old.and_then(Value::as_str).ok_or("path_invalid")?;
        let new = new.and_then(Value::as_str).ok_or("path_invalid")?;
        let replace_all = match args.get("replaceAll") {
            None => false,
            Some(Value::Bool(v)) => *v,
            _ => return Err("path_invalid"),
        };
        let (bytes, count) =
            text::splice(&current.bytes, old, new, replace_all, cancelled, expires)?;
        (bytes, Some(count))
    };
    if output.len() as u64 > MAX_FILE_BYTES {
        return Err("too_large");
    }
    let name_temp = format!(".yonder-edit-{}", nonce());
    let temp_path = Path::new(&name_temp);
    let mut temporary = open(&parent, temp_path, true)?;
    let result = (|| {
        temporary
            .write_all(&output)
            .and_then(|_| temporary.sync_all())
            .map_err(|_| "operation_failed")?;
        temporary
            .set_permissions(metadata.permissions())
            .map_err(|_| "operation_failed")?;
        drop(temporary);
        check(cancelled, expires)?;
        let fresh_parent =
            crate::local_files_scan::scan_io::open_root(parent_path).map_err(|_| "conflict")?;
        if !text::same_handle(&parent, &fresh_parent) {
            return Err("conflict");
        }
        let fresh = open(&parent, name, false)?;
        if !text::same_handle(&original, &fresh)
            || fresh
                .metadata()
                .map_err(|_| "conflict")?
                .permissions()
                .readonly()
        {
            return Err("conflict");
        }
        if text::snapshot(target, cancelled, expires)?.hash != current.hash {
            return Err("conflict");
        }
        drop(fresh);
        drop(original);
        cap::rename(&parent, temp_path, &parent, name).map_err(|_| "operation_failed")
    })();
    if result.is_err() {
        let _ = cap::remove_file(&parent, temp_path);
    }
    result?;
    let mut value = json!({"kind":"edit", "path":path, "hash":hash(&output)});
    if let Some(count) = replacements {
        value["replacements"] = json!(count);
    }
    Ok(value)
}

use crate::local_files_limits::{MAX_FILE_BYTES, MAX_INPUT_BYTES};
use crate::local_files_operations::resolve;
use crate::local_files_store::{Context, Grant};
use crate::local_files_text::{self as text, check, hash};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

fn string_arg<'a>(args: &'a Value, key: &str) -> Result<Option<&'a str>, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        Some(_) => Err("path_invalid"),
    }
}
fn flag(args: &Value, key: &str) -> Result<bool, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err("path_invalid"),
    }
}

pub(crate) fn nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        text::now_ms() as u128 * 1_000_000 + (text::now_ms() % 1_000_000) as u128
    )
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            "already_exists"
        } else {
            "operation_failed"
        }
    })?;
    let result = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    if result.is_err() {
        let _ = fs::remove_file(path);
        return Err("operation_failed");
    }
    Ok(())
}

#[cfg(unix)]
fn anchored_file(
    dir: &std::fs::File,
    name: &std::ffi::OsStr,
    flags: i32,
    mode: u32,
) -> Result<std::fs::File, &'static str> {
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    let name = std::ffi::CString::new(name.as_bytes()).map_err(|_| "path_invalid")?;
    let fd = unsafe {
        libc::openat(
            dir.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            mode,
        )
    };
    if fd < 0 {
        return Err("permission_denied");
    }
    Ok(unsafe { std::fs::File::from_raw_fd(fd) })
}

#[cfg(unix)]
fn same_directory(dir: &std::fs::File, path: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Ok(current) = crate::local_files_scan::scan_io::open_root(path) else {
        return false;
    };
    match (dir.metadata(), current.metadata()) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(unix)]
fn anchored_rename(
    dir: &std::fs::File,
    from: &std::ffi::OsStr,
    to: &std::ffi::OsStr,
) -> Result<(), &'static str> {
    use std::os::fd::AsRawFd;
    use std::os::unix::ffi::OsStrExt;
    let from = std::ffi::CString::new(from.as_bytes()).map_err(|_| "path_invalid")?;
    let to = std::ffi::CString::new(to.as_bytes()).map_err(|_| "path_invalid")?;
    if unsafe { libc::renameat(dir.as_raw_fd(), from.as_ptr(), dir.as_raw_fd(), to.as_ptr()) } != 0
    {
        return Err("operation_failed");
    }
    Ok(())
}

#[cfg(unix)]
fn anchored_remove(dir: &std::fs::File, name: &std::ffi::OsStr) {
    use std::os::fd::AsRawFd;
    use std::os::unix::ffi::OsStrExt;
    if let Ok(name) = std::ffi::CString::new(name.as_bytes()) {
        unsafe {
            libc::unlinkat(dir.as_raw_fd(), name.as_ptr(), 0);
        }
    }
}

/// `create` and `edit`. `edit` is either a whole-file replacement or one local splice.
pub fn write(
    operation: &str,
    path: &str,
    target: &Path,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let content = string_arg(args, "content")?;
    let old = string_arg(args, "oldString")?;
    let new = string_arg(args, "newString")?;
    let replace_all = flag(args, "replaceAll")?;
    let local = old.is_some() || new.is_some();
    if operation == "create" {
        if local {
            return Err("path_invalid");
        }
        let content = content.ok_or("path_invalid")?;
        if content.len() > MAX_INPUT_BYTES || content.contains('\0') {
            return Err(content
                .contains('\0')
                .then_some("path_invalid")
                .unwrap_or("too_large"));
        }
        check(cancelled, expires)?;
        write_new(target, content.as_bytes())?;
        return Ok(json!({"kind": "create", "path": path, "hash": hash(content.as_bytes())}));
    }
    #[cfg(windows)]
    return crate::local_files_mutations_windows::edit(path, target, args, cancelled, expires);
    if content.is_some() && (local || args.get("replaceAll").is_some()) {
        // Two exclusive shapes: a whole-file replacement or a local splice, never both.
        return Err("path_invalid");
    }
    if !local && content.is_none() {
        return Err("path_invalid");
    }
    let expected = args
        .get("expectedHash")
        .and_then(Value::as_str)
        .ok_or("conflict")?;
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("conflict");
    }
    #[cfg(unix)]
    let parent =
        crate::local_files_scan::scan_io::open_root(target.parent().ok_or("path_invalid")?)?;
    let initial_metadata = fs::symlink_metadata(target).map_err(|_| "not_found")?;
    if text::link_like(&initial_metadata) {
        return Err("unsupported_file");
    }
    if initial_metadata.permissions().readonly() {
        return Err("permission_denied");
    }
    OpenOptions::new()
        .write(true)
        .open(target)
        .map_err(|_| "permission_denied")?;
    #[cfg(unix)]
    if text::stamp(
        &anchored_file(
            &parent,
            target.file_name().ok_or("path_invalid")?,
            libc::O_WRONLY,
            0,
        )?
        .metadata()
        .map_err(|_| "operation_failed")?,
    ) != text::stamp(&initial_metadata)
    {
        return Err("conflict");
    }
    let current = text::snapshot(target, cancelled, expires)?;
    if current.hash != expected {
        return Err("conflict");
    }
    let (output, replacements) = if let Some(content) = content {
        if content.len() > MAX_INPUT_BYTES {
            return Err("too_large");
        }
        if content.contains('\0') {
            return Err("path_invalid");
        }
        let bytes = content.as_bytes();
        // A whole-file replacement may carry the file's BOM forward; a caller that read the file
        // sees the BOM as the first character of the page and writes it back unchanged.
        (bytes.to_vec(), None)
    } else {
        let old = old.ok_or("path_invalid")?;
        let new = new.ok_or("path_invalid")?;
        let (bytes, count) =
            text::splice(&current.bytes, old, new, replace_all, cancelled, expires)?;
        (bytes, Some(count))
    };
    if output.len() as u64 > MAX_FILE_BYTES {
        return Err("too_large");
    }
    // A symlink is refused outright; a read-only file is refused before the temp file exists.
    if text::link_at(target) {
        return Err("unsupported_file");
    }
    let metadata = fs::metadata(target).map_err(|_| "not_found")?;
    if metadata.permissions().readonly() {
        return Err("permission_denied");
    }
    let temp = target.with_file_name(format!(".yonder-edit-{}", nonce()));
    #[cfg(unix)]
    let mut temporary = anchored_file(
        &parent,
        temp.file_name().ok_or("path_invalid")?,
        libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
        0o600,
    )?;
    #[cfg(not(unix))]
    write_new(&temp, &output)?;
    let result = (|| {
        #[cfg(unix)]
        {
            temporary
                .write_all(&output)
                .and_then(|_| temporary.sync_all())
                .map_err(|_| "operation_failed")?;
            temporary
                .set_permissions(metadata.permissions())
                .map_err(|_| "operation_failed")?;
        }
        #[cfg(not(unix))]
        fs::set_permissions(&temp, metadata.permissions()).map_err(|_| "operation_failed")?;
        check(cancelled, expires)?;
        // Check the same version again, right before the rename: the earlier hash and this one are
        // the window a concurrent editor could have used.
        let final_metadata = fs::symlink_metadata(target).map_err(|_| "conflict")?;
        if text::link_like(&final_metadata)
            || text::stamp(&final_metadata) != text::stamp(&initial_metadata)
        {
            return Err("conflict");
        }
        if final_metadata.permissions().readonly() {
            return Err("permission_denied");
        }
        OpenOptions::new()
            .write(true)
            .open(target)
            .map_err(|_| "permission_denied")?;
        if text::snapshot(target, cancelled, expires)?.hash != expected {
            return Err("conflict");
        }
        #[cfg(unix)]
        {
            if !same_directory(&parent, target.parent().ok_or("path_invalid")?) {
                return Err("conflict");
            }
            let anchored = anchored_file(
                &parent,
                target.file_name().ok_or("path_invalid")?,
                libc::O_WRONLY,
                0,
            )?;
            if text::stamp(&anchored.metadata().map_err(|_| "operation_failed")?)
                != text::stamp(&initial_metadata)
            {
                return Err("conflict");
            }
            anchored_rename(
                &parent,
                temp.file_name().ok_or("path_invalid")?,
                target.file_name().ok_or("path_invalid")?,
            )
        }
        #[cfg(not(unix))]
        fs::rename(&temp, target).map_err(|_| "operation_failed")
    })();
    if result.is_err() {
        #[cfg(unix)]
        anchored_remove(&parent, temp.file_name().ok_or("path_invalid")?);
        #[cfg(not(unix))]
        let _ = fs::remove_file(&temp);
    }
    result?;
    let mut value = json!({"kind": "edit", "path": path, "hash": hash(&output)});
    if let Some(count) = replacements {
        value["replacements"] = json!(count);
    }
    Ok(value)
}

pub fn delete(
    grant: &Grant,
    context: &Context,
    path: &str,
    target: &Path,
    args: &Value,
    recovery: &Path,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    if text::link_at(target) {
        return Err("unsupported_file");
    }
    let current = text::snapshot(target, cancelled, expires)?;
    if current.bytes.len() > MAX_INPUT_BYTES {
        return Err("too_large");
    }
    if Some(current.hash.as_str()) != args["expectedHash"].as_str() {
        return Err("conflict");
    }
    let id = nonce();
    let trash = target.parent().ok_or("path_invalid")?.join(".yonder-trash");
    if text::link_at(&trash) {
        return Err("permission_denied");
    }
    fs::create_dir_all(&trash).map_err(|_| "operation_failed")?;
    let stored = trash.join(&id);
    fs::create_dir_all(recovery).map_err(|_| "operation_failed")?;
    let record_file = recovery.join(format!("{id}.json"));
    let record = json!({
        "ownerId": context.owner_id,
        "deviceId": context.device_id,
        "connectionId": grant.connection_id,
        "original": target,
        "stored": stored,
    });
    write_new(
        &record_file,
        &serde_json::to_vec(&record).map_err(|_| "operation_failed")?,
    )?;
    check(cancelled, expires)?;
    if text::snapshot(target, cancelled, expires)?.hash != current.hash {
        let _ = fs::remove_file(&record_file);
        return Err("conflict");
    }
    if fs::rename(target, &stored).is_err() {
        let _ = fs::remove_file(&record_file);
        return Err("operation_failed");
    }
    Ok(json!({"kind": "delete", "path": path, "recoveryId": id}))
}

/// `restore`: bring back the newest recovery record for a path, or the one with a given id.
#[allow(clippy::too_many_arguments)]
pub fn restore(
    grant: &Grant,
    context: &Context,
    path: &str,
    args: &Value,
    recovery: &Path,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let (record_file, record) = if let Some(id) = args["recoveryId"].as_str() {
        if id.is_empty()
            || id.len() >= 128
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("path_invalid");
        }
        let file = recovery.join(format!("{id}.json"));
        let record: Value = serde_json::from_slice(&fs::read(&file).map_err(|_| "not_found")?)
            .map_err(|_| "operation_failed")?;
        (file, record)
    } else {
        let wanted = resolve(grant, path, true)?;
        let mut latest = None;
        for entry in fs::read_dir(recovery).map_err(|_| "not_found")?.flatten() {
            check(cancelled, expires)?;
            let meta = match entry.metadata() {
                Ok(meta) if meta.is_file() && meta.len() <= 32_768 => meta,
                _ => continue,
            };
            let record: Value = match fs::read(entry.path())
                .ok()
                .and_then(|value| serde_json::from_slice(&value).ok())
            {
                Some(value) => value,
                None => continue,
            };
            if record["ownerId"] != context.owner_id
                || record["deviceId"] != context.device_id
                || record["original"].as_str() != wanted.to_str()
                || !Path::new(record["stored"].as_str().unwrap_or("")).is_file()
            {
                continue;
            }
            let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
            if latest
                .as_ref()
                .map_or(true, |(date, _, _)| modified > *date)
            {
                latest = Some((modified, entry.path(), record));
            }
        }
        let (_, file, record) = latest.ok_or("not_found")?;
        (file, record)
    };
    if record["ownerId"] != context.owner_id || record["deviceId"] != context.device_id {
        return Err("permission_denied");
    }
    let original = PathBuf::from(record["original"].as_str().ok_or("operation_failed")?);
    if resolve(grant, original.to_str().ok_or("path_invalid")?, true)? != original {
        return Err("permission_denied");
    }
    if !path.is_empty() && resolve(grant, path, true)? != original {
        return Err("path_invalid");
    }
    let stored = PathBuf::from(record["stored"].as_str().ok_or("operation_failed")?);
    // Recovery keeps the 64 KiB file bound: a larger file was never deletable, so it cannot be
    // restored either.
    let bytes = text::snapshot(&stored, cancelled, expires)?;
    if bytes.bytes.len() > MAX_INPUT_BYTES {
        return Err("too_large");
    }
    check(cancelled, expires)?;
    fs::hard_link(&stored, &original).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            "already_exists"
        } else {
            "operation_failed"
        }
    })?;
    let _ = fs::remove_file(stored);
    let _ = fs::remove_file(record_file);
    Ok(json!({"kind": "restore", "path": original, "hash": bytes.hash}))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn edit_commit_stays_in_open_directory_when_ancestor_is_replaced() {
        let base = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("yonder-anchored-{}", nonce()));
        let original = base.join("selected");
        let moved = base.join("moved");
        let outside = base.join("outside");
        fs::create_dir_all(&original).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(original.join("file"), "original").unwrap();
        fs::write(outside.join("file"), "outside").unwrap();
        let dir = crate::local_files_scan::scan_io::open_root(&original).unwrap();
        fs::rename(&original, &moved).unwrap();
        std::os::unix::fs::symlink(&outside, &original).unwrap();
        assert!(!same_directory(&dir, &original));
        let temp = std::ffi::OsStr::new("temp");
        anchored_file(
            &dir,
            temp,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )
        .unwrap()
        .write_all(b"edited")
        .unwrap();
        anchored_rename(&dir, temp, std::ffi::OsStr::new("file")).unwrap();
        assert_eq!(fs::read_to_string(moved.join("file")).unwrap(), "edited");
        assert_eq!(fs::read_to_string(outside.join("file")).unwrap(), "outside");
        fs::remove_dir_all(base).unwrap();
    }
}

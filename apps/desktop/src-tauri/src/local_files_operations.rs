use crate::local_files_access;
use crate::local_files_store::{Context, Grant};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

// ponytail: local mutations share one lock; use per-path locks if write throughput warrants it.
static MUTATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn search_result_path(path: &Path, folder_scope: bool) -> String {
    let value = path.to_string_lossy();
    if folder_scope {
        value.replace('\\', "/")
    } else {
        value.into_owned()
    }
}
fn home() -> Result<PathBuf, &'static str> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or("not_found")
}
pub fn resolve(grant: &Grant, path: &str, new: bool) -> Result<PathBuf, &'static str> {
    if grant.scope == "folder" {
        return local_files_access::resolve(&grant.root, path);
    }
    let target = Path::new(path);
    if path.is_empty() || path.len() > 4096 || !target.is_absolute() || path.contains('\0') {
        return Err("path_invalid");
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
fn text(path: &Path) -> Result<Vec<u8>, &'static str> {
    let metadata = fs::metadata(path).map_err(|_| "not_found")?;
    if !metadata.is_file() {
        return Err("unsupported_file");
    }
    if metadata.len() > 65536 {
        return Err("too_large");
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "permission_denied")?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|_| "operation_failed")?;
    if bytes.len() > 65536 {
        return Err("too_large");
    }
    if bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
        return Err("unsupported_file");
    }
    Ok(bytes)
}
fn check(cancelled: &AtomicBool, expires: u64) -> Result<(), &'static str> {
    if cancelled.load(Ordering::SeqCst)
        || SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
            >= expires
    {
        Err("cancelled")
    } else {
        Ok(())
    }
}
fn nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
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
    let reading = matches!(operation, "list" | "read" | "search" | "index");
    let _mutation = if reading {
        None
    } else {
        Some(MUTATIONS.lock().map_err(|_| "operation_failed")?)
    };
    check(cancelled, expires)?;
    if !matches!(
        operation,
        "list" | "read" | "search" | "index" | "create" | "edit" | "delete" | "restore"
    ) {
        return Err("permission_denied");
    }
    if reading && grant.connector_id != "local-files" {
        return Err("permission_denied");
    }
    if !reading && (grant.connector_id != "computer-control" || !grant.capabilities.file_tools) {
        return Err("permission_denied");
    }
    if operation == "restore" {
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
                    Ok(m) if m.is_file() && m.len() <= 32768 => m,
                    _ => continue,
                };
                let record: Value = match fs::read(entry.path())
                    .ok()
                    .and_then(|v| serde_json::from_slice(&v).ok())
                {
                    Some(v) => v,
                    None => continue,
                };
                if record["ownerId"] != context.owner_id
                    || record["deviceId"] != context.device_id
                    || record["original"].as_str() != wanted.to_str()
                    || !Path::new(record["stored"].as_str().unwrap_or("")).is_file()
                {
                    continue;
                }
                let modified = meta.modified().unwrap_or(UNIX_EPOCH);
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
        let bytes = text(&stored)?;
        check(cancelled, expires)?;
        fs::hard_link(&stored, &original).map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "already_exists"
            } else {
                "operation_failed"
            }
        })?;
        let _ = fs::remove_file(stored);
        let _ = fs::remove_file(record_file);
        return Ok(json!({"kind":"restore","path":original,"hash":hash(&bytes)}));
    }
    let start = if matches!(operation, "search" | "index") && path.is_empty() {
        home()?.to_string_lossy().into_owned()
    } else {
        path.to_owned()
    };
    let target = resolve(grant, &start, operation == "create")?;
    match operation {
        "read" => {
            let bytes = text(&target)?;
            Ok(
                json!({"kind":"read","path":path,"content":std::str::from_utf8(&bytes).map_err(|_|"unsupported_file")?,"hash":hash(&bytes),"truncated":false}),
            )
        }
        "list" => {
            let mut entries = Vec::new();
            let mut truncated = false;
            for (i, e) in fs::read_dir(&target)
                .map_err(|_| "permission_denied")?
                .enumerate()
            {
                check(cancelled, expires)?;
                if i == 200 {
                    truncated = true;
                    break;
                }
                let e = e.map_err(|_| "operation_failed")?;
                let t = e.file_type().map_err(|_| "operation_failed")?;
                if t.is_file() || t.is_dir() {
                    entries.push(json!({"name":e.file_name().to_string_lossy(),"type":if t.is_dir(){"directory"}else{"file"}}));
                }
            }
            Ok(json!({"kind":"list","path":start,"entries":entries,"truncated":truncated}))
        }
        "search" | "index" => {
            let query = args["query"].as_str().unwrap_or("").to_lowercase();
            fs::read_dir(&target).map_err(|_| "permission_denied")?;
            let mut pending = vec![target];
            let mut entries = Vec::new();
            let mut visited = 0;
            let mut truncated = false;
            'scan: while let Some(dir) = pending.pop() {
                check(cancelled, expires)?;
                if let Ok(items) = fs::read_dir(dir) {
                    for item in items.flatten() {
                        visited += 1;
                        if visited > 1000 || entries.len() == 200 {
                            truncated = true;
                            break 'scan;
                        }
                        let typ = match item.file_type() {
                            Ok(t) => t,
                            Err(_) => continue,
                        };
                        if typ.is_symlink() {
                            continue;
                        }
                        if typ.is_dir() {
                            pending.push(item.path());
                        }
                        if (typ.is_file() || typ.is_dir())
                            && (query.is_empty()
                                || item
                                    .file_name()
                                    .to_string_lossy()
                                    .to_lowercase()
                                    .contains(&query))
                        {
                            let value = if grant.scope == "folder" {
                                item.path()
                                    .strip_prefix(&grant.root)
                                    .map(|p| p.to_path_buf())
                                    .unwrap_or_default()
                            } else {
                                item.path()
                            };
                            entries.push(json!({"path":search_result_path(&value, grant.scope == "folder"),"type":if typ.is_dir(){"directory"}else{"file"}}));
                        }
                    }
                } else {
                    truncated = true;
                }
            }
            Ok(json!({"kind":operation,"path":start,"entries":entries,"truncated":truncated}))
        }
        "create" | "edit" => {
            let content = args["content"].as_str().ok_or("path_invalid")?;
            if content.len() > 65536 {
                return Err("too_large");
            }
            if operation == "create" {
                check(cancelled, expires)?;
                write_new(&target, content.as_bytes())?;
            } else {
                let expected = args["expectedHash"].as_str().ok_or("conflict")?;
                if hash(&text(&target)?) != expected {
                    return Err("conflict");
                }
                let temp = target.with_file_name(format!(".yonder-edit-{}", nonce()));
                write_new(&temp, content.as_bytes())?;
                fs::set_permissions(
                    &temp,
                    fs::metadata(&target)
                        .map_err(|_| "operation_failed")?
                        .permissions(),
                )
                .map_err(|_| "operation_failed")?;
                let result = (|| {
                    check(cancelled, expires)?;
                    if hash(&text(&target)?) != expected {
                        return Err("conflict");
                    }
                    fs::rename(&temp, &target).map_err(|_| "operation_failed")
                })();
                if result.is_err() {
                    let _ = fs::remove_file(&temp);
                }
                result?;
            }
            Ok(json!({"kind":operation,"path":path,"hash":hash(content.as_bytes())}))
        }
        "delete" => {
            if fs::symlink_metadata(path)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err("unsupported_file");
            }
            let bytes = text(&target)?;
            if Some(hash(&bytes).as_str()) != args["expectedHash"].as_str() {
                return Err("conflict");
            }
            let id = nonce();
            let trash = target.parent().ok_or("path_invalid")?.join(".yonder-trash");
            if fs::symlink_metadata(&trash)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err("permission_denied");
            }
            fs::create_dir_all(&trash).map_err(|_| "operation_failed")?;
            let stored = trash.join(&id);
            fs::create_dir_all(recovery).map_err(|_| "operation_failed")?;
            let record_file = recovery.join(format!("{id}.json"));
            let record = json!({"ownerId":context.owner_id,"deviceId":context.device_id,"connectionId":grant.connection_id,"original":target,"stored":stored});
            write_new(
                &record_file,
                &serde_json::to_vec(&record).map_err(|_| "operation_failed")?,
            )?;
            check(cancelled, expires)?;
            if hash(&text(&target)?) != hash(&bytes) {
                let _ = fs::remove_file(&record_file);
                return Err("conflict");
            }
            if fs::rename(&target, &stored).is_err() {
                let _ = fs::remove_file(&record_file);
                return Err("operation_failed");
            }
            Ok(json!({"kind":"delete","path":path,"recoveryId":id}))
        }
        _ => Err("path_invalid"),
    }
}

#[cfg(test)]
#[path = "local_files_operations_test.rs"]
mod tests;

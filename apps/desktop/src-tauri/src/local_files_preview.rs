use crate::local_files_limits::SCAN_RESULTS;
use crate::local_files_operations::{home, resolve};
use crate::local_files_scan::{open_candidate, scan_io};
use crate::local_files_store::Grant;
use crate::local_files_text::{check, snapshot_bytes};
use serde_json::{json, Value};
use std::path::{Component, Path};
use std::sync::atomic::AtomicBool;

const ORIGINAL_LIMIT: u64 = 20 * 1024 * 1024;

fn packet(metadata: Value, mut bytes: Vec<u8>) -> Vec<u8> {
    let header = metadata.to_string().into_bytes();
    let mut packet = Vec::with_capacity(4 + header.len() + bytes.len());
    packet.extend((header.len() as u32).to_be_bytes());
    packet.extend(header);
    packet.append(&mut bytes);
    packet
}

fn mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "md" | "markdown" => "text/markdown",
        "txt" | "log" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" | "heif" => "image/heic",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

pub(super) fn execute(
    grant: &Grant,
    operation: &str,
    path: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Vec<u8>, &'static str> {
    check(cancelled, expires)?;
    if grant.connector_id != "local-files" || grant.capabilities.file_tools {
        return Err("permission_denied");
    }
    let preview = operation == "file_preview";
    let expanded;
    let path = if preview && grant.scope == "device" {
        if let Some(relative) = (path == "~")
            .then_some("")
            .or_else(|| path.strip_prefix("~/"))
            .or_else(|| cfg!(windows).then(|| path.strip_prefix("~\\")).flatten())
        {
            let relative = Path::new(relative);
            if relative
                .components()
                .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
            {
                return Err("path_invalid");
            }
            expanded = home()?.join(relative);
            expanded.to_str().ok_or("path_invalid")?
        } else {
            path
        }
    } else {
        path
    };
    let target = resolve(grant, path, false)?;
    let handle = scan_io::open_root(&target)?;
    let metadata = handle.metadata().map_err(|_| "read_failed")?;
    if preview && metadata.is_dir() {
        let mut directory = scan_io::Directory::new(&handle)?;
        let mut entries = Vec::new();
        let mut truncated = false;
        for index in 0..=SCAN_RESULTS {
            check(cancelled, expires)?;
            let Some(name) = directory.next() else { break };
            if index == SCAN_RESULTS {
                truncated = true;
                break;
            }
            let Some(name) = name.to_str().filter(|name| {
                !matches!(*name, "." | ".." | ".yonder-trash")
                    && !name.contains(['/', '\\'])
                    && !name.chars().any(char::is_control)
                    && name.encode_utf16().count() <= 255
            }) else {
                continue;
            };
            let Ok(child) = open_candidate(&handle, &target, &target.join(name)) else {
                continue;
            };
            let Ok(metadata) = child.metadata() else {
                continue;
            };
            if metadata.is_file() || metadata.is_dir() {
                entries.push(json!({"name": name, "type": if metadata.is_dir() { "directory" } else { "file" }}));
            }
        }
        return Ok(packet(
            json!({"kind":"directory", "entries":entries, "truncated":truncated}),
            Vec::new(),
        ));
    }
    let file = snapshot_bytes(&target, ORIGINAL_LIMIT, cancelled, expires)?;
    if preview && args["knownSha256"].as_str() == Some(file.hash.as_str()) {
        return Ok(packet(
            json!({"kind":"unchanged", "sha256":file.hash}),
            Vec::new(),
        ));
    }
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("unsupported_file")?;
    Ok(packet(
        json!({"kind":"file", "name":name, "mimeType":mime_type(&target), "sha256":file.hash}),
        file.bytes,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_files_store::Capabilities;
    use crate::local_files_text::{hash, now_ms};
    use std::fs;

    fn unpack(packet: &[u8]) -> (Value, &[u8]) {
        let length = u32::from_be_bytes(packet[..4].try_into().unwrap()) as usize;
        (
            serde_json::from_slice(&packet[4..4 + length]).unwrap(),
            &packet[4 + length..],
        )
    }

    #[test]
    fn authorized_preview_binds_raw_bytes_and_skips_upload_on_matching_sha() {
        let root = std::env::temp_dir().join(format!(
            "yonder-file-preview-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let grant = Grant {
            root: root.canonicalize().unwrap(),
            owner_id: "owner".into(),
            device_id: "device".into(),
            connection_id: "connection".into(),
            connector_id: "local-files".into(),
            scope: "folder".into(),
            capabilities: Capabilities { file_tools: false, ..Capabilities::default() },
            revision: 1,
        };
        let bytes = [0, 1, 2, 255];
        fs::write(grant.root.join("原件.pdf"), bytes).unwrap();
        let request = |path, args: Value| {
            execute(
                &grant,
                "file_preview",
                path,
                &args,
                &AtomicBool::new(false),
                now_ms() + 5000,
            )
        };
        let raw = request("原件.pdf", json!({})).unwrap();
        let (meta, got) = unpack(&raw);
        assert_eq!(got, bytes);
        assert_eq!(
            meta,
            json!({"kind":"file","name":"原件.pdf","mimeType":"application/pdf","sha256":hash(&bytes)})
        );
        let cached = request("原件.pdf", json!({"knownSha256":hash(&bytes)})).unwrap();
        assert_eq!(
            unpack(&cached),
            (json!({"kind":"unchanged","sha256":hash(&bytes)}), &[][..])
        );
        let listing = request(".", json!({})).unwrap();
        assert_eq!(
            unpack(&listing),
            (
                json!({"kind":"directory","entries":[{"name":"原件.pdf","type":"file"}],"truncated":false}),
                &[][..]
            )
        );
        assert_eq!(request("../not-in-grant", json!({})), Err("path_invalid"));
        fs::remove_dir_all(root).unwrap();
    }
}

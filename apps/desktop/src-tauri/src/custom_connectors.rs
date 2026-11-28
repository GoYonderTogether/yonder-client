//! A connector package the owner's Bot wrote for this device (20261128-people-archive 03).
//!
//! A package is a directory under `<app data>/Yonder/connectors/<slug>/` holding `manifest.json`
//! and exactly one entry file. Nothing here runs the entry: this module only reads what the
//! owner was shown — the manifest, the entry's path, and the SHA-256 of the entry's bytes — so a
//! caller can compare the hash the owner confirmed with what is on disk now. The manifest's
//! shape mirrors `packages/protocol/src/connectors/custom.ts`; the optional `entry` field is
//! device-only and names the file when a package has more than one (the server never sees it).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use std::path::{Component, Path, PathBuf};

/// The slug rule the server applies (`custom-policy.ts`): lowercase letters, digits and hyphens,
/// starting with a letter, at most 40 characters. The id is `custom:<slug>` everywhere.
pub fn valid_slug(slug: &str) -> bool {
    let bytes = slug.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 40
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

/// A tool name as the server validates it: `<slug>_<name>` becomes the model tool.
pub fn valid_tool_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 40
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_')
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub mode: String,
    #[serde(default)]
    pub input: serde_json::Value,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollSpec {
    pub tool: String,
    pub every_seconds: u64,
    #[serde(default)]
    pub reason: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub brand: String,
    pub tools: Vec<ToolSpec>,
    #[serde(default)]
    pub events: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub poll: Option<PollSpec>,
    /// Device-only: which file in the package is the entry. Absent when the package has exactly one.
    #[serde(default)]
    pub entry: Option<String>,
}

impl Manifest {
    pub fn tool(&self, name: &str) -> Option<&ToolSpec> {
        self.tools.iter().find(|tool| tool.name == name)
    }
}

/// A package as it sits on disk right now. `sha256` is the entry's bytes, not the manifest's.
pub struct Package {
    pub root: PathBuf,
    pub manifest: Manifest,
    pub entry: PathBuf,
    pub sha256: String,
}

/// `<home>/Library/Application Support/Yonder` on macOS, the same shape under `%APPDATA%` on
/// Windows, and `$XDG_DATA_HOME`/`~/.local/share` elsewhere. The Bot writes packages here with its
/// terminal authorization, so the path is the contract in 03 §3 and must not move silently.
pub fn base_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = home
        .map(|home| home.join("Library").join("Application Support").join("Yonder"))
        .ok_or_else(|| "read_failed".to_string())?;
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA")
        .map(|dir| PathBuf::from(dir).join("Yonder"))
        .ok_or_else(|| "read_failed".to_string())?;
    #[cfg(not(any(target_os = "macos", windows)))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| home.map(|home| home.join(".local").join("share")))
        .map(|dir| dir.join("Yonder"))
        .ok_or_else(|| "read_failed".to_string())?;
    Ok(base)
}

pub fn packages_root() -> Result<PathBuf, String> {
    Ok(base_dir()?.join("connectors"))
}

pub fn grants_file() -> Result<PathBuf, String> {
    Ok(base_dir()?.join("custom-connector-grants.json"))
}

/// The acknowledged cursor per connection (03b).
pub fn cursors_file() -> Result<PathBuf, String> {
    Ok(base_dir()?.join("custom-connector-cursors.json"))
}

/// Batch id → the cursor it would advance to, for batches sent and not yet acknowledged. A restart
/// re-polls from the last acknowledged cursor, so this file is what keeps a lost ack from skipping
/// events; it is bounded by the batches in flight, not by history.
pub fn batches_file() -> Result<PathBuf, String> {
    Ok(base_dir()?.join("custom-connector-batches.json"))
}

/// The package directory for one slug, or a refusal if the slug could name anything else.
pub fn package_root(slug: &str) -> Result<PathBuf, String> {
    if !valid_slug(slug) {
        return Err("slug_invalid".into());
    }
    Ok(packages_root()?.join(slug))
}

fn plain_filename(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('.')
        && !name.contains(['/', '\\', ':', '\0'])
        && Path::new(name)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

/// The one entry file: the manifest's `entry` when it names one, else the single non-hidden file
/// beside `manifest.json`. A directory or symlink is never an entry.
fn entry_file(root: &Path, manifest: &Manifest) -> Result<PathBuf, String> {
    let named = manifest.entry.as_deref();
    if let Some(name) = named {
        if !plain_filename(name) {
            return Err("entry_invalid".into());
        }
        let path = root.join(name);
        let meta = fs::symlink_metadata(&path).map_err(|_| "entry_missing".to_string())?;
        if !meta.file_type().is_file() {
            return Err("entry_invalid".into());
        }
        return Ok(path);
    }
    let mut found = Vec::new();
    for item in fs::read_dir(root).map_err(|_| "entry_missing".to_string())? {
        let item = item.map_err(|_| "entry_missing".to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name == "manifest.json" || name.starts_with('.') {
            continue;
        }
        let meta = fs::symlink_metadata(item.path()).map_err(|_| "entry_invalid".to_string())?;
        if meta.file_type().is_file() {
            found.push(item.path());
        }
    }
    match found.len() {
        1 => Ok(found.remove(0)),
        _ => Err("entry_invalid".into()),
    }
}

impl Manifest {
    fn valid(&self, slug: &str) -> bool {
        if self.id != slug || self.name.trim().is_empty() || self.name.chars().count() > 80 {
            return false;
        }
        if self.tools.is_empty() || self.tools.len() > 20 {
            return false;
        }
        let mut names = std::collections::HashSet::new();
        for tool in &self.tools {
            if !valid_tool_name(&tool.name)
                || !names.insert(tool.name.as_str())
                || !matches!(tool.mode.as_str(), "query" | "act")
            {
                return false;
            }
        }
        if self.events.len() > 20 {
            return false;
        }
        for (kind, rule) in &self.events {
            let level = rule.get("level").and_then(serde_json::Value::as_u64);
            if kind.is_empty() || kind.len() > 40 || !matches!(level, Some(0 | 1)) {
                return false;
            }
        }
        if let Some(poll) = &self.poll {
            let known = self.tool(&poll.tool).is_some_and(|tool| tool.mode == "query");
            if !known || !(30..=86_400).contains(&poll.every_seconds) {
                return false;
            }
        }
        true
    }
}

/// Read one package and hash its entry. The caller compares `sha256` with the hash the owner
/// confirmed; this function never decides that on its own.
pub fn load(slug: &str, root: &Path) -> Result<Package, String> {
    if !valid_slug(slug) {
        return Err("slug_invalid".into());
    }
    let canonical = root.canonicalize().map_err(|_| "package_missing".to_string())?;
    let bytes = fs::read(canonical.join("manifest.json")).map_err(|_| "manifest_missing".to_string())?;
    if bytes.len() > 256 * 1024 {
        return Err("manifest_invalid".into());
    }
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| "manifest_invalid".to_string())?;
    if !manifest.valid(slug) {
        return Err("manifest_invalid".into());
    }
    let entry = entry_file(&canonical, &manifest)?;
    let entry = entry
        .canonicalize()
        .map_err(|_| "entry_missing".to_string())?;
    if !entry.starts_with(&canonical) {
        return Err("entry_invalid".into());
    }
    let sha256 = sha256_file(&entry)?;
    Ok(Package {
        root: canonical,
        manifest,
        entry,
        sha256,
    })
}

/// A connection id in the server's own shape: `con_` plus 26 Crockford base32 characters. The
/// device creates it, because the ready report is what creates the connection row (03 §3); the
/// server only accepts an id of this shape, so the shape is enforced here rather than guessed.
pub fn new_connection_id() -> String {
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut hasher = Sha256::new();
    hasher.update(format!(
        "{}-{}-{:?}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
        std::thread::current().id(),
        CONNECTION_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let digest = hasher.finalize();
    let mut id = String::from("con_");
    for byte in digest.iter().take(16) {
        id.push(ALPHABET[(byte % 32) as usize] as char);
    }
    // 16 bytes give 16 characters; the suffix pads with the same stream so the id is exactly 26.
    for byte in digest.iter().take(10) {
        id.push(ALPHABET[((byte / 32) % 32) as usize] as char);
    }
    id
}

static CONNECTION_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// The SHA-256 of a file's bytes, lowercase hex, streamed so a large entry is never held whole.
pub fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = fs::File::open(path).map_err(|_| "entry_missing".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|_| "entry_missing".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
#[cfg(test)]
#[path = "custom_connector_test.rs"]
mod tests;

#[cfg(test)]
#[path = "custom_connector_command_test.rs"]
mod command_tests;

#[cfg(test)]
#[path = "custom_connector_test_support.rs"]
pub(crate) mod test_support;

//! The device's own copy of a custom connector's authorization and poll cursor
//! (20261128-people-archive 03, 03b), kept under the app's Yonder directory.
//!
//! * `custom-connector-grants.json` — what the owner confirmed on this device: one connection, one
//!   slug, the entry's SHA-256, and the revision it was confirmed at. Nothing runs unless the entry
//!   on disk still hashes to that value. Only the confirm command writes it, and that command runs
//!   in the main window after the owner's tap.
//! * `custom-connector-cursors.json` — the cursor each connection's last **acknowledged** batch
//!   returned. A batch that was sent but never acknowledged is simply sent again from this same
//!   cursor after a restart, and the server's `sourceId` upsert makes the repeat harmless.
//!
//! Neither file holds a package's output, its arguments, or anything a package could have put a
//! credential in; both are keyed by ids the server itself uses.

use crate::local_files_store::Context;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// One local authorization: the exact package the owner confirmed on this device.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub owner_id: String,
    pub device_id: String,
    pub connection_id: String,
    /// The connector id in full, `custom:<slug>`; the slug names the package directory on disk.
    pub connector_id: String,
    pub slug: String,
    /// The SHA-256 the owner saw on the card and the device re-checked on disk.
    pub entry_sha256: String,
    /// The server's revision of the entry hash the owner confirmed.
    pub revision: u64,
}

impl Grant {
    pub fn matches(&self, context: &Context) -> bool {
        self.owner_id == context.owner_id && self.device_id == context.device_id
    }
}

/// `custom:<slug>`'s slug, or `None` for any other connector id.
pub fn slug_of(connector_id: &str) -> Option<&str> {
    connector_id
        .strip_prefix("custom:")
        .filter(|slug| crate::custom_connectors::valid_slug(slug))
}

/// A 64-character lowercase hex SHA-256, the only hash a grant may carry.
pub fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Read the grant list; a missing file is an empty list, an unreadable one is refused.
pub fn load_grants(file: &Path) -> Result<Vec<Grant>, String> {
    match fs::read(file) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "read_failed".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(_) => Err("read_failed".into()),
    }
}

/// Replace the grant for one connection of this owner and device; everything else is kept.
pub fn upsert_grant(grants: &mut Vec<Grant>, grant: Grant) {
    grants.retain(|item| {
        !(item.owner_id == grant.owner_id && item.device_id == grant.device_id && item.connection_id == grant.connection_id)
    });
    grants.push(grant);
}

/// The grant a call may use: the exact connection, at the exact revision, for this owner and
/// device. Absent is `permission_denied`; a different revision is `needs_reauth` — the state the
/// card shows — because that connection now names a package this device has not confirmed.
pub fn authorize<'a>(
    grants: &'a [Grant],
    context: &Context,
    connection_id: &str,
    revision: u64,
) -> Result<&'a Grant, String> {
    let grant = grants
        .iter()
        .find(|item| item.matches(context) && item.connection_id == connection_id)
        .ok_or_else(|| "permission_denied".to_string())?;
    if grant.revision != revision {
        return Err("needs_reauth".into());
    }
    Ok(grant)
}

/// Connection id → the cursor its last acknowledged batch returned.
pub type Cursors = BTreeMap<String, String>;

pub fn load_cursors(file: &Path) -> Result<Cursors, String> {
    match fs::read(file) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "read_failed".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Cursors::new()),
        Err(_) => Err("read_failed".into()),
    }
}

/// The cursor a poll of one connection starts from; empty for a package's first poll.
pub fn cursor_of(cursors: &Cursors, connection_id: &str) -> String {
    cursors.get(connection_id).cloned().unwrap_or_default()
}

/// A batch's ack landed: only now does the cursor move. This is the one writer of `Cursors`, so an
/// unacknowledged batch cannot be skipped by anything else in the process; a restart re-polls from
/// the last cursor the server acknowledged, and its `sourceId` upsert absorbs the repeat.
pub fn commit_ack(cursors: &mut Cursors, connection_id: &str, cursor: &str) {
    cursors.insert(connection_id.to_owned(), cursor.to_owned());
}

pub fn save_cursors(file: &Path, cursors: &Cursors) -> Result<(), String> {
    write_atomic(file, &serde_json::to_vec(cursors).map_err(|_| "read_failed".to_string())?)
}

/// Batch id → the cursor that batch would advance to. A collect writes one entry; only the ack
/// consumes it. It is what makes an unacknowledged batch resend the same events after a restart,
/// rather than skip them because the entry already ran.
pub type Pending = BTreeMap<String, String>;

pub fn load_pending(file: &Path) -> Result<Pending, String> {
    match fs::read(file) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "read_failed".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Pending::new()),
        Err(_) => Err("read_failed".into()),
    }
}

pub fn save_pending(file: &Path, pending: &Pending) -> Result<(), String> {
    write_atomic(file, &serde_json::to_vec(pending).map_err(|_| "read_failed".to_string())?)
}

pub fn save_grants(file: &Path, grants: &[Grant]) -> Result<(), String> {
    write_atomic(file, &serde_json::to_vec(grants).map_err(|_| "read_failed".to_string())?)
}

/// Write a small file atomically and owner-only on Unix; a crash leaves the old copy, never half
/// of the new one.
fn write_atomic(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = file.parent().ok_or("read_failed")?;
    fs::create_dir_all(parent).map_err(|_| "read_failed".to_string())?;
    let temp: PathBuf = file.with_extension(format!("{}.tmp", std::process::id()));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut output = options.open(&temp).map_err(|_| "read_failed".to_string())?;
        output.write_all(bytes).map_err(|_| "read_failed".to_string())?;
        output.sync_all().map_err(|_| "read_failed".to_string())?;
        fs::rename(&temp, file).map_err(|_| "read_failed".to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
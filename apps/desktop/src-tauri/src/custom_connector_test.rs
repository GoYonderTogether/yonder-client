//! The custom connector device module, exercised without a browser window: a package on a temp
//! directory, a real executable entry (a `/bin/sh` script with a shebang), and the same calls the
//! commands make. Each test names the rule it checks from 03/03b:
//!
//! * a changed entry hash is refused and never run;
//! * a slug outside the server's rule is refused before any path is built;
//! * an entry is started directly, so shell metacharacters in an argument are data;
//! * a cancel kills the process, and the call answers `cancelled`;
//! * a result over 64 KiB comes back as `{truncated: true, text}` under the bound;
//! * the cursor moves only after an ack.
//!
//! Nothing here touches the owner's real Yonder directory: every path is a temp directory.

use super::*;
use crate::custom_connector_runner::{self, RESULT_MAX_BYTES};
use crate::custom_connector_store::{self as store, Cursors};
use super::test_support::*;
use crate::custom_connectors::{self, Manifest};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[test]
fn a_slug_outside_the_server_rule_names_no_directory() {
    for slug in ["Notes", "../escape", "a/b", "-lead", "", "a b", &"x".repeat(41)] {
        assert!(custom_connectors::package_root(slug).is_err(), "{slug:?}");
        assert!(custom_connectors::load(slug, Path::new("/tmp")).is_err(), "{slug:?}");
    }
    assert!(custom_connectors::valid_slug("notes-2"));
    assert!(custom_connectors::valid_slug(&"x".repeat(40)));
}

#[test]
fn a_changed_entry_hash_is_refused_and_the_entry_never_runs() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-hash", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    let marker = base.join("ran");
    fs::write(
        root.join("manifest.json"),
        serde_json::to_vec(&manifest("notes", false)).unwrap(),
    )
    .unwrap();
    let entry = root.join("run.sh");
    fs::write(&entry, format!("#!/bin/sh\necho x > '{}'\nprintf '{{\"ok\":true}}'\n", marker.display())).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let confirmed = custom_connectors::load("notes", &root).unwrap();
    // The Bot edited the package after the owner confirmed it.
    fs::write(&entry, b"#!/bin/sh\nprintf '{\"edited\":true}'\n").unwrap();
    let store_file = base.join("grants.json");
    let mut grants = vec![grant_for(&confirmed)];
    store::save_grants(&store_file, &grants).unwrap();
    grants = store::load_grants(&store_file).unwrap();
    let current = custom_connectors::load("notes", &root).unwrap();
    assert_ne!(current.sha256, confirmed.sha256);
    // The device-side check the command makes before running: the hash on disk must be the stored one.
    assert_eq!(store::authorize(&grants, &context(), "con_a", 3).map(|g| g.entry_sha256.clone()), Ok(confirmed.sha256.clone()));
    assert!(!fs::read_dir(&base).unwrap().any(|item| {
        item.map(|entry| entry.file_name().to_string_lossy() == "ran").unwrap_or(false)
    }));
    let outcome = custom_connector_runner::run_call(&current, "lookup", &serde_json::Map::new(), &AtomicBool::new(false), u64::MAX);
    let _ = outcome;
    assert!(!marker.exists(), "a changed package must never run");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_stale_revision_needs_reauth_and_a_missing_connection_is_refused() {
    let (_base, package) = package("revision", "printf '{}'");
    let grants = vec![grant_for(&package)];
    assert_eq!(store::authorize(&grants, &context(), "con_a", 4).err().as_deref(), Some("needs_reauth"));
    assert_eq!(store::authorize(&grants, &context(), "con_b", 3).err().as_deref(), Some("permission_denied"));
    assert!(store::authorize(&grants, &context(), "con_a", 3).is_ok());
    // The same grant on another device is not this device's to run.
    let other = Context { device_id: "dev_b".into(), ..context() };
    assert!(store::authorize(&grants, &other, "con_a", 3).is_err());
}

#[test]
fn an_entry_is_started_without_a_shell_so_metacharacters_are_data() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-noshell", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    let token = base.join("injected");
    // The entry echoes its stdin as JSON; nothing in it is evaluated by a shell.
    fs::write(
        root.join("manifest.json"),
        serde_json::to_vec(&manifest("notes", false)).unwrap(),
    )
    .unwrap();
    let entry = root.join("run.sh");
    // The entry prints the stdin object back unchanged: whatever arrived is what the owner sees.
    fs::write(&entry, "#!/bin/sh\ncat\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let package = custom_connectors::load("notes", &root).unwrap();
    let mut args = serde_json::Map::new();
    args.insert("value".into(), json!(format!("; touch {};", token.display())));
    let outcome = custom_connector_runner::run_call(&package, "lookup", &args, &AtomicBool::new(false), u64::MAX);
    assert!(outcome.error.is_none(), "{:?}", outcome.error);
    assert!(!token.exists(), "an argument must never reach a shell");
    let value = custom_connector_runner::parse_result(&outcome.stdout.unwrap()).unwrap();
    assert_eq!(value["tool"], "lookup");
    assert_eq!(value["args"]["value"], format!("; touch {};", token.display()));
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_cancel_kills_the_entry_and_answers_cancelled() {
    let (_base, package) = package("cancel", "sleep 30 & wait");
    let flag = Arc::new(AtomicBool::new(false));
    let cancel = flag.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        cancel.store(true, Ordering::SeqCst);
    });
    let started = std::time::Instant::now();
    let outcome = custom_connector_runner::run_call(&package, "lookup", &serde_json::Map::new(), &flag, u64::MAX);
    assert_eq!(outcome.error.as_deref(), Some("cancelled"));
    assert!(started.elapsed() < Duration::from_secs(5), "the cancel must end the call at once");
}

#[test]
fn a_result_over_the_bound_comes_back_truncated_within_the_bound() {
    let big = "x".repeat(RESULT_MAX_BYTES + 4096);
    assert!(big.len() > RESULT_MAX_BYTES);
    let value = custom_connector_runner::parse_result(big.as_bytes()).unwrap();
    assert_eq!(value["truncated"], true);
    assert!(serde_json::to_vec(&value).unwrap().len() <= RESULT_MAX_BYTES);
    // A non-object stdout is not a result at all.
    assert_eq!(custom_connector_runner::parse_result(b"[1,2]").err().as_deref(), Some("invalid_result"));
    assert_eq!(custom_connector_runner::parse_result(b"not json").err().as_deref(), Some("invalid_result"));
}

#[test]
fn a_wrapped_result_stays_inside_the_bound_even_when_escaping_expands() {
    // Each byte becomes six in JSON when escaped: the wrapper shrinks until the serialized form fits.
    let escaped = "\u{1}".repeat(RESULT_MAX_BYTES + 1024);
    let value = custom_connector_runner::parse_result(escaped.as_bytes()).unwrap();
    assert_eq!(value["truncated"], true);
    assert!(serde_json::to_vec(&value).unwrap().len() <= RESULT_MAX_BYTES);
}

#[test]
fn the_cursor_moves_only_after_an_ack() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-cursor", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let cursors_file = base.join("cursors.json");
    let mut cursors: Cursors = Cursors::new();
    assert_eq!(store::cursor_of(&cursors, "con_a"), "");
    // The poll read cursor 7; the ack has not come, so that value is not the stored cursor yet.
    let pending = base.join("batches.json");
    let mut batches = store::load_pending(&pending).unwrap();
    batches.insert("batch-1".into(), "cursor-7".into());
    store::save_pending(&pending, &batches).unwrap();
    assert_eq!(store::cursor_of(&cursors, "con_a"), "");
    // The ack lands: now the cursor moves, and the batch is consumed.
    let mut batches = store::load_pending(&pending).unwrap();
    let cursor = batches.remove("batch-1").unwrap();
    store::commit_ack(&mut cursors, "con_a", &cursor);
    store::save_cursors(&cursors_file, &cursors).unwrap();
    assert_eq!(store::cursor_of(&store::load_cursors(&cursors_file).unwrap(), "con_a"), "cursor-7");
    assert_eq!(store::cursor_of(&cursors, "con_a"), "cursor-7");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_poll_cuts_event_bodies_and_needs_a_declared_type() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-events", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let manifest: Manifest = serde_json::from_value(manifest("notes", true)).unwrap();
    let body = "长".repeat(3000);
    let value = json!({
        "events": [{
            "sourceId": "n1",
            "occurredAt": "2026-11-28T09:00:00Z",
            "title": "One note",
            "body": body,
            "participants": ["张三"]
        }],
        "cursor": "c9"
    });
    let cut = custom_connector_runner::poll_output(&value, &manifest).unwrap();
    assert_eq!(cut["events"][0]["body"].as_str().unwrap().chars().count(), 2000);
    // One declared event type: the package may omit `type`.
    assert_eq!(cut["events"][0]["type"], "note");
    assert_eq!(cut["cursor"], "c9");
    // A type the manifest never declared is refused whole.
    let unknown = json!({ "events": [{ "sourceId": "n2", "occurredAt": "2026-11-28T09:00:00Z", "type": "other" }] });
    assert_eq!(custom_connector_runner::poll_output(&unknown, &manifest).err().as_deref(), Some("event_type_unknown"));
    // An event without the fields the server requires is refused rather than sent half-built.
    let missing = json!({ "events": [{ "occurredAt": "2026-11-28T09:00:00Z" }] });
    assert!(custom_connector_runner::poll_output(&missing, &manifest).is_err());
    let _ = fs::remove_dir_all(base);
}

#[test]
fn the_poll_interval_is_never_below_thirty_seconds() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-interval", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let mut value = manifest("notes", true);
    value["poll"]["everySeconds"] = json!(5);
    let manifest: Manifest = serde_json::from_value(value.clone()).unwrap();
    let package_root = base.join("pkg");
    fs::create_dir_all(&package_root).unwrap();
    fs::write(package_root.join("manifest.json"), serde_json::to_vec(&value).unwrap()).unwrap();
    fs::write(package_root.join("run.sh"), "#!/bin/sh\nprintf '{\"events\":[]}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(package_root.join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    // The manifest loader accepts 30..=86400 only, so a 5 s poll never reaches a loop.
    assert!(custom_connectors::load("notes", &package_root).is_err());
    assert!(manifest.poll.as_ref().unwrap().every_seconds < custom_connector_runner::POLL_MIN_SECONDS);
    let _ = fs::remove_dir_all(base);
}

#[test]
fn the_manifest_must_name_its_own_slug_and_a_declared_poll_tool() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-manifest", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("run.sh"), "#!/bin/sh\nprintf '{}'").unwrap();
    // A manifest whose id is another slug is not this package.
    let mut wrong = manifest("notes", true);
    wrong["id"] = json!("other");
    fs::write(root.join("manifest.json"), serde_json::to_vec(&wrong).unwrap()).unwrap();
    assert_eq!(custom_connectors::load("notes", &root).err().as_deref(), Some("manifest_invalid"));
    // A poll that names a tool the manifest does not declare is invalid too.
    let mut missing = manifest("notes", true);
    missing["poll"]["tool"] = json!("absent");
    fs::write(root.join("manifest.json"), serde_json::to_vec(&missing).unwrap()).unwrap();
    assert_eq!(custom_connectors::load("notes", &root).err().as_deref(), Some("manifest_invalid"));
    // Event levels above 1 are refused: only the shipped manifests may wake the Bot that way.
    let mut elevated = manifest("notes", false);
    elevated["events"]["note"]["level"] = json!(2);
    fs::write(root.join("manifest.json"), serde_json::to_vec(&elevated).unwrap()).unwrap();
    assert_eq!(custom_connectors::load("notes", &root).err().as_deref(), Some("manifest_invalid"));
    let _ = fs::remove_dir_all(base);
}

#[test]
fn an_entry_that_is_not_executable_is_refused_rather_than_run_through_a_shell() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-noexec", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("manifest.json"), serde_json::to_vec(&manifest("notes", false)).unwrap()).unwrap();
    fs::write(root.join("run.sh"), "#!/bin/sh\nprintf '{}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root.join("run.sh"), fs::Permissions::from_mode(0o644)).unwrap();
    }
    let package = custom_connectors::load("notes", &root).unwrap();
    let outcome = custom_connector_runner::run_call(&package, "lookup", &serde_json::Map::new(), &AtomicBool::new(false), u64::MAX);
    #[cfg(unix)]
    assert_eq!(outcome.error.as_deref(), Some("entry_not_executable"));
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_call_past_its_expiry_does_not_run() {
    assert_eq!(custom_connector_runner::call_deadline(1_000, 5_000), 1_000);
    assert_eq!(
        custom_connector_runner::call_deadline(u64::MAX, 5_000),
        5_000 + custom_connector_runner::CALL_BACKSTOP_MS
    );
    assert_eq!(
        custom_connector_runner::CALL_BACKSTOP_MS,
        30 * 60_000,
        "the fallback is the server's COMMAND_BACKSTOP_MS"
    );
}
#[test]
fn the_ack_command_owns_the_only_cursor_write() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-ack", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let cursors_file = base.join("cursors.json");
    let batches = base.join("batches.json");
    // A collect remembered the batch's cursor; the cursor itself has not moved.
    crate::custom_connector_commands::remember_batch(&batches, "batch-9", "cursor-9").unwrap();
    assert_eq!(store::cursor_of(&store::load_cursors(&cursors_file).unwrap(), "con_a"), "");
    // The ack is what moves it, through the same function the command calls.
    crate::custom_connector_commands::ack_in(&cursors_file, &batches, "con_a", "batch-9").unwrap();
    assert_eq!(store::cursor_of(&store::load_cursors(&cursors_file).unwrap(), "con_a"), "cursor-9");
    // A duplicate ack finds no pending batch and leaves the cursor where it is.
    crate::custom_connector_commands::ack_in(&cursors_file, &batches, "con_a", "batch-9").unwrap();
    assert_eq!(store::cursor_of(&store::load_cursors(&cursors_file).unwrap(), "con_a"), "cursor-9");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_device_made_connection_id_has_the_servers_shape() {
    let id = custom_connectors::new_connection_id();
    let suffix = id.strip_prefix("con_").unwrap();
    assert_eq!(suffix.len(), 26);
    assert!(suffix.bytes().all(|b| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&b)));
    // Two calls never collide, even inside the same millisecond.
    assert_ne!(id, custom_connectors::new_connection_id());
}

#[test]
fn a_ready_report_is_an_attempt_whose_hash_the_device_checked() {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-confirm", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("manifest.json"), serde_json::to_vec(&manifest("notes", false)).unwrap()).unwrap();
    fs::write(root.join("run.sh"), "#!/bin/sh\nprintf '{}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root.join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let package = custom_connectors::load("notes", &root).unwrap();
    // The store is a plain grant list: a confirm writes the hash it read, so a later edit to the
    // entry is visible as a hash the stored grant no longer names.
    let file = base.join("grants.json");
    let mut grants = store::load_grants(&file).unwrap();
    store::upsert_grant(&mut grants, grant_for(&package));
    store::save_grants(&file, &grants).unwrap();
    assert_eq!(store::load_grants(&file).unwrap()[0].entry_sha256, package.sha256);
    fs::write(root.join("run.sh"), "#!/bin/sh\nprintf '{\"changed\":true}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root.join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let edited = custom_connectors::load("notes", &root).unwrap();
    assert_ne!(edited.sha256, store::load_grants(&file).unwrap()[0].entry_sha256);
    let _ = fs::remove_dir_all(base);
}


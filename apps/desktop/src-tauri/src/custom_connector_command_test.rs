//! The command layer's own behaviour, without a window: the confirm's hash check, a call's four
//! refusals, a live poll, and the ack. Each uses temp directories, so the owner's real Yonder
//! directory is never touched, and the same functions the Tauri commands call are exercised.

use super::test_support::*;
use crate::custom_connector_runner;
use crate::custom_connectors;
use crate::custom_connector_store::{self as store, Cursors};
use std::sync::atomic::AtomicBool;
use serde_json::json;
use std::fs;

#[test]
fn a_call_is_refused_by_its_grant_hash_manifest_and_deadline_before_anything_runs() {
    use crate::custom_connector_commands::{check_call, confirm_in, CallInput, ConfirmInput};
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-check", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let packages = base.join("connectors");
    let root = packages.join("notes");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("manifest.json"), serde_json::to_vec(&manifest("notes", false)).unwrap()).unwrap();
    let entry = root.join("run.sh");
    fs::write(&entry, "#!/bin/sh\ncat\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let package = custom_connectors::load("notes", &root).unwrap();
    let grants_file = base.join("grants.json");
    // Confirming the package writes the grant the call is then checked against.
    let (grant, _) = confirm_in(
        &grants_file,
        &packages,
        &context(),
        &ConfirmInput {
            connection_id: Some("con_0123456789ABCDEFGHJKMNPQRS".into()),
            revision: 2,
            slug: "notes".into(),
            entry_sha256: package.sha256.clone(),
        },
    )
    .unwrap();
    assert_eq!(grant.connection_id.len(), 30);
    let valid = CallInput {
        call_id: "ccc_1".into(),
        connection_id: grant.connection_id.clone(),
        revision: 2,
        tool: "lookup".into(),
        args: json!({}),
        expires_at: "2030-01-01T00:00:00.000Z".into(),
    };
    assert!(check_call(&grants_file, &packages, &context(), &valid, 1).is_ok());
    // The manifest does not declare this tool.
    assert_eq!(
        check_call(&grants_file, &packages, &context(), &CallInput { tool: "not_a_tool".into(), ..valid.clone() }, 1)
            .err()
            .as_deref(),
        Some("tool_unknown")
    );
    // Past the deadline the entry does not start.
    assert_eq!(
        check_call(&grants_file, &packages, &context(), &valid, 1_900_000_000_000).err().as_deref(),
        Some("cancelled")
    );
    // The Bot edited the entry after confirmation: no call against the stored hash may run.
    fs::write(&entry, "#!/bin/sh\nprintf '{\"edited\":true}'\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    assert_eq!(
        check_call(&grants_file, &packages, &context(), &valid, 1).err().as_deref(),
        Some("needs_reauth")
    );
    // Confirming the edited package with the hash the card would now show re-authorizes it.
    let edited = custom_connectors::load("notes", &root).unwrap();
    confirm_in(
        &grants_file,
        &packages,
        &context(),
        &ConfirmInput {
            connection_id: Some(grant.connection_id.clone()),
            revision: 3,
            slug: "notes".into(),
            entry_sha256: edited.sha256,
        },
    )
    .unwrap();
    assert_eq!(
        check_call(&grants_file, &packages, &context(), &CallInput { revision: 3, ..valid }, 1).err().as_deref(),
        None
    );
    let _ = fs::remove_dir_all(base);
}

#[test]
fn a_poll_runs_the_manifest_tool_and_returns_its_cut_batch() {
    let (base, root) = sandbox(
        "polllive",
        "cat >/dev/null\nprintf '{\"events\":[{\"sourceId\":\"n1\",\"occurredAt\":\"2026-11-28T01:00:00Z\",\"title\":\"t\",\"body\":\"b\"}],\"cursor\":\"c2\"}'",
        manifest("notes", true),
    );
    let package = custom_connectors::load("notes", &root).unwrap();
    let cursors: Cursors = Cursors::new();
    let (events, cursor) = custom_connector_runner::poll(&package, &cursors, "con_a", &AtomicBool::new(false)).unwrap();
    assert_eq!(events.as_array().unwrap().len(), 1);
    assert_eq!(events[0]["type"], "note");
    assert_eq!(cursor.as_deref(), Some("c2"));
    let _ = fs::remove_dir_all(base);
}
#[test]
fn a_changed_entry_names_the_observed_hash_for_the_ready_report() {
    use crate::custom_connector_commands::reauth_report;
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-reauth", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let packages = base.join("connectors");
    let root = packages.join("notes");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("manifest.json"), serde_json::to_vec(&manifest("notes", false)).unwrap()).unwrap();
    let entry = root.join("run.sh");
    fs::write(&entry, "#!/bin/sh\nprintf '{}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let package = custom_connectors::load("notes", &root).unwrap();
    let grants_file = base.join("grants.json");
    store::save_grants(&grants_file, &[grant_for(&package)]).unwrap();
    // Nothing changed: no reauth report to send.
    assert!(reauth_report(&grants_file, &packages, &context(), "con_a").is_none());
    // The Bot edited the entry: the report carries the hash the device now holds, at the confirmed
    // revision, so the server can move the row to needs_reauth.
    fs::write(&entry, "#!/bin/sh\nprintf '{\"edited\":1}'").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let edited = custom_connectors::load("notes", &root).unwrap();
    assert_eq!(
        reauth_report(&grants_file, &packages, &context(), "con_a"),
        Some(("notes".to_string(), edited.sha256, 3))
    );
    // Another device's context gets nothing: the report is this device's own observation.
    let other = Context { device_id: "dev_b".into(), ..context() };
    assert!(reauth_report(&grants_file, &packages, &other, "con_a").is_none());
    let _ = fs::remove_dir_all(base);
}

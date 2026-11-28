//! Fixtures for the custom connector tests: a temp package directory, its manifest, a loaded
//! package and a matching grant. Shared by the runner tests and the command tests so both start
//! from the same package and neither touches the owner's real Yonder directory.

use crate::custom_connector_store as store;
use crate::custom_connectors;
pub use crate::local_files_store::Context;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

/// A temp package directory with a `manifest.json` and one executable entry script.
pub fn sandbox(name: &str, body: &str, manifest: serde_json::Value) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!("yonder-custom-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    let root = base.join("pkg");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("manifest.json"), serde_json::to_vec(&manifest).unwrap()).unwrap();
    let entry = root.join("run.sh");
    fs::write(&entry, format!("#!/bin/sh\n{body}\n")).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&entry, fs::Permissions::from_mode(0o755)).unwrap();
    }
    (base, root)
}

pub fn manifest(slug: &str, poll: bool) -> serde_json::Value {
    json!({
        "id": slug,
        "name": "Fixture package",
        "description": "Reads one thing.",
        "brand": slug,
        "tools": [
            { "name": "lookup", "description": "Read one thing.", "mode": "query",
              "input": { "type": "object", "additionalProperties": false } },
            { "name": "write", "description": "Write one thing.", "mode": "act",
              "input": { "type": "object", "additionalProperties": false } }
        ],
        "events": { "note": { "level": 1, "timeline": "direct", "weight": 1, "visibility": "private", "reason": "Notes the owner asked for." } },
        "poll": poll.then(|| json!({ "tool": "lookup", "everySeconds": 60, "reason": "Cheap to read." }))
            .filter(|value| !value.is_null())
            .map(|value| value)
    })
}

/// A loaded package plus a matching confirmed grant, for a test that wants to get past the checks.
pub fn package(name: &str, body: &str) -> (PathBuf, custom_connectors::Package) {
    let (base, root) = sandbox(name, body, manifest("notes", true));
    let package = custom_connectors::load("notes", &root).unwrap();
    (base, package)
}

pub fn grant_for(package: &custom_connectors::Package) -> store::Grant {
    store::Grant {
        owner_id: "mem_a".into(),
        device_id: "dev_a".into(),
        connection_id: "con_a".into(),
        connector_id: "custom:notes".into(),
        slug: "notes".into(),
        entry_sha256: package.sha256.clone(),
        revision: 3,
    }
}

pub fn context() -> Context {
    Context {
        owner_id: "mem_a".into(),
        device_id: "dev_a".into(),
        session_id: "ses_a".into(),
    }
}


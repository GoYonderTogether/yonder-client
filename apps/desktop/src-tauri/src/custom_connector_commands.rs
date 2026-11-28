//! The native commands a Bot-written connector package runs through (20261128-people-archive 03).
//!
//! Every command is main-window only and runs its file work off the IPC thread:
//!
//! * `custom_connector_confirm` — the owner's tap on the card, on this device. Reads the package at
//!   `<app data>/Yonder/connectors/<slug>/`, checks its entry hashes to the value the card showed,
//!   writes the local grant, and reports `connector.custom.ready`.
//! * `custom_connector_execute` / `custom_connector_cancel` — one call, and its cancel flag.
//! * `custom_connector_poll` — which of this session's connections poll, and at what interval.
//! * `custom_connector_collect` — one poll, driven by the webview at the manifest's interval.
//! * `custom_connector_ack` — the server wrote the batch; only now does the cursor move.
//!
//! The commands hold no timer of their own. The webview knows when a poll is due and asks for one
//! at a time, so each native command stays bounded and testable, and `poll.everySeconds` is read in
//! one place: the manifest.

use crate::custom_connector_runner;
use crate::custom_connector_store::{self, Cursors, Grant};
use crate::custom_connector_paths as paths;
use crate::custom_connector_support::{main_window, parse_iso_ms, CustomConnectorState};
use crate::custom_connectors::{self, Package};
use crate::local_files_store::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

/// The answer to one call, serialized on the realtime wire with the protocol's own field names.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallReply {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl CallReply {
    fn ok(result: Value) -> CallReply {
        CallReply { ok: true, result: Some(result), error: None }
    }
    pub fn fail(code: &str) -> CallReply {
        CallReply { ok: false, result: None, error: Some(code.into()) }
    }
    /// The reply for a runner outcome; a cancelled call is always `cancelled`, whatever it printed.
    fn from_outcome(outcome: custom_connector_runner::Outcome) -> CallReply {
        match (outcome.error, outcome.stdout) {
            (Some(code), _) => CallReply::fail(&code),
            (None, Some(bytes)) => match custom_connector_runner::parse_result(&bytes) {
                Ok(value) => CallReply::ok(value),
                Err(code) => CallReply::fail(&code),
            },
            (None, None) => CallReply::fail("invalid_result"),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallInput {
    pub call_id: String,
    pub connection_id: String,
    pub revision: u64,
    pub tool: String,
    #[serde(default)]
    pub args: Value,
    pub expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmInput {
    /// Empty for a first confirmation: nothing created this connection yet, so the device makes
    /// the id and the server's ready report creates the row with it (03 §3).
    #[serde(default)]
    pub connection_id: Option<String>,
    pub revision: u64,
    pub slug: String,
    pub entry_sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollTarget {
    connection_id: String,
    connector_id: String,
    revision: u64,
}

/// One polled batch for the webview. The cursor rides along, but the shell has **not** advanced it:
/// only the ack's command writes it, so a batch lost between send and ack is sent again.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolledBatch {
    connection_id: String,
    revision: u64,
    batch_id: String,
    events: Vec<Value>,
}


async fn off_thread<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "read_failed".to_string())?
}

/// Read the package the card named from its standard directory and check it is the confirmed one.
pub fn confirmed_package(packages_root: &std::path::Path, slug: &str, entry_sha256: &str) -> Result<Package, String> {
    if !custom_connectors::valid_slug(slug) {
        return Err("slug_invalid".into());
    }
    if !custom_connector_store::valid_sha256(entry_sha256) {
        return Err("entry_invalid".into());
    }
    let package = custom_connectors::load(slug, &packages_root.join(slug))?;
    // The hash the owner saw is the whole authorization: a package that changed after the card was
    // posted is not the one they agreed to, and nothing is written for it.
    if package.sha256 != entry_sha256 {
        return Err("needs_reauth".into());
    }
    Ok(package)
}

fn grant_file() -> Result<std::path::PathBuf, String> {
    paths::grants_file()
}

fn cursors_file() -> Result<std::path::PathBuf, String> {
    paths::cursors_file()
}

/// confirm / execute / collect / ack share one body: read grants, then act. Kept here so each
/// command's own function stays a thin wrapper a test can call with a temp directory.
pub fn confirm_in(
    file: &std::path::Path,
    packages_root: &std::path::Path,
    context: &Context,
    input: &ConfirmInput,
) -> Result<(Grant, String), String> {
    if !context.valid() || input.revision == 0 {
        return Err("permission_denied".into());
    }
    let connection_id = match input.connection_id.as_deref().filter(|value| !value.is_empty()) {
        Some(value) if value.starts_with("con_") && value.len() == 30 => value.to_owned(),
        Some(_) => return Err("permission_denied".into()),
        None => custom_connectors::new_connection_id(),
    };
    let package = confirmed_package(packages_root, &input.slug, &input.entry_sha256)?;
    let mut grants = custom_connector_store::load_grants(file)?;
    custom_connector_store::upsert_grant(
        &mut grants,
        Grant {
            owner_id: context.owner_id.clone(),
            device_id: context.device_id.clone(),
            connection_id: connection_id.clone(),
            connector_id: format!("custom:{}", input.slug),
            slug: input.slug.clone(),
            entry_sha256: package.sha256.clone(),
            revision: input.revision,
        },
    );
    custom_connector_store::save_grants(file, &grants)?;
    Ok((
        Grant {
            owner_id: context.owner_id.clone(),
            device_id: context.device_id.clone(),
            connection_id,
            connector_id: format!("custom:{}", input.slug),
            slug: input.slug.clone(),
            entry_sha256: package.sha256.clone(),
            revision: input.revision,
        },
        input.slug.clone(),
    ))
}

/// The owner confirmed this package on this device. Writes the grant and reports it ready; a hash
/// mismatch writes nothing, so the card can show `needs_reauth` and the Bot re-proposes.
#[tauri::command]
pub async fn custom_connector_confirm(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    confirm: ConfirmInput,
) -> Result<Value, String> {
    main_window(&window)?;
    let revision = confirm.revision;
    off_thread(move || {
        let (grant, slug) = confirm_in(&grant_file()?, &paths::packages_root()?, &context, &confirm)?;
        let connection_id = grant.connection_id.clone();
        let _ = app.emit_to(
            "main",
            "custom-connector-ready",
            json!({
                "type": "connector.custom.ready",
                "connectionId": connection_id,
                "slug": slug,
                "entrySha256": grant.entry_sha256,
                "revision": revision,
            }),
        );
        Ok(json!("ok"))
    })
    .await
}

/// One call, checked in the order the owner's consent narrows: a grant for this connection, the
/// confirmed revision, the entry on disk still hashing to the confirmed value, the tool declared by
/// the manifest, and a deadline still ahead.
/// The checks before an entry runs, with the files they read named so a test drives the same code:
/// a grant for this connection at this revision, the package on disk hashing to the confirmed
/// value, the tool the manifest declares, and a deadline still ahead.
pub fn check_call(
    grants_file: &std::path::Path,
    packages_root: &std::path::Path,
    context: &Context,
    call: &CallInput,
    now: u64,
) -> Result<(Package, u64), String> {
    let grants = custom_connector_store::load_grants(grants_file)?;
    let grant = custom_connector_store::authorize(&grants, context, &call.connection_id, call.revision)?.clone();
    let package = custom_connectors::load(&grant.slug, &packages_root.join(&grant.slug))?;
    // A package whose entry changed is never run: that is exactly the case the owner's confirmation
    // exists for, and the server turns the connector to needs_reauth on the report that follows.
    if package.sha256 != grant.entry_sha256 {
        return Err("needs_reauth".into());
    }
    if package.manifest.tool(&call.tool).is_none() {
        return Err("tool_unknown".into());
    }
    let expires_ms = parse_iso_ms(&call.expires_at).ok_or_else(|| "cancelled".to_string())?;
    if now >= expires_ms {
        return Err("cancelled".into());
    }
    Ok((package, expires_ms))
}

/// What a hash change is reported as: the package's own slug, the hash observed on disk, and the
/// revision this device had confirmed. The server turns an installed connector to `needs_reauth`
/// only on a ready report naming a different hash, so the refusal alone would leave its row stale.
pub fn reauth_report(
    grants_file: &std::path::Path,
    packages_root: &std::path::Path,
    context: &Context,
    connection_id: &str,
) -> Option<(String, String, u64)> {
    let grants = custom_connector_store::load_grants(grants_file).ok()?;
    let grant = grants
        .iter()
        .find(|item| item.matches(context) && item.connection_id == connection_id)?;
    let package = custom_connectors::load(&grant.slug, &packages_root.join(&grant.slug)).ok()?;
    (package.sha256 != grant.entry_sha256).then(|| (grant.slug.clone(), package.sha256.clone(), grant.revision))
}

pub async fn execute_call(app: AppHandle, context: Context, call: &CallInput) -> Result<CallReply, String> {
    let grants_file = grant_file()?;
    let packages_root = paths::packages_root()?;
    let (package, expires_ms) = match check_call(
        &grants_file,
        &packages_root,
        &context,
        call,
        custom_connector_runner::now_ms(),
    ) {
        Ok(found) => found,
        Err(code) => {
            // A hash change is reported as a ready report with the hash the device now holds: that
            // is the one thing that moves the server's row to needs_reauth (03 §5).
            if code == "needs_reauth" {
                if let Some((slug, sha256, revision)) =
                    reauth_report(&grants_file, &packages_root, &context, &call.connection_id)
                {
                    let _ = app.emit_to(
                        "main",
                        "custom-connector-ready",
                        json!({
                            "type": "connector.custom.ready",
                            "connectionId": call.connection_id,
                            "slug": slug,
                            "entrySha256": sha256,
                            "revision": revision,
                        }),
                    );
                }
            }
            return Ok(CallReply::fail(&code));
        }
    };
    let Value::Object(args) = &call.args else {
        return Ok(CallReply::fail("invalid_arguments"));
    };
    let flag = Arc::new(AtomicBool::new(false));
    let state = app.state::<CustomConnectorState>();
    state.track(&call.call_id, &call.connection_id, flag.clone());
    let outcome = custom_connector_runner::run_call(&package, &call.tool, args, &flag, expires_ms);
    state.untrack(&call.call_id);
    // A cancel and a normal exit can race; the flag is the truth, because the answer must never
    // look like a result the server would accept after it gave up.
    if flag.load(Ordering::SeqCst) {
        return Ok(CallReply::fail("cancelled"));
    }
    Ok(CallReply::from_outcome(outcome))
}

#[tauri::command]
pub async fn custom_connector_execute(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    call: CallInput,
) -> Result<CallReply, String> {
    main_window(&window)?;
    if !context.valid() {
        return Ok(CallReply::fail("permission_denied"));
    }
    let app = app.clone();
    let call = call;
    off_thread(move || tauri::async_runtime::block_on(execute_call(app, context, &call))).await
}

/// Cancel one call by `callId`: the runner's flag is set and the entry's process group is killed on
/// its next 25 ms tick.
#[tauri::command]
pub async fn custom_connector_cancel(app: AppHandle, window: WebviewWindow, call_id: String) -> Result<(), String> {
    main_window(&window)?;
    app.state::<CustomConnectorState>().cancel(&call_id);
    Ok(())
}

/// Which of this session's connections may poll, and at what interval. A connection whose package
/// changed is reported blocked and never polled. The webview drives one collect per interval.
#[tauri::command]
pub async fn custom_connector_poll(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    connections: Vec<PollTarget>,
) -> Result<Value, String> {
    main_window(&window)?;
    off_thread(move || {
        if !context.valid() {
            return Err("permission_denied".into());
        }
        let grants = custom_connector_store::load_grants(&grant_file()?)?;
        let mut installed = Vec::new();
        let mut blocked = Vec::new();
        for target in connections {
            if custom_connector_store::slug_of(&target.connector_id).is_none() {
                continue;
            }
            let Ok(grant) = custom_connector_store::authorize(&grants, &context, &target.connection_id, target.revision)
            else {
                continue;
            };
            match custom_connectors::load(&grant.slug, &paths::package_root(&grant.slug)?) {
                Ok(package) if package.sha256 == grant.entry_sha256 => installed.push(json!({
                    "connectionId": target.connection_id,
                    "revision": target.revision,
                    // Never below 30: a package must not drag the device down (03b).
                    "everySeconds": package.manifest.poll.as_ref().map(|poll| poll.every_seconds.max(30)),
                })),
                _ => blocked.push(target.connection_id),
            }
        }
        app.state::<CustomConnectorState>().keep(
            &installed
                .iter()
                .filter_map(|row| row["connectionId"].as_str().map(str::to_owned))
                .collect::<Vec<_>>(),
        );
        Ok(json!({ "installed": installed, "blocked": blocked }))
    })
    .await
}

/// One poll. Runs the manifest's poll tool with the stored cursor, cuts the events, and emits the
/// batch for the webview to send. The cursor moves only in `custom_connector_ack`.
#[tauri::command]
pub async fn custom_connector_collect(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    connection_id: String,
    batch_id: String,
) -> Result<Value, String> {
    main_window(&window)?;
    off_thread(move || collect_in(&app, &context, &connection_id, &batch_id)).await
}

/// The batch bookkeeping a collect does before it emits, split out so a test can drive the exact
/// sequence: poll output → pending entry → emit → ack → cursor.
pub fn remember_batch(
    batches: &std::path::Path,
    batch_id: &str,
    cursor: &str,
) -> Result<(), String> {
    let mut pending = custom_connector_store::load_pending(batches)?;
    pending.insert(batch_id.to_owned(), cursor.to_owned());
    custom_connector_store::save_pending(batches, &pending)
}

fn collect_in(app: &AppHandle, context: &Context, connection_id: &str, batch_id: &str) -> Result<Value, String> {
    if !context.valid() || batch_id.is_empty() || batch_id.len() > 200 {
        return Err("permission_denied".into());
    }
    let grants = custom_connector_store::load_grants(&grant_file()?)?;
    let Some(grant) = grants
        .iter()
        .find(|item| item.matches(context) && item.connection_id == connection_id)
    else {
        return Err("permission_denied".into());
    };
    let package = custom_connectors::load(&grant.slug, &paths::package_root(&grant.slug)?)?;
    if package.sha256 != grant.entry_sha256 {
        return Ok(json!({ "blocked": "needs_reauth" }));
    }
    let cursors = custom_connector_store::load_cursors(&cursors_file()?)?;
    let cancelled = AtomicBool::new(false);
    match custom_connector_runner::poll(&package, &cursors, connection_id, &cancelled) {
        // An empty poll emits nothing, and moves nothing: a package with no news is not a cursor.
        Ok((output, _)) if output.as_array().is_none_or(|list| list.is_empty()) => {
            Ok(json!({ "emitted": Value::Null }))
        }
        Ok((output, next)) => {
            // The cursor the batch would advance to is recorded before the emit, so a crash between
            // sending and the ack leaves it pending and the same batch is polled again next time.
            let cursor = next.unwrap_or_else(|| custom_connector_store::cursor_of(&cursors, connection_id));
            remember_batch(&paths::batches_file()?, batch_id, &cursor)?;
            let events = output.as_array().cloned().unwrap_or_default();
            let batch = PolledBatch {
                connection_id: connection_id.to_owned(),
                revision: grant.revision,
                batch_id: batch_id.to_owned(),
                events,
            };
            let _ = app.emit_to("main", "custom-connector-event", batch);
            Ok(json!({ "emitted": batch_id }))
        }
        Err(code) => Ok(json!({ "error": code })),
    }
}

/// The server wrote the batch: its cursor becomes the poll's starting point. An ack naming a batch
/// this device never held (or already acked) changes nothing, so a duplicate is harmless.
#[tauri::command]
pub async fn custom_connector_ack(
    window: WebviewWindow,
    context: Context,
    connection_id: String,
    batch_id: String,
) -> Result<(), String> {
    main_window(&window)?;
    off_thread(move || {
        if !context.valid() {
            return Err("permission_denied".into());
        }
        let grants = custom_connector_store::load_grants(&grant_file()?)?;
        if !grants
            .iter()
            .any(|item| item.matches(&context) && item.connection_id == connection_id)
        {
            return Err("permission_denied".into());
        }
        ack_in(&cursors_file()?, &paths::batches_file()?, &connection_id, &batch_id)
    })
    .await
}

/// The ack's own body: the batch's cursor is recorded by the collect that emitted it, keyed by the
/// batch id, so a restart before the ack sends the same batch again instead of skipping it.
pub fn ack_in(file: &std::path::Path, batches: &std::path::Path, connection_id: &str, batch_id: &str) -> Result<(), String> {
    let mut pending = custom_connector_store::load_pending(batches)?;
    let Some(cursor) = pending.remove(batch_id) else {
        return Ok(());
    };
    let mut cursors: Cursors = custom_connector_store::load_cursors(file)?;
    custom_connector_store::commit_ack(&mut cursors, connection_id, &cursor);
    custom_connector_store::save_cursors(file, &cursors)?;
    custom_connector_store::save_pending(batches, &pending)
}


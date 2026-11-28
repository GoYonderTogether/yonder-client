//! Tauri commands for the terminal connector: `shell_execute`, the runner's restart check, and the
//! background watcher that tells the webview a job finished.
//!
//! Authorization is checked here against the device's own grant store, not only on the server: a
//! command must name a `computer-control` connection whose grant carries `terminal: true`, be for
//! the current owner/device/session, and not have expired. The same checks `local_files_execute`
//! makes, because a device command must never trust its sender (TOOLS-V3 §4).
//!
//! The watcher emits `shell-job-finished` to the main window; the webview turns each one into the
//! realtime `shell.job.finished` event. Keeping the socket out of Rust means the event uses the same
//! path as every other connector event, including its one-retry behaviour while reconnecting.

use crate::local_files_store::{Capabilities, Context, LocalFilesState};
use crate::local_files_text::now_ms;
use crate::shell_jobs::Job;
use crate::shell_job as shell_jobs_ops;
use crate::shell_runner::{self, Runner};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{ipc::Response, AppHandle, Emitter, Manager, WebviewWindow};

/// The app-managed runner. One per process: jobs belong to the device, not to a connection.
pub struct ShellState(pub Arc<Runner>);

const WATCH_MS: u64 = 700;

fn runner<'a>(app: &'a AppHandle) -> tauri::State<'a, ShellState> {
    app.state::<ShellState>()
}

/// The terminal's files: `jobs.json` next to the grant library, and one directory per job beneath.
pub fn init(app: &AppHandle) -> Result<Runner, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "read_failed".to_string())?;
    let root = base.join("shell-jobs");
    std::fs::create_dir_all(&root).map_err(|_| "read_failed".to_string())?;
    Ok(Runner::new(base.join("jobs.json"), root))
}

/// Check the grant a shell command names, then register it as running so a second command with the
/// same id cannot land twice.
fn authorize(app: &AppHandle, context: &Context, command: &Value) -> Result<(), String> {
    let operation = command["operation"].as_str().unwrap_or("");
    if !matches!(operation, "shell" | "shell_job") {
        return Err("permission_denied".into());
    }
    let connection_id = command["connectionId"]
        .as_str()
        .ok_or("permission_denied")?;
    let id = command["id"].as_str().ok_or("permission_denied")?;
    let expires = command["expiresAtMs"].as_u64().ok_or("permission_denied")?;
    let revision = command["revision"].as_u64().unwrap_or(1);
    let state = app.state::<LocalFilesState>();
    let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
    let grant = store.grant_for(context, connection_id)?;
    let granted: Capabilities = grant.capabilities.clone();
    let commanded = &command["capabilities"];
    let asked = Capabilities {
        file_tools: commanded["fileTools"].as_bool().unwrap_or(false),
        terminal: commanded["terminal"].as_bool().unwrap_or(false),
        desktop: commanded["desktop"].as_bool().unwrap_or(false),
        browser: commanded["browser"].as_bool().unwrap_or(false),
    };
    if grant.connector_id != "computer-control"
        || !granted.terminal
        || !asked.terminal
        || asked.file_tools != granted.file_tools
        || asked.desktop != granted.desktop
        || asked.browser != granted.browser
        || commanded["terminal"].as_bool() != Some(true)
        || command["connectorId"].as_str() != Some("computer-control")
        || grant.revision != revision
        || command["deviceId"] != context.device_id
        || now_ms() >= expires
        || store.running.contains_key(id)
    {
        return Err("permission_denied".into());
    }
    store.running.insert(
        id.to_owned(),
        (
            connection_id.to_owned(),
            Arc::new(AtomicBool::new(false)),
        ),
    );
    Ok(())
}

#[tauri::command]
pub async fn shell_execute(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    command: Value,
) -> Result<Response, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let id = command["id"].as_str().ok_or("path_invalid")?.to_owned();
    let connection_id = command["connectionId"]
        .as_str()
        .ok_or("path_invalid")?
        .to_owned();
    let operation = command["operation"]
        .as_str()
        .ok_or("path_invalid")?
        .to_owned();
    let expires = command["expiresAtMs"].as_u64().ok_or("path_invalid")?;
    let args = command.get("args").cloned().unwrap_or_else(|| json!({}));
    authorize(&app, &context, &command)?;

    let cancelled = {
        let state = app.state::<LocalFilesState>();
        let store = state.lock().map_err(|_| "read_failed".to_string())?;
        store
            .running
            .get(&id)
            .map(|(_, flag)| flag.clone())
            .ok_or("permission_denied")?
    };
    let runner = runner(&app).0.clone();
    let work = {
        let runner = runner.clone();
        let operation = operation.clone();
        let connection_id = connection_id.clone();
        let command_id = id.clone();
        let cancelled = cancelled.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if operation == "shell" {
                shell_runner::start(&runner, &connection_id, &command_id, &args, &cancelled, expires)
            } else {
                let action = args.get("action").and_then(Value::as_str).ok_or("path_invalid")?;
                shell_jobs_ops::job(&runner, action, &args, &cancelled, expires)
            }
        })
        .await
        .map_err(|_| "read_failed".to_string())?
    };

    let state = app.state::<LocalFilesState>();
    let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
    store.running.remove(&id);
    if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
        return Ok(Response::new(
            json!({"ok":false,"error":"cancelled"}).to_string(),
        ));
    }
    if store.grant_for(&context, &connection_id)?.revision != command["revision"].as_u64().unwrap_or(1) {
        return Err("permission_denied".into());
    }
    drop(store);
    let body = match work {
        Ok(result) => json!({"ok": true, "result": result}),
        Err(error) => json!({"ok": false, "error": error}),
    };
    Ok(Response::new(body.to_string()))
}

/// The user stopped the round: end the tree the command left running. Safe after the command has
/// already answered `done` (no job to kill), and safe to repeat.
#[tauri::command]
pub async fn shell_cancel(
    app: AppHandle,
    window: WebviewWindow,
    command_id: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    shell_jobs_ops::cancel(&runner(&app).0, &command_id);
    Ok(())
}

/// Read `jobs.json` after a restart and put every record back in one of its three states. Returns
/// the counts so the caller can log them; nothing here sends events — the watcher does, once.
pub fn resume(app: &AppHandle) {
    let shell = app.state::<ShellState>();
    let (adopted, finished, lost) = shell_jobs_ops::resume(&shell.0);
    let _ = (adopted, finished, lost);
}

/// Start the watcher that turns finished jobs into `shell-job-finished` events for the webview.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(WATCH_MS));
        let Some(shell) = app.try_state::<ShellState>() else {
            return;
        };
        let handle = app.clone();
        let notify: Arc<dyn Fn(&Job) -> bool + Send + Sync> = Arc::new(move |job: &Job| {
            handle
                .emit_to("main", "shell-job-finished", shell_jobs_ops::event(job))
                .is_ok()
        });
        shell_jobs_ops::settle_all(&shell.0, &notify);
    });
}

/// Where a job's log lives, for tests and for the docs' example paths.
#[allow(dead_code)]
pub fn log_path(app: &AppHandle, job_id: &str) -> Option<PathBuf> {
    let shell = app.try_state::<ShellState>()?;
    let state = shell.0.state.lock().ok()?;
    state.jobs.get(job_id).map(|job| job.log_path.clone())
}
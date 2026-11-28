//! Tauri commands for browser control: `browser_execute`, its cancel, the four-state status the
//! connector page reads, and the install entry for a device with no `bsk`.
//!
//! Authorization is checked here against the device's own grant store, not only on the server: a
//! command must name a `computer-control` connection whose grant carries `browser: true`, be for the
//! current owner/device/session, and not have expired — the same checks `shell_execute` makes, because
//! a device command must never trust its sender (specs/connectors/browser.md §2). The BrowserSkill
//! session is not a Yonder identity: it is the person's own browser, and opening the switch is the
//! consent that lets the Bot drive it.
//!
//! No pairing, no second confirmation, no message-bus protocol of our own: the daemon and extension
//! are BrowserSkill's, and this layer only runs `bsk` and reads back its JSON (specs/connectors/browser.md
//! §2). Its local isolation (file permissions, extension origin allow-list) is the boundary; we do not
//! stack a second one on top.

use crate::browser::{self, Device};
use crate::local_files_store::{Capabilities, Context, LocalFilesState};
use crate::local_files_text::now_ms;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{ipc::Response, AppHandle, Manager, WebviewWindow};

/// The app's one `bsk` device, shared so a test can install fakes without a real CLI.
pub struct BrowserState(pub Arc<Device>);

impl BrowserState {
    pub fn local() -> BrowserState {
        BrowserState(Arc::new(Device::local()))
    }
}

fn device<'a>(app: &'a AppHandle) -> Result<tauri::State<'a, BrowserState>, String> {
    app.try_state::<BrowserState>()
        .ok_or_else(|| "operation_failed".to_string())
}

/// The five browser operations, named exactly as the protocol does.
const OPERATIONS: [&str; 5] = [
    "browser_status",
    "browser_session",
    "browser_navigate",
    "browser_observe",
    "browser_act",
];

/// Check the grant a browser command names, then register it as running so the same id cannot land
/// twice. It mirrors `shell::authorize`, including the capability equality check: a grant that once
/// carried file tools and now only browser control must not be driven under the old receipt.
fn authorize(app: &AppHandle, context: &Context, command: &Value) -> Result<(), String> {
    let operation = command["operation"].as_str().unwrap_or("");
    if !OPERATIONS.contains(&operation) {
        return Err("permission_denied".into());
    }
    let connection_id = command["connectionId"].as_str().ok_or("permission_denied")?;
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
        || !granted.browser
        || !asked.browser
        || asked.file_tools != granted.file_tools
        || asked.terminal != granted.terminal
        || commanded["browser"].as_bool() != Some(true)
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
        (connection_id.to_owned(), Arc::new(AtomicBool::new(false))),
    );
    Ok(())
}

#[tauri::command]
pub async fn browser_execute(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    command: Value,
) -> Result<Response, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let id = command["id"].as_str().ok_or("path_invalid")?.to_owned();
    let connection_id = command["connectionId"].as_str().ok_or("path_invalid")?.to_owned();
    let operation = command["operation"].as_str().ok_or("path_invalid")?.to_owned();
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
    let device = device(&app)?.0.clone();
    let run = cancelled.clone();
    let work = tauri::async_runtime::spawn_blocking(move || {
        if run.load(Ordering::SeqCst) || now_ms() >= expires {
            return Err("cancelled");
        }
        browser::execute(&device, &operation, &args)
    })
    .await
    .map_err(|_| "read_failed".to_string())?;

    let state = app.state::<LocalFilesState>();
    let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
    store.running.remove(&id);
    if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
        return Ok(Response::new(json!({"ok":false,"error":"cancelled"}).to_string()));
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

/// The user stopped the round: nothing the browser runner started is left running (each bsk child is
/// killed at its own deadline), so this only marks the command. It is a no-op once the command has
/// already answered.
#[tauri::command]
pub async fn browser_cancel(
    app: AppHandle,
    window: WebviewWindow,
    command_id: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    if let Some((_, flag)) = app
        .state::<LocalFilesState>()
        .lock()
        .map_err(|_| "read_failed".to_string())?
        .running
        .get(&command_id)
    {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// What the connector page shows near the switch: the four states as words, and — when `bsk` is not
/// installed — the platform's install command, so the page can offer one button. It never creates or
/// changes a grant; the switch does that through `local_files_authorize` like every other capability.
#[tauri::command]
pub async fn browser_status(
    app: AppHandle,
    window: WebviewWindow,
    platform: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let device = device(&app)?.0.clone();
    let install = browser::install_command(&platform);
    let status = tauri::async_runtime::spawn_blocking(move || {
        browser::execute(&device, "browser_status", &json!({}))
    })
    .await
    .map_err(|_| "read_failed".to_string())?;
    let mut value = match status {
        Ok(value) => value,
        Err(error) => json!({ "kind": "browser_status", "installed": false, "daemonRunning": false, "connected": false, "browsers": [], "hint": error }),
    };
    // The page's install entry: the platform's own script, or nothing where this OS has no bsk build.
    value["install"] = match install {
        Some((program, args)) => json!({ "program": program, "args": args }),
        None => Value::Null,
    };
    Ok(value)
}

/// Run the platform's install script for browser control. One shot per tap; the script is Tencent's
/// own and needs no administrator rights. The daemon it leaves behind is started on first use.
#[tauri::command]
pub async fn browser_install(
    app: AppHandle,
    window: WebviewWindow,
    platform: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let Some((program, args)) = browser::install_command(&platform) else {
        return Err("operation_failed".into());
    };
    let device = device(&app)?.0.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        // The install script fetches the binary from GitHub; that network call is the device's own,
        // made once when the owner taps install.
        device.bsk.supervisor.run(&program, &args, &device.bsk.env, INSTALL_TIMEOUT)
    })
    .await
    .map_err(|_| "read_failed".to_string())?;
    match outcome {
        Ok(output) => Ok(json!({ "ok": output.status == 0, "output": output.stdout })),
        Err(_) => Err("operation_failed".into()),
    }
}

/// The install script downloads a binary; two minutes is the download plus the checksum check.
const INSTALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
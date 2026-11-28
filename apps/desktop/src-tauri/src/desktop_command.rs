//! The Tauri command for desktop control: `desktop_execute`.
//!
//! Authorization is checked here against the device's own grant store, not only on the server: a
//! command must name a `computer-control` connection whose grant carries `desktop: true`, be for the
//! current owner/device/session, and not have expired — the same checks `shell_execute` makes, plus
//! that this build is on a platform with a desktop backend. Then [`desktop::execute`] validates the
//! arguments and runs the native call off the IPC thread.

use crate::desktop::{self, Failure};
use crate::local_files_store::{Capabilities, Context, LocalFilesState};
use crate::local_files_text::now_ms;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{ipc::Response, AppHandle, Manager, WebviewWindow};

const OPERATIONS: [&str; 4] = ["desktop_windows", "desktop_ax", "desktop_shot", "desktop_input"];

/// The backend for this build, or `None` where desktop control is not offered (a phone or web).
fn backend() -> Option<Box<dyn desktop::Backend>> {
    #[cfg(target_os = "macos")]
    {
        return crate::desktop_macos::backend();
    }
    #[cfg(windows)]
    {
        return Some(Box::new(crate::desktop_windows::WindowsBackend));
    }
    #[allow(unreachable_code)]
    None
}

/// The grant a desktop command names, or `permission_denied`. Every field the server checked is
/// re-checked here, because a device command must never trust its sender.
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
        || !granted.desktop
        || !asked.desktop
        || asked.file_tools != granted.file_tools
        || commanded["desktop"].as_bool() != Some(true)
        || command["connectorId"].as_str() != Some("computer-control")
        || grant.revision != revision
        || command["deviceId"] != context.device_id
        || now_ms() >= expires
        || store.running.contains_key(id)
    {
        return Err("permission_denied".into());
    }
    store.running.insert(id.to_owned(), (connection_id.to_owned(), Arc::new(AtomicBool::new(false))));
    Ok(())
}

#[tauri::command]
pub async fn desktop_execute(
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

    let Some(backend) = backend() else {
        // A platform with no desktop backend: report the real reason, never a fake success.
        return Ok(Response::new(
            json!({"ok": false, "error": "operation_failed"}).to_string(),
        ));
    };
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

    let work = {
        let operation = operation.clone();
        let args = args.clone();
        tauri::async_runtime::spawn_blocking(move || desktop::execute(&operation, &args, backend.as_ref()))
            .await
            .map_err(|_| "read_failed".to_string())?
    };

    let state = app.state::<LocalFilesState>();
    let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
    store.running.remove(&id);
    if cancelled.load(std::sync::atomic::Ordering::SeqCst) || now_ms() >= expires {
        return Ok(Response::new(json!({"ok": false, "error": "cancelled"}).to_string()));
    }
    if store.grant_for(&context, &connection_id)?.revision != command["revision"].as_u64().unwrap_or(1) {
        return Err("permission_denied".into());
    }
    drop(store);
    let body = match work {
        Ok(result) => json!({"ok": true, "result": result}),
        Err(Failure { code, permission }) => match permission {
            Some(permission) => json!({"ok": false, "error": code, "permission": permission}),
            None => json!({"ok": false, "error": code}),
        },
    };
    Ok(Response::new(body.to_string()))
}

use crate::local_files_confirm;
use crate::local_files_operations;
use crate::local_files_store::{Capabilities, Context, Grant, LocalFilesState};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("permission_denied".into())
    }
}

fn grant_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("local-file-grants.json"))
        .map_err(|_| "read_failed".into())
}

/// The grant file touches the disk (`read`, `create_dir_all`, `sync_all`, `rename`), so every
/// command that reaches it runs its work off the IPC thread. `spawn_blocking` keeps a slow disk
/// from stalling the webview's message loop; the label check stays on the IPC thread because it is
/// free and must fail before any work starts.
async fn off_thread<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "read_failed".to_string())?
}

#[tauri::command]
pub async fn local_files_activate(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
) -> Result<(), String> {
    main_window(&window)?;
    off_thread(move || {
        let file = grant_file(&app)?;
        let state = app.state::<LocalFilesState>();
        let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
        store.activate(&file, context)
    })
    .await
}

#[tauri::command]
pub async fn local_files_reset(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    main_window(&window)?;
    off_thread(move || {
        app.state::<LocalFilesState>()
            .lock()
            .map_err(|_| "read_failed".to_string())?
            .reset();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_files_authorize(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    config: Value,
) -> Result<(), String> {
    main_window(&window)?;
    let id = config["id"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 128)
        .ok_or("permission_denied")?
        .to_owned();
    let connector = config["connectorId"]
        .as_str()
        .filter(|v| matches!(*v, "local-files" | "computer-control"))
        .ok_or("permission_denied")?
        .to_owned();
    let scope = config["scope"]
        .as_str()
        .filter(|v| matches!(*v, "folder" | "device"))
        .ok_or("permission_denied")?
        .to_owned();
    let revision = config["revision"]
        .as_u64()
        .filter(|v| *v > 0)
        .ok_or("permission_denied")?;
    let caps: Capabilities =
        serde_json::from_value(config["capabilities"].clone()).map_err(|_| "permission_denied")?;
    if config["capabilities"]["terminal"] == true || (connector == "local-files" && caps.file_tools)
    {
        return Err("permission_denied".into());
    }
    off_thread(move || {
        let file = grant_file(&app)?;
        let state = app.state::<LocalFilesState>();
        let existing = {
            let store = state.lock().map_err(|_| "read_failed".to_string())?;
            store.require(&context)?;
            store
                .grants
                .iter()
                .find(|g| g.connection_id == id && g.matches(&context))
                .cloned()
        };
        // The request decides what to ask for; the person decides whether it is granted. The box
        // is built and shown by Rust (`local_files_confirm`), owned by the main window, and the
        // page has no way to open or answer it. It runs with the store unlocked: a person may take
        // a while, and other local-file commands must not queue behind that.
        if local_files_confirm::must_ask(existing.as_ref(), &scope, &connector, &caps)
            && !local_files_confirm::confirm(&app, &scope, &caps)
        {
            return Err("permission_denied".into());
        }
        let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
        // The person's answer is not the only thing that can change while the box is open: the
        // account, device or session can switch, and a revoke can land, so the check and the
        // previous root are read again from the store rather than reused from before the box.
        store.require(&context)?;
        let root = store
            .grants
            .iter()
            .find(|g| g.connection_id == id && g.matches(&context))
            .map(|g| g.root.clone())
            .unwrap_or_default();
        if scope == "folder" && (!root.is_dir() || connector != "local-files") {
            return Err("permission_denied".into());
        }
        store.cancel_connection(Some(&id));
        store.allowed.remove(&id);
        let previous = store.grants.clone();
        store.grants.retain(|g| g.connection_id != id);
        store.grants.push(Grant {
            owner_id: context.owner_id,
            device_id: context.device_id,
            connection_id: id,
            root,
            connector_id: connector,
            scope,
            capabilities: caps,
            revision,
        });
        if let Err(e) = store.persist(&file) {
            store.grants = previous;
            return Err(e);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_files_cancel(
    app: AppHandle,
    window: WebviewWindow,
    command_id: String,
) -> Result<(), String> {
    main_window(&window)?;
    off_thread(move || {
        if let Some((_, flag)) = app
            .state::<LocalFilesState>()
            .lock()
            .map_err(|_| "read_failed".to_string())?
            .running
            .get(&command_id)
        {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn local_files_revoke(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    connection_id: String,
) -> Result<(), String> {
    main_window(&window)?;
    off_thread(move || {
        let file = grant_file(&app)?;
        let state = app.state::<LocalFilesState>();
        let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
        store.require(&context)?;
        store.cancel_connection(Some(&connection_id));
        store.allowed.remove(&connection_id);
        store
            .grants
            .retain(|g| !(g.matches(&context) && g.connection_id == connection_id));
        store.persist(&file)
    })
    .await
}

#[tauri::command]
pub async fn local_files_ready(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    connections: Vec<Value>,
) -> Result<Vec<Value>, String> {
    main_window(&window)?;
    off_thread(move || {
        let state = app.state::<LocalFilesState>();
        let mut store = state.lock().map_err(|_| "read_failed".to_string())?;
        store.require(&context)?;
        let ready: Vec<Value> = store
            .grants
            .iter()
            .filter(|g| {
                g.matches(&context)
                    && (g.scope == "device" || g.root.is_dir())
                    && connections.iter().any(|c| {
                        c["id"] == g.connection_id && c["revision"].as_u64() == Some(g.revision)
                    })
            })
            .map(|g| json!({"id":g.connection_id,"revision":g.revision}))
            .collect();
        let allowed = ready
            .iter()
            .filter_map(|c| c["id"].as_str().map(str::to_owned))
            .collect::<std::collections::HashSet<_>>();
        for old in store.allowed.difference(&allowed) {
            store.cancel_connection(Some(old));
        }
        store.allowed = allowed;
        Ok(ready)
    })
    .await
}

#[tauri::command]
pub async fn local_files_execute(
    app: AppHandle,
    window: WebviewWindow,
    context: Context,
    command: Value,
) -> Result<Value, String> {
    main_window(&window)?;
    let id = command["id"].as_str().ok_or("path_invalid")?.to_owned();
    let connection_id = command["connectionId"]
        .as_str()
        .ok_or("path_invalid")?
        .to_owned();
    let operation = command["operation"]
        .as_str()
        .ok_or("path_invalid")?
        .to_owned();
    let path = command["path"].as_str().ok_or("path_invalid")?.to_owned();
    let expires = command["expiresAtMs"].as_u64().ok_or("path_invalid")?;
    let revision = command["revision"].as_u64().unwrap_or(1);
    let args = command.get("args").cloned().unwrap_or_else(|| json!({}));
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let grant = {
        let state = app.state::<LocalFilesState>();
        let mut store = state.lock().map_err(|_| "read_failed")?;
        let grant = store.grant_for(&context, &connection_id)?;
        if command["connectorId"].as_str().unwrap_or("local-files") != grant.connector_id
            || command["scope"].as_str().unwrap_or("folder") != grant.scope
            || command["capabilities"]["fileTools"]
                .as_bool()
                .unwrap_or(false)
                != grant.capabilities.file_tools
            || grant.revision != revision
            || command["deviceId"] != context.device_id
            || now_ms() >= expires
            || store.running.contains_key(&id)
        {
            return Err("permission_denied".into());
        }
        store
            .running
            .insert(id.clone(), (connection_id.clone(), cancelled.clone()));
        grant
    };
    let recovery = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "read_failed")?
        .join("local-file-recovery");
    let selected = grant.clone();
    let owner = context.clone();
    let signal = cancelled.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        local_files_operations::execute(
            &selected, &owner, &operation, &path, &args, &recovery, &signal, expires,
        )
    })
    .await
    .map_err(|_| "read_failed")?;
    let state = app.state::<LocalFilesState>();
    let mut store = state.lock().map_err(|_| "read_failed")?;
    store.running.remove(&id);
    if cancelled.load(std::sync::atomic::Ordering::SeqCst) || now_ms() >= expires {
        return Ok(json!({"ok":false,"error":"cancelled"}));
    }
    if store.grant_for(&context, &connection_id)?.revision != grant.revision {
        return Err("permission_denied".into());
    }
    Ok(match result {
        Ok(value) => json!({"ok":true,"result":value}),
        Err(error) => json!({"ok":false,"error":error}),
    })
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX)
}

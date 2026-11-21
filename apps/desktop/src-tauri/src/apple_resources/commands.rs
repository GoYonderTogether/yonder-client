use super::{blocking, can_read, AppleResources, Source};
use crate::local_files_store::Context;
use serde::Deserialize;
use serde_json::Value;
use std::{
    ffi::{c_char, c_void, CString},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{async_runtime, AppHandle, Manager, Runtime};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Command {
    id: String,
    revision: u64,
    connector_id: Source,
    connection_id: String,
    device_id: String,
    expires_at_ms: u64,
    operation: String,
    args: Value,
}

type Reply = extern "C" fn(*mut c_void, i32, *const u8, usize);

extern "C" {
    fn yonder_apple_calendar_execute(
        read: bool,
        args: *const c_char,
        context: *mut c_void,
        reply: Reply,
    );
    fn yonder_apple_photos_execute(
        read: bool,
        args: *const c_char,
        context: *mut c_void,
        reply: Reply,
    );
}

fn operation_kind(source: Source, operation: &str) -> Result<bool, String> {
    use Source::*;
    match (source, operation) {
        (AppleCalendar, "apple_calendar_list")
        | (ApplePhotos, "apple_photos_list")
        | (AppleNotes, "apple_notes_list") => Ok(false),
        (AppleCalendar, "apple_calendar_read")
        | (ApplePhotos, "apple_photos_read")
        | (AppleNotes, "apple_notes_read") => Ok(true),
        _ => Err("unsupported_file".into()),
    }
}

fn valid_args(source: Source, read: bool, args: &Value) -> bool {
    let Some(args) = args.as_object() else {
        return false;
    };
    if read {
        return args.len() == 1
            && args.get("id").and_then(Value::as_str).is_some_and(|id| {
                !id.is_empty() && id.len() <= 2048 && !id.chars().any(char::is_control)
            });
    }
    if source == Source::AppleCalendar
        && !(args.contains_key("dateFrom") && args.contains_key("dateTo"))
    {
        return false;
    }
    args.iter().all(|(key, value)| match key.as_str() {
        "limit" => value.as_u64().is_some_and(|n| (1..=50).contains(&n)),
        "offset" => value.as_u64().is_some_and(|n| n <= 5000),
        "dateFrom" | "dateTo" if source != Source::AppleNotes => value
            .as_str()
            .is_some_and(|date| date.len() == 10 && date.is_ascii()),
        "query" if source == Source::AppleCalendar => value.as_str().is_some_and(|query| {
            !query.trim().is_empty() && query.encode_utf16().count() <= 200 && !query.contains('\0')
        }),
        _ => false,
    })
}

extern "C" fn result_reply(context: *mut c_void, status: i32, bytes: *const u8, length: usize) {
    let sender =
        unsafe { Box::from_raw(context.cast::<async_runtime::Sender<Result<Value, String>>>()) };
    let result = match status {
        0 if !bytes.is_null() && length <= 180_000 => {
            // Native keeps the byte buffer alive during this callback.
            let input = unsafe { std::slice::from_raw_parts(bytes, length) };
            serde_json::from_slice(input).map_err(|_| "read_failed".into())
        }
        1 => Err("permission_denied".into()),
        3 => Err("not_found".into()),
        4 => Err("operation_failed".into()),
        _ => Err("read_failed".into()),
    };
    let _ = sender.try_send(result);
}

async fn execute_source(source: Source, read: bool, args: Value) -> Result<Value, String> {
    if source == Source::AppleNotes {
        #[cfg(target_os = "macos")]
        return blocking(move || {
            if !super::can_read_granted(source) {
                return Err("permission_denied".into());
            }
            crate::selected_note::execute(read, &args)
        })
        .await;
        #[cfg(not(target_os = "macos"))]
        return Err("unsupported_file".into());
    }
    let args = CString::new(args.to_string()).map_err(|_| "operation_failed")?;
    let (sender, mut receiver) = async_runtime::channel(1);
    let context = Box::into_raw(Box::new(sender)).cast();
    unsafe {
        match source {
            Source::AppleCalendar => {
                yonder_apple_calendar_execute(read, args.as_ptr(), context, result_reply)
            }
            Source::ApplePhotos => {
                yonder_apple_photos_execute(read, args.as_ptr(), context, result_reply)
            }
            Source::AppleNotes => unreachable!(),
        }
    }
    receiver.recv().await.ok_or("read_failed")?
}

fn expired(ms: u64) -> bool {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(true, |now| now.as_millis() >= ms.into())
}

#[tauri::command]
pub(super) async fn execute<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    command: Command,
) -> Result<Value, String> {
    let source = command.connector_id;
    let id = command.id;
    let revision = command.revision;
    let read = operation_kind(source, &command.operation)?;
    if !valid_args(source, read, &command.args) || id.is_empty() || id.len() > 128 {
        return Err("operation_failed".into());
    }
    if command.device_id != context.device_id || expired(command.expires_at_ms) {
        return Err("cancelled".into());
    }
    let state = app.state::<AppleResources>();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut store = state.store.lock().map_err(|_| "read_failed")?;
        let grant = store.grant_for(&context, &command.connection_id)?;
        if grant.revision != revision
            || grant.connector_id != source.id()
            || store.running.contains_key(&id)
        {
            return Err("permission_denied".into());
        }
        store
            .running
            .insert(id.clone(), (grant.connection_id, cancelled.clone()));
    }
    let result = execute_source(source, read, command.args).await;
    let still_allowed = blocking(move || Ok(can_read(source))).await;
    let mut store = state.store.lock().map_err(|_| "read_failed")?;
    store.running.remove(&id);
    if cancelled.load(Ordering::SeqCst) || expired(command.expires_at_ms) {
        return Err("cancelled".into());
    }
    if store.grant_for(&context, &command.connection_id)?.revision != revision || !still_allowed? {
        return Err("permission_denied".into());
    }
    result
}

#[tauri::command]
pub(super) fn cancel<R: Runtime>(app: AppHandle<R>, command_id: String) {
    if let Ok(store) = app.state::<AppleResources>().store.lock() {
        if let Some((_, flag)) = store.running.get(&command_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn agent_commands_keep_source_operation_and_arguments_bounded() {
        let command: Command = serde_json::from_value(json!({
            "id": "cmd_a", "connectionId": "conn_a", "connectorId": "apple-calendar",
            "deviceId": "dev_a", "revision": 2, "operation": "apple_calendar_list",
            "args": {"dateFrom": "2026-11-21", "dateTo": "2026-11-24", "limit": 50, "offset": 5000},
            "expiresAtMs": 1_795_312_200_000u64
        }))
        .unwrap();
        assert!(matches!(command.connector_id, Source::AppleCalendar));
        assert_eq!(command.revision, 2);
        assert!(!operation_kind(command.connector_id, &command.operation).unwrap());
        assert!(valid_args(command.connector_id, false, &command.args));
        assert!(operation_kind(Source::ApplePhotos, &command.operation).is_err());
        assert!(!valid_args(
            Source::ApplePhotos,
            false,
            &json!({"limit": 51})
        ));
        assert!(!valid_args(
            Source::ApplePhotos,
            true,
            &json!({"id": "a", "path": "/elsewhere"})
        ));
    }
}

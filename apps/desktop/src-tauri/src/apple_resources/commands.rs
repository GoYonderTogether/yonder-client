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
use tauri::{async_runtime, ipc::Response, AppHandle, Manager, Runtime};

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
    #[cfg(target_os = "macos")]
    fn yonder_voice_memos_execute(
        operation: i32,
        args: *const c_char,
        context: *mut c_void,
        reply: Reply,
    );
    #[cfg(target_os = "macos")]
    fn yonder_notes_attachment(
        note: *const c_char,
        attachment: *const c_char,
        context: *mut c_void,
        reply: Reply,
    );
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Operation {
    List,
    Read,
    Attachment,
    Transcribe,
}

impl Operation {
    fn binary(self) -> bool {
        matches!(self, Self::Attachment | Self::Transcribe)
    }
}

fn operation_kind(source: Source, operation: &str) -> Result<Operation, String> {
    use Source::*;
    match (source, operation) {
        (AppleCalendar, "apple_calendar_list")
        | (ApplePhotos, "apple_photos_list")
        | (AppleNotes, "apple_notes_list")
        | (AppleVoiceMemos, "apple_voice_memos_list") => Ok(Operation::List),
        (AppleCalendar, "apple_calendar_read")
        | (ApplePhotos, "apple_photos_read")
        | (AppleNotes, "apple_notes_read") => Ok(Operation::Read),
        (AppleNotes, "apple_notes_attachment_read")
        | (AppleVoiceMemos, "apple_voice_memos_read") => Ok(Operation::Attachment),
        (AppleVoiceMemos, "apple_voice_memos_transcribe") => Ok(Operation::Transcribe),
        _ => Err("unsupported_file".into()),
    }
}

fn valid_args(source: Source, operation: Operation, args: &Value) -> bool {
    let Some(args) = args.as_object() else {
        return false;
    };
    if operation != Operation::List {
        let valid_id = |key: &str| {
            args.get(key).and_then(Value::as_str).is_some_and(|id| {
                !id.is_empty() && id.len() <= 2048 && !id.chars().any(char::is_control)
            })
        };
        return valid_id("id")
            && if source == Source::AppleNotes && operation == Operation::Attachment {
                args.len() == 2 && valid_id("attachmentId")
            } else {
                args.len() == 1
            };
    }
    if source == Source::AppleCalendar
        && !(args.contains_key("dateFrom") && args.contains_key("dateTo"))
    {
        return false;
    }
    args.iter().all(|(key, value)| match key.as_str() {
        "limit" => value.as_u64().is_some_and(|n| (1..=50).contains(&n)),
        "offset" => value.as_u64().is_some_and(|n| n <= 5000),
        "dateFrom" | "dateTo" if matches!(source, Source::AppleCalendar | Source::ApplePhotos) => {
            value
                .as_str()
                .is_some_and(|date| date.len() == 10 && date.is_ascii())
        }
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
        _ => Err(native_error(status).into()),
    };
    let _ = sender.try_send(result);
}

fn native_error(status: i32) -> &'static str {
    match status {
        1 => "permission_denied",
        3 => "not_found",
        4 => "operation_failed",
        6 => "too_large",
        _ => "read_failed",
    }
}

async fn execute_source(
    source: Source,
    operation: Operation,
    args: Value,
) -> Result<Value, String> {
    let read = operation == Operation::Read;
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
    if source == Source::AppleVoiceMemos {
        #[cfg(target_os = "macos")]
        return blocking(move || {
            let args = CString::new(args.to_string()).map_err(|_| "operation_failed")?;
            let (sender, mut receiver) = async_runtime::channel(1);
            let context = Box::into_raw(Box::new(sender)).cast();
            unsafe { yonder_voice_memos_execute(0, args.as_ptr(), context, result_reply) };
            receiver.try_recv().map_err(|_| "read_failed")?
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
            Source::AppleNotes | Source::AppleVoiceMemos => unreachable!(),
        }
    }
    receiver.recv().await.ok_or("read_failed")?
}

#[cfg(target_os = "macos")]
fn export_source(source: Source, operation: Operation, args: Value) -> Result<Vec<u8>, String> {
    let mut result: Result<Vec<u8>, String> = Err("read_failed".into());
    let context = (&mut result as *mut Result<Vec<u8>, String>).cast();
    extern "C" fn copy(context: *mut c_void, status: i32, bytes: *const u8, length: usize) {
        let result = if status == 0 && !bytes.is_null() && length <= 20 * 1024 * 1024 + 4100 {
            // The synchronous native exporter keeps its frame alive throughout this call.
            Ok(unsafe { std::slice::from_raw_parts(bytes, length) }.to_vec())
        } else {
            Err(native_error(status).into())
        };
        unsafe { *context.cast::<Result<Vec<u8>, String>>() = result };
    }
    if source == Source::AppleNotes {
        let note = CString::new(args["id"].as_str().ok_or("operation_failed")?)
            .map_err(|_| "operation_failed")?;
        let attachment = CString::new(args["attachmentId"].as_str().ok_or("operation_failed")?)
            .map_err(|_| "operation_failed")?;
        unsafe { yonder_notes_attachment(note.as_ptr(), attachment.as_ptr(), context, copy) };
    } else {
        let args = CString::new(args.to_string()).map_err(|_| "operation_failed")?;
        unsafe {
            yonder_voice_memos_execute(
                if operation == Operation::Transcribe {
                    2
                } else {
                    1
                },
                args.as_ptr(),
                context,
                copy,
            )
        };
    }
    result
}

fn expired(ms: u64) -> bool {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(true, |now| now.as_millis() >= ms.into())
}

async fn perform<R: Runtime, T, Work, ResultFuture>(
    app: AppHandle<R>,
    context: Context,
    command: Command,
    binary: bool,
    work: Work,
) -> Result<T, String>
where
    Work: FnOnce(Source, Operation, Value) -> ResultFuture,
    ResultFuture: std::future::Future<Output = Result<T, String>>,
{
    let source = command.connector_id;
    let id = command.id;
    let revision = command.revision;
    let operation = operation_kind(source, &command.operation)?;
    if operation.binary() != binary
        || !valid_args(source, operation, &command.args)
        || id.is_empty()
        || id.len() > 128
    {
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
    let result = work(source, operation, command.args).await;
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
pub(super) async fn execute<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    command: Command,
) -> Result<Value, String> {
    perform(app, context, command, false, execute_source).await
}

#[tauri::command]
pub(super) async fn execute_attachment<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    command: Command,
) -> Result<Response, String> {
    #[cfg(target_os = "macos")]
    return perform(app, context, command, true, |source, operation, args| {
        blocking(move || export_source(source, operation, args))
    })
    .await
    .map(Response::new);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, context, command);
        Err("unsupported_file".into())
    }
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
        assert_eq!(
            operation_kind(command.connector_id, &command.operation),
            Ok(Operation::List)
        );
        assert!(valid_args(
            command.connector_id,
            Operation::List,
            &command.args
        ));
        assert!(operation_kind(Source::ApplePhotos, &command.operation).is_err());
        assert!(!valid_args(
            Source::ApplePhotos,
            Operation::List,
            &json!({"limit": 51})
        ));
        assert!(!valid_args(
            Source::ApplePhotos,
            Operation::Read,
            &json!({"id": "a", "path": "/elsewhere"})
        ));
        let download = operation_kind(Source::AppleNotes, "apple_notes_attachment_read").unwrap();
        assert!(download.binary());
        assert!(valid_args(
            Source::AppleNotes,
            download,
            &json!({"id":"note", "attachmentId":"att"})
        ));
        assert!(!valid_args(
            Source::AppleNotes,
            download,
            &json!({"id":"note", "attachmentId":"att", "path":"/elsewhere"})
        ));
        assert!(
            operation_kind(Source::AppleVoiceMemos, "apple_voice_memos_transcribe")
                .unwrap()
                .binary()
        );
    }
}

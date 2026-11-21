use serde_json::Value;
use std::{
    collections::HashMap,
    ffi::{c_char, c_void, CStr, CString},
    io::Read,
    path::PathBuf,
    slice,
    sync::Mutex,
};
use tauri::{
    ipc::{Channel, Response},
    plugin::TauriPlugin,
    Manager, Runtime, State, WebviewWindow,
};

const MAX_FILES: u32 = 10;
const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Default)]
struct Picks(Mutex<HashMap<String, PathBuf>>);

type DataCallback = unsafe extern "C" fn(*mut c_void, *const u8, usize);
type DataReceiver = tauri::async_runtime::Receiver<Option<Vec<u8>>>;
type DataSender = tauri::async_runtime::Sender<Option<Vec<u8>>>;

extern "C" {
    fn yonder_apple_photos_status() -> i32;
    fn yonder_apple_photos_request(context: *mut c_void, callback: extern "C" fn(*mut c_void, i32));
    fn yonder_ios_observe_chat_photos(webview: *mut c_void);
    fn yonder_ios_chat_photo_albums(context: *mut c_void, callback: DataCallback);
    fn yonder_ios_chat_photo_page(
        album_id: *const c_char,
        offset: u32,
        limit: u32,
        context: *mut c_void,
        callback: DataCallback,
    );
    fn yonder_ios_chat_photo_thumbnail(
        asset_id: *const c_char,
        preview: bool,
        context: *mut c_void,
        callback: DataCallback,
    );
    fn yonder_ios_manage_chat_photo_access(
        webview: *mut c_void,
        context: *mut c_void,
        callback: DataCallback,
    );
    fn yonder_ios_pick_chat_attachments(
        webview: *mut c_void,
        session: *const c_char,
        directory: *const c_char,
        documents: bool,
        camera: bool,
        photo_ids_json: *const c_char,
        limit: u32,
        context: *mut c_void,
        callback: unsafe extern "C" fn(*mut c_void, *const c_char),
    );
    fn yonder_ios_close_chat_attachments(webview: *mut c_void, session: *const c_char);
}

extern "C" fn complete_access(context: *mut c_void, status: i32) {
    let channel = unsafe { Box::from_raw(context.cast::<tauri::async_runtime::Sender<i32>>()) };
    let _ = channel.try_send(status);
}

// AppleResourceBridge.h defines the permission values shared with the Photos connector.
#[tauri::command]
async fn photo_access<R: Runtime>(
    window: WebviewWindow<R>,
    request: bool,
) -> Result<&'static str, String> {
    window
        .with_webview(|webview| unsafe { yonder_ios_observe_chat_photos(webview.inner()) })
        .map_err(|error| error.to_string())?;
    let mut status = unsafe { yonder_apple_photos_status() };
    if request && status == 0 {
        let (send, mut receive) = tauri::async_runtime::channel::<i32>(1);
        unsafe {
            yonder_apple_photos_request(Box::into_raw(Box::new(send)).cast(), complete_access)
        };
        status = receive
            .recv()
            .await
            .ok_or("photo authorization unavailable")?;
    }
    Ok(match status {
        0 => "undetermined",
        1 => "full",
        2 => "limited",
        3 => "denied",
        _ => "restricted",
    })
}

unsafe extern "C" fn complete_data(context: *mut c_void, bytes: *const u8, length: usize) {
    let channel = Box::from_raw(context.cast::<DataSender>());
    let payload = (!bytes.is_null()).then(|| slice::from_raw_parts(bytes, length).to_vec());
    let _ = channel.try_send(payload);
}

async fn read_result(mut receive: DataReceiver) -> Result<Vec<u8>, String> {
    receive
        .recv()
        .await
        .flatten()
        .ok_or_else(|| "photo library unavailable".into())
}

#[tauri::command]
async fn photo_albums() -> Result<Value, String> {
    let (send, receive) = tauri::async_runtime::channel::<Option<Vec<u8>>>(1);
    unsafe { yonder_ios_chat_photo_albums(Box::into_raw(Box::new(send)).cast(), complete_data) };
    let bytes = read_result(receive).await?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[tauri::command]
async fn photo_page(offset: u32, limit: u32, album_id: Option<String>) -> Result<Value, String> {
    if !(1..=60).contains(&limit) {
        return Err("invalid photo page size".into());
    }
    if album_id
        .as_ref()
        .is_some_and(|id| id.is_empty() || id.len() > 256)
    {
        return Err("invalid photo album identifier".into());
    }
    let album_id = album_id
        .map(CString::new)
        .transpose()
        .map_err(|error| error.to_string())?;
    let (send, receive) = tauri::async_runtime::channel::<Option<Vec<u8>>>(1);
    unsafe {
        yonder_ios_chat_photo_page(
            album_id.as_ref().map_or(std::ptr::null(), |id| id.as_ptr()),
            offset,
            limit,
            Box::into_raw(Box::new(send)).cast(),
            complete_data,
        )
    };
    let bytes = read_result(receive).await?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[tauri::command]
async fn photo_thumbnail(id: String, preview: Option<bool>) -> Result<Response, String> {
    if id.is_empty() || id.len() > 256 {
        return Err("invalid photo identifier".into());
    }
    let id = CString::new(id).map_err(|error| error.to_string())?;
    let (send, receive) = tauri::async_runtime::channel::<Option<Vec<u8>>>(1);
    unsafe {
        yonder_ios_chat_photo_thumbnail(
            id.as_ptr(),
            preview.unwrap_or(false),
            Box::into_raw(Box::new(send)).cast(),
            complete_data,
        );
    }
    Ok(Response::new(read_result(receive).await?))
}

#[tauri::command]
async fn manage_photo_access<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    let (send, receive) = tauri::async_runtime::channel::<Option<Vec<u8>>>(1);
    window
        .with_webview(move |webview| unsafe {
            yonder_ios_manage_chat_photo_access(
                webview.inner(),
                Box::into_raw(Box::new(send)).cast(),
                complete_data,
            );
        })
        .map_err(|error| error.to_string())?;
    read_result(receive).await?;
    Ok(())
}

unsafe extern "C" fn complete(context: *mut c_void, json: *const c_char) {
    let channel = context.cast::<Channel<Option<Value>>>();
    let result: Option<Value> = (!json.is_null())
        .then(|| serde_json::from_slice(CStr::from_ptr(json).to_bytes()).ok())
        .flatten();
    if result
        .as_ref()
        .and_then(|event| event.get("importing"))
        .is_some()
    {
        let _ = (*channel).send(result);
    } else {
        let _ = Box::from_raw(channel).send(result);
    }
}

#[tauri::command]
fn pick<R: Runtime>(
    window: WebviewWindow<R>,
    picks: State<'_, Picks>,
    session: String,
    documents: bool,
    camera: Option<bool>,
    photo_ids: Option<Vec<String>>,
    limit: u32,
    result: Channel<Option<Value>>,
) -> Result<(), String> {
    if session.len() != 36
        || !session
            .bytes()
            .all(|byte| byte == b'-' || byte.is_ascii_hexdigit())
        || !(1..=MAX_FILES).contains(&limit)
    {
        return Err("invalid attachment selection".into());
    }
    let camera = camera.unwrap_or(false);
    let photo_ids = photo_ids.unwrap_or_default();
    if (documents && camera)
        || ((documents || camera) != photo_ids.is_empty())
        || photo_ids.len() > limit as usize
        || photo_ids.iter().any(|id| id.is_empty() || id.len() > 256)
    {
        return Err("invalid attachment source".into());
    }
    let photo_ids =
        CString::new(serde_json::to_vec(&photo_ids).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    let path = std::env::temp_dir().join(format!("yonder-chat-attachments-{session}"));
    let directory =
        CString::new(path.to_string_lossy().as_bytes()).map_err(|error| error.to_string())?;
    let identifier = CString::new(session.as_str()).map_err(|error| error.to_string())?;
    {
        let mut sessions = picks.0.lock().map_err(|error| error.to_string())?;
        std::fs::create_dir(&path).map_err(|error| error.to_string())?;
        sessions.insert(session.clone(), path);
    }
    window
        .with_webview(move |webview| unsafe {
            yonder_ios_pick_chat_attachments(
                webview.inner(),
                identifier.as_ptr(),
                directory.as_ptr(),
                documents,
                camera,
                photo_ids.as_ptr(),
                limit,
                Box::into_raw(Box::new(result)).cast(),
                complete,
            );
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn take(picks: State<'_, Picks>, session: String, index: u32) -> Result<Response, String> {
    if index >= MAX_FILES {
        return Err("invalid attachment index".into());
    }
    let directory = picks
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .get(&session)
        .cloned()
        .ok_or("attachment selection ended")?;
    let path = directory.join(index.to_string());
    let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("invalid staged attachment".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::fs::File::open(&path)
        .and_then(|file| file.take(MAX_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("invalid staged attachment".into());
    }
    std::fs::remove_file(path).map_err(|error| error.to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn release<R: Runtime>(
    window: WebviewWindow<R>,
    picks: State<'_, Picks>,
    session: String,
) -> Result<(), String> {
    let path = picks
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&session);
    let identifier = CString::new(session).map_err(|error| error.to_string())?;
    let result = window.with_webview(move |webview| unsafe {
        yonder_ios_close_chat_attachments(webview.inner(), identifier.as_ptr());
    });
    if let Some(path) = path {
        let _ = std::fs::remove_dir_all(path);
    }
    result.map_err(|error| error.to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("yonder-ios-chat-attachments")
        .invoke_handler(tauri::generate_handler![
            photo_access,
            photo_albums,
            photo_page,
            photo_thumbnail,
            manage_photo_access,
            pick,
            take,
            release
        ])
        .setup(|app, _| {
            app.manage(Picks::default());
            Ok(())
        })
        .build()
}

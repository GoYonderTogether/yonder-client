use super::{apple::permission, notify_open, PENDING_OPEN};
use serde_json::{json, Value};
use std::{
    ffi::{c_char, c_void, CStr},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter, Runtime};

type OpenListener = Box<dyn Fn() + Send + Sync>;
type TokenListener = Box<dyn Fn(&Value) + Send + Sync>;
static ON_OPEN: OnceLock<OpenListener> = OnceLock::new();
static ON_TOKEN: OnceLock<TokenListener> = OnceLock::new();
static TOKEN: Mutex<Option<Value>> = Mutex::new(None);

extern "C" {
    fn yonder_ios_install_notifications();
    fn yonder_ios_open_notification_settings(
        context: *mut c_void,
        callback: extern "C" fn(*mut c_void, bool),
    );
}

pub async fn open_settings() -> bool {
    use tauri::async_runtime::{channel, Sender};

    extern "C" fn opened(context: *mut c_void, result: bool) {
        let sender = unsafe { Box::from_raw(context.cast::<Sender<bool>>()) };
        let _ = sender.try_send(result);
    }

    let (sender, mut response) = channel(1);
    unsafe {
        yonder_ios_open_notification_settings(Box::into_raw(Box::new(sender)).cast(), opened)
    };
    response.recv().await.unwrap_or(false)
}

pub fn install_ios_delegate() {
    // Tauri has registered Tao's delegate class by now. UIKit has not instantiated it yet.
    unsafe { yonder_ios_install_notifications() };
}

pub async fn registration() -> Option<Value> {
    if permission(false).await != "granted" {
        return None;
    }
    TOKEN.lock().expect("notification token lock").clone()
}

pub fn listen<R: Runtime>(app: &AppHandle<R>) {
    let open_app = app.clone();
    let _ = ON_OPEN.set(Box::new(move || notify_open(&open_app)));
    let token_app = app.clone();
    let _ = ON_TOKEN.set(Box::new(move |value| {
        let _ = token_app.emit_to("main", "yonder-notification-token", value);
    }));
}

#[no_mangle]
extern "C" fn yonder_ios_notification_open(payload: *const c_char) {
    let bytes = unsafe { CStr::from_ptr(payload) }.to_bytes();
    if let Ok(target) = serde_json::from_slice(bytes) {
        *PENDING_OPEN.lock().expect("notification tap lock") = Some(target);
        if let Some(open) = ON_OPEN.get() {
            open();
        }
    }
}

#[no_mangle]
extern "C" fn yonder_ios_notification_token(token: *const c_char, sandbox: bool) {
    let Ok(token) = (unsafe { CStr::from_ptr(token) }).to_str() else {
        return;
    };
    let registration = json!({
        "provider": "apns",
        "token": token,
        "environment": if sandbox { "sandbox" } else { "production" }
    });
    let mut current = TOKEN.lock().expect("notification token lock");
    if current.as_ref() == Some(&registration) {
        return;
    }
    *current = Some(registration.clone());
    drop(current);
    if let Some(update) = ON_TOKEN.get() {
        update(&registration);
    }
}

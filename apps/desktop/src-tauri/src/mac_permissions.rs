use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use tauri::{async_runtime::channel, plugin::TauriPlugin, Runtime, WebviewWindow};

extern "C" {
    fn yonder_mac_open_permissions(permission: i32) -> bool;
    fn yonder_mac_full_disk_status() -> i32;
    fn yonder_mac_accessibility_granted() -> bool;
    fn yonder_mac_request_accessibility();
    fn yonder_mac_microphone_status() -> i32;
    fn yonder_mac_request_microphone(
        context: *mut c_void,
        complete: extern "C" fn(*mut c_void, bool),
    );
    fn yonder_mac_initialize_login_item();
    fn yonder_mac_login_item_status() -> i32;
    fn yonder_mac_set_login_item(enabled: bool) -> bool;
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Permission {
    FullDisk,
    Accessibility,
    Microphone,
    Notifications,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionStatus {
    full_disk: &'static str,
    accessibility: &'static str,
    microphone: &'static str,
}

async fn on_main<R: Runtime, T: Send + 'static>(
    window: WebviewWindow<R>,
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, &'static str> {
    if window.label() != "main" {
        return Err("window_not_allowed");
    }
    let (sender, mut receiver) = channel(1);
    window
        .run_on_main_thread(move || {
            let result = work();
            let _ = sender.try_send(result);
        })
        .map_err(|_| "main_thread_unavailable")?;
    receiver.recv().await.ok_or("main_thread_unavailable")
}

#[tauri::command]
async fn permission_status<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<PermissionStatus, &'static str> {
    on_main(window, || unsafe {
        PermissionStatus {
            full_disk: match yonder_mac_full_disk_status() {
                0 => "off",
                1 => "granted",
                _ => "manual",
            },
            accessibility: if yonder_mac_accessibility_granted() {
                "granted"
            } else {
                "off"
            },
            microphone: match yonder_mac_microphone_status() {
                0 => "default",
                1 => "granted",
                2 => "denied",
                _ => "unknown",
            },
        }
    })
    .await
}

#[tauri::command]
async fn open_settings<R: Runtime>(
    window: WebviewWindow<R>,
    permission: Permission,
) -> Result<(), &'static str> {
    let pane = match permission {
        Permission::FullDisk => 0,
        Permission::Accessibility => 1,
        Permission::Microphone => 2,
        Permission::Notifications => 3,
    };
    on_main(window, move || unsafe { yonder_mac_open_permissions(pane) })
        .await?
        .then_some(())
        .ok_or("system_settings_unavailable")
}

#[tauri::command]
async fn request_accessibility<R: Runtime>(window: WebviewWindow<R>) -> Result<(), &'static str> {
    on_main(window, || unsafe { yonder_mac_request_accessibility() }).await
}

#[tauri::command]
async fn request_microphone<R: Runtime>(window: WebviewWindow<R>) -> Result<(), &'static str> {
    extern "C" fn complete(context: *mut c_void, _granted: bool) {
        let sender = unsafe { Box::from_raw(context.cast::<tauri::async_runtime::Sender<()>>()) };
        let _ = sender.try_send(());
    }

    let (sender, mut receiver) = channel(1);
    on_main(window, move || unsafe {
        // AVFoundation invokes the completion exactly once, which releases the sender.
        yonder_mac_request_microphone(Box::into_raw(Box::new(sender)).cast(), complete);
    })
    .await?;
    receiver.recv().await.ok_or("microphone_request_failed")
}

fn current_login_item_status() -> &'static str {
    match unsafe { yonder_mac_login_item_status() } {
        0 => "disabled",
        1 => "enabled",
        2 => "approval",
        _ => "unavailable",
    }
}

#[tauri::command]
async fn login_item_status<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<&'static str, &'static str> {
    on_main(window, current_login_item_status).await
}

#[tauri::command]
async fn set_login_item<R: Runtime>(
    window: WebviewWindow<R>,
    enabled: bool,
) -> Result<&'static str, &'static str> {
    on_main(window, move || {
        if unsafe { yonder_mac_set_login_item(enabled) } {
            Ok(current_login_item_status())
        } else {
            Err("login_item_update_failed")
        }
    })
    .await?
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("yonder-mac-permissions")
        .invoke_handler(tauri::generate_handler![
            permission_status,
            open_settings,
            request_accessibility,
            request_microphone,
            login_item_status,
            set_login_item,
        ])
        .setup(|_, _| {
            unsafe { yonder_mac_initialize_login_item() };
            Ok(())
        })
        .build()
}

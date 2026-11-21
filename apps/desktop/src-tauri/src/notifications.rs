use serde_json::Value;
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[cfg(not(target_os = "android"))]
use std::sync::Mutex;
#[cfg(not(target_os = "android"))]
use tauri::Emitter;

#[cfg(not(target_os = "android"))]
static PENDING_OPEN: Mutex<Option<Value>> = Mutex::new(None);

#[cfg(target_os = "android")]
struct AndroidNotifications<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(any(target_os = "ios", target_os = "macos"))]
#[path = "notifications_apple.rs"]
mod apple;

#[cfg(target_os = "ios")]
#[path = "notifications_ios.rs"]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::install_ios_delegate;

#[tauri::command]
async fn request_permission<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    return android(&app, "requestPermission").await;
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        let _ = app;
        Ok(apple::permission(true).await == "granted")
    }
    #[cfg(all(desktop, not(target_os = "macos")))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .request_permission()
            .map(|state| state == tauri::plugin::PermissionState::Granted)
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
async fn permission_status<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    #[cfg(target_os = "android")]
    return android(&app, "permissionStatus").await;
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        let _ = app;
        Ok(apple::permission(false).await.into())
    }
    #[cfg(all(desktop, not(target_os = "macos")))]
    {
        let _ = app;
        Ok("granted".into())
    }
}

#[cfg(target_os = "ios")]
#[tauri::command]
async fn open_settings() -> bool {
    ios::open_settings().await
}

#[tauri::command]
async fn push_registration<R: Runtime>(app: AppHandle<R>) -> Result<Option<Value>, String> {
    #[cfg(target_os = "android")]
    return android(&app, "pushRegistration").await;
    #[cfg(target_os = "ios")]
    {
        let _ = app;
        Ok(ios::registration().await)
    }
    #[cfg(desktop)]
    {
        let _ = app;
        Ok(None)
    }
}

#[tauri::command]
async fn take_open<R: Runtime>(app: AppHandle<R>) -> Result<Option<Value>, String> {
    #[cfg(target_os = "android")]
    return android(&app, "takeOpen").await;
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(PENDING_OPEN.lock().expect("notification tap lock").take())
    }
}

#[cfg(desktop)]
#[tauri::command]
async fn show_desktop<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    body: String,
    target: Value,
) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    #[cfg(target_os = "macos")]
    if apple::permission(false).await != "granted" {
        return Ok(false);
    }
    if app
        .webview_windows()
        .values()
        .any(|window| window.is_focused().unwrap_or(false))
    {
        return Ok(false);
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .extra("yonderTarget", target)
        .show()
        .map(|_| true)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "android")]
async fn android<R: Runtime, T: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    method: &str,
) -> Result<T, String> {
    app.state::<AndroidNotifications<R>>()
        .0
        .run_mobile_plugin_async(method, ())
        .await
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "android"))]
fn notify_open<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(desktop)]
        {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = window.emit("yonder-notification-open", ());
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("yonder-notifications");
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        request_permission,
        permission_status,
        push_registration,
        take_open,
        show_desktop
    ]);
    #[cfg(target_os = "android")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        request_permission,
        permission_status,
        push_registration,
        take_open
    ]);
    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        request_permission,
        permission_status,
        open_settings,
        push_registration,
        take_open
    ]);

    builder
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidNotifications(_api.register_android_plugin(
                "net.yonderbot.app",
                "YonderNotificationsPlugin",
            )?));

            #[cfg(target_os = "ios")]
            ios::listen(app);

            #[cfg(desktop)]
            {
                use tauri_plugin_notification::NotificationExt;
                let app = app.clone();
                app.notification().on_action({
                    let app = app.clone();
                    move |action| {
                        if action.action_id() == "tap" {
                            if let Some(target) = action
                                .notification()
                                .and_then(|notification| notification.extra().get("yonderTarget"))
                            {
                                *PENDING_OPEN.lock().expect("notification tap lock") =
                                    Some(target.clone());
                                notify_open(&app);
                            }
                        }
                    }
                })?;
            }

            Ok(())
        })
        .build()
}

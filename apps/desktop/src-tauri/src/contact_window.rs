use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const CONTACTS: &str = "add-contacts";

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
        if let Some(contacts) = window.app_handle().get_webview_window(CONTACTS) {
            let _ = contacts.close();
        }
    }
}

fn require_window(window: &WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() == label { Ok(()) } else { Err("window not allowed".into()) }
}

#[tauri::command]
pub async fn open_add_contacts(app: AppHandle, window: WebviewWindow, title: String, query: String) -> Result<(), String> {
    require_window(&window, "main")?;
    if let Some(existing) = app.get_webview_window(CONTACTS) {
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let contacts = WebviewWindowBuilder::new(&app, CONTACTS, WebviewUrl::App(format!("contacts/add?query={query}").into()))
        .title(title)
        .inner_size(380.0, 560.0)
        .visible(false)
        .focused(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .position((position.x as f64 + size.width as f64 / 2.0) / scale - 190.0,
                  (position.y as f64 + size.height as f64 / 2.0) / scale - 280.0)
        .build()
        .map_err(|e| e.to_string())?;
    let native = contacts.clone();
    let (ready, result) = std::sync::mpsc::channel();
    contacts.run_on_main_thread(move || {
        let shown = (|| -> Result<(), String> {
            #[cfg(target_os = "macos")]
            {
            use objc2_app_kit::{NSWindow, NSWindowButton};
                let pointer = native.ns_window().map_err(|e| e.to_string())?;
                // Tauri owns the NSWindow; AppKit access stays on the main thread.
                let window = unsafe { &*(pointer as *const NSWindow) };
                for kind in [NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
                    if let Some(button) = window.standardWindowButton(kind) { button.setHidden(true); }
                }
            }
            native.show().map_err(|e| e.to_string())?;
            native.set_focus().map_err(|e| e.to_string())
        })();
        let _ = ready.send(shown);
    }).map_err(|e| e.to_string())?;
    result.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn request_main_session(app: AppHandle, window: WebviewWindow, request_id: String) -> Result<(), String> {
    require_window(&window, CONTACTS)?;
    app.emit_to("main", "contacts-session-request", request_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn provide_contacts_session(app: AppHandle, window: WebviewWindow, request_id: String, access_token: Option<String>) -> Result<(), String> {
    require_window(&window, "main")?;
    app.emit_to(CONTACTS, "contacts-session", serde_json::json!({ "requestId": request_id, "accessToken": access_token }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn contact_added(app: AppHandle, window: WebviewWindow, conversation_id: String) -> Result<(), String> {
    require_window(&window, CONTACTS)?;
    let main = app.get_webview_window("main").ok_or("main window is unavailable")?;
    app.emit_to("main", "contact-added", conversation_id).map_err(|e| e.to_string())?;
    window.close().map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_add_contacts(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_window(&window, "main")?;
    if let Some(contacts) = app.get_webview_window(CONTACTS) {
        contacts.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

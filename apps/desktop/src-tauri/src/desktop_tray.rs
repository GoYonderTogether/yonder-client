use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

const MAIN: &str = "main";
const PANEL: &str = "tray-panel";
#[cfg(any(target_os = "macos", target_os = "windows"))]
const TRAY: &str = "yonder-tasks";
#[cfg(any(target_os = "macos", target_os = "windows"))]
const PANEL_SIZE: (f64, f64) = (360.0, 300.0);

#[derive(Default)]
pub struct TrayState {
    activity: Mutex<serde_json::Value>,
}

fn allowed(window: &WebviewWindow, label: &str) -> Result<(), String> {
    if cfg!(any(target_os = "macos", target_os = "windows")) && window.label() == label {
        Ok(())
    } else {
        Err("window not allowed".into())
    }
}

fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn preference_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(error)?.join("desktop-close-behavior"))
}

fn close_behavior(app: &AppHandle) -> &'static str {
    match preference_file(app).and_then(|p| fs::read_to_string(p).map_err(error)) {
        Ok(value) if value.trim() == "quit" => "quit",
        _ => "tray",
    }
}

#[tauri::command]
pub fn get_desktop_close_behavior(window: WebviewWindow) -> Result<&'static str, String> {
    allowed(&window, MAIN)?;
    Ok(close_behavior(window.app_handle()))
}

#[tauri::command]
pub fn set_desktop_close_behavior(window: WebviewWindow, behavior: String) -> Result<(), String> {
    allowed(&window, MAIN)?;
    if !matches!(behavior.as_str(), "tray" | "quit") {
        return Err("invalid close behavior".into());
    }
    let path = preference_file(window.app_handle())?;
    fs::create_dir_all(path.parent().ok_or("missing config directory")?).map_err(error)?;
    fs::write(path, behavior).map_err(error)
}

#[tauri::command]
pub fn tray_get_activity(window: WebviewWindow) -> Result<serde_json::Value, String> {
    allowed(&window, PANEL)?;
    let state = window.state::<TrayState>();
    let activity = state.activity.lock().map_err(error)?.clone();
    Ok(activity)
}

#[tauri::command]
pub fn tray_publish_activity(
    window: WebviewWindow,
    activity: serde_json::Value,
) -> Result<(), String> {
    allowed(&window, MAIN)?;
    let app = window.app_handle();
    let state = app.state::<TrayState>();
    *state.activity.lock().map_err(error)? = activity;
    // Notify only this webview without exposing other windows' events or interpolating data.
    if let Some(panel) = app.get_webview_window(PANEL) {
        panel.eval("window.dispatchEvent(new Event('yonder-tray-activity'))").map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub fn tray_panel_action(window: WebviewWindow, action: String) -> Result<(), String> {
    allowed(&window, PANEL)?;
    let app = window.app_handle();
    match action.as_str() {
        "dismiss" => window.hide().map_err(error),
        "open-main" | "settings" | "check-updates" => {
            show_main(app)?;
            if action != "open-main" {
                app.emit_to(MAIN, "tray-main-action", action).map_err(error)?;
            }
            window.hide().map_err(error)
        }
        "quit" => {
            // The panel asks for explicit confirmation before invoking this action.
            // ExitRequested runs the existing recorder plugin's finish path.
            app.exit(0);
            Ok(())
        }
        _ => Err("invalid tray action".into()),
    }
}

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    let main = app.get_webview_window(MAIN).ok_or("main window is unavailable")?;
    main.show().map_err(error)?;
    main.unminimize().map_err(error)?;
    main.set_focus().map_err(error)
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } if window.label() == MAIN => {
            // For a normal close, leave the recorder plugin free to protect active audio
            // and pending uploads. If it does not intervene, Destroyed handles the panel.
            let app = window.app_handle();
            if close_behavior(app) == "tray"
                && app.tray_by_id(TRAY).is_some()
                && app.get_webview_window(PANEL).is_some()
                && window.hide().is_ok()
            {
                api.prevent_close();
            }
        }
        tauri::WindowEvent::Destroyed if window.label() == MAIN => {
            // The invisible panel must not keep the process alive after a normal close.
            if let Some(panel) = window.app_handle().get_webview_window(PANEL) {
                let _ = panel.destroy();
            }
        }
        tauri::WindowEvent::Focused(false) if window.label() == PANEL => {
            let _ = window.hide();
        }
        tauri::WindowEvent::CloseRequested { api, .. } if window.label() == PANEL => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
    let _ = (window, event);
}

pub fn setup(app: &AppHandle) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if let Err(e) = setup_native(app) {
        // Don't prevent a normal close or leave an invisible window keeping the process alive.
        if let Some(panel) = app.get_webview_window(PANEL) {
            let _ = panel.destroy();
        }
        eprintln!("Yonder tray unavailable: {e}");
    }
    let _ = app;
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn setup_native(app: &AppHandle) -> Result<(), String> {
    let icon = app.default_window_icon().ok_or("desktop icon is unavailable")?;
    WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("index.html?tray-panel=1".into()))
        .title("Yonder")
        .inner_size(PANEL_SIZE.0, PANEL_SIZE.1)
        .visible(false)
        .focused(false)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()
        .map_err(error)?;
    TrayIconBuilder::with_id(TRAY)
        .icon(icon.clone())
        .tooltip("Yonder")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                rect,
                ..
            } = event {
                let app = tray.app_handle();
                if toggle_panel(app, position, rect).is_err() {
                    // If the panel fails, clicking the tray remains a way to recover the main UI.
                    let _ = show_main(app);
                }
            }
        })
        .build(app)
        .map_err(error)?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn toggle_panel(
    app: &AppHandle,
    cursor: PhysicalPosition<f64>,
    rect: tauri::Rect,
) -> Result<(), String> {
    let panel = app.get_webview_window(PANEL).ok_or("tray panel is unavailable")?;
    if panel.is_visible().map_err(error)? {
        return panel.hide().map_err(error);
    }
    let monitor = panel.monitor_from_point(cursor.x, cursor.y).map_err(error)?
        .ok_or("tray is outside of a display")?;
    let scale = monitor.scale_factor();
    let pos = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    let area = monitor.work_area();
    let left = f64::from(area.position.x);
    let top = f64::from(area.position.y);
    let right = left + f64::from(area.size.width);
    let bottom = top + f64::from(area.size.height);
    let width = (PANEL_SIZE.0 * scale).min(right - left);
    let height = (PANEL_SIZE.1 * scale).min(bottom - top);
    let x = (pos.x + (size.width - width) / 2.0).clamp(left, (right - width).max(left));
    let below = pos.y + size.height;
    let y = (if below + height <= bottom { below } else { pos.y - height })
        .clamp(top, (bottom - height).max(top));
    panel.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32)).map_err(error)?;
    panel.set_size(PhysicalSize::new(width.round() as u32, height.round() as u32)).map_err(error)?;
    panel.show().map_err(error)?;
    panel.set_focus().map_err(error)
}

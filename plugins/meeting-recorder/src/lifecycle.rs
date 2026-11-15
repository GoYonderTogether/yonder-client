use crate::desktop::DesktopRecorder;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, Runtime, WindowEvent,
};

const TRAY: &str = "meeting-recording";
struct RecordingControl<R: Runtime>(MenuItem<R>);

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(
        app,
        "meeting-open",
        "打开 Yonder / Open Yonder",
        true,
        None::<&str>,
    )?;
    let stop = MenuItem::with_id(
        app,
        "meeting-stop",
        "结束录音 / End recording",
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "meeting-quit",
        "退出 Yonder / Quit Yonder",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open, &stop, &quit])?;
    app.manage(RecordingControl(stop));
    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("录音纪要 / Meeting recordings")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "meeting-open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "meeting-stop" => {
                app.state::<DesktopRecorder>().finish();
                sync_tray(app, false);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            "meeting-quit" => app.exit(0),
            _ => (),
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?.set_visible(false)?;
    Ok(())
}

pub fn recording_indicator<R: Runtime>(app: &AppHandle<R>) -> Option<bool> {
    app.try_state::<RecordingControl<R>>()
        .and_then(|item| item.0.is_enabled().ok())
}

pub fn sync_tray<R: Runtime>(app: &AppHandle<R>, active: bool) {
    if let Some(tray) = app.tray_by_id(TRAY) {
        let _ = tray.set_tooltip(Some(if active {
            "正在录音 / Recording"
        } else {
            "录音已停止 / Recording stopped"
        }));
        if let Some(control) = app.try_state::<RecordingControl<R>>() {
            let _ = control.0.set_enabled(active);
        }
        // A background failure must leave an entry to reopen the hidden window.
        let hidden = app
            .get_webview_window("main")
            .is_some_and(|window| !window.is_visible().unwrap_or(true));
        let _ = tray.set_visible(active || hidden);
    }
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            if app.state::<DesktopRecorder>().is_recording() {
                api.prevent_close();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
        }
        RunEvent::ExitRequested { .. } => app.state::<DesktopRecorder>().finish(),
        _ => (),
    }
}

use tauri::Manager;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod apple_resources;

mod device_download;
mod device_info;
mod notifications;

#[cfg(target_os = "macos")]
mod mac_permissions;

#[cfg(desktop)]
mod contact_window;

#[cfg(desktop)]
mod desktop_tray;

#[cfg(desktop)]
mod local_files;
#[cfg(desktop)]
mod local_files_access;
#[cfg(desktop)]
mod local_files_operations;

#[cfg(any(desktop, target_os = "ios"))]
mod local_files_store;

#[cfg(target_os = "macos")]
mod selected_note;

#[cfg(target_os = "android")]
mod android_update;

/// Bring up the shell window. The window is declared in `tauri.conf.json` and loads the bundled
/// web build (apps/web/dist); there is nothing to resolve at runtime.
///
/// `mobile_entry_point` is what the generated iOS/Android projects link against: without it the
/// staticlib has no `main` for the mobile runtime and the Xcode "Build Rust Code" phase fails with
/// "does not include required runtime symbols". It is a no-op on desktop, where `src/main.rs`
/// calls `run()` directly.
///
/// On desktop the keyring plugin is the one capability the shell adds beyond a window: the refresh
/// token is kept in the OS credential store rather than in the webview's storage. The plugin does not
/// exist on mobile; see apps/web/src/lib/keychain.ts for what the mobile shells do instead.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_meeting_recorder::init())
        .plugin(device_info::init());
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    let builder = builder.plugin(apple_resources::init());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(mac_permissions::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_update::init());
    #[cfg(desktop)]
    let builder = builder
        .on_window_event(contact_window::on_window_event)
        .on_window_event(desktop_tray::on_window_event)
        .manage(desktop_tray::TrayState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_tray::get_desktop_close_behavior,
            desktop_tray::set_desktop_close_behavior,
            desktop_tray::tray_get_activity,
            desktop_tray::tray_publish_activity,
            desktop_tray::tray_panel_action,
            contact_window::open_add_contacts,
            contact_window::request_main_session,
            contact_window::provide_contacts_session,
            contact_window::contact_added,
            contact_window::close_add_contacts,
            local_files::local_files_activate,
            local_files::local_files_reset,
            local_files::local_files_authorize,
            local_files::local_files_cancel,
            local_files::local_files_revoke,
            local_files::local_files_ready,
            local_files::local_files_execute
        ])
        .manage(local_files_store::LocalFilesState::default())

        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init());
    let app = builder
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(device_download::init())
        .plugin(notifications::init())
        .setup(|app| {
            // Local/CI builds have no updater key. Release builds inject the real public key;
            // without it we leave the plugin unregistered rather than trust a placeholder.
            #[cfg(desktop)]
            if app.config().plugins.0.get("updater")
                .and_then(|config| config.get("pubkey"))
                .and_then(|key| key.as_str())
                .is_some_and(|key| !key.trim().is_empty())
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let window = app
                .get_webview_window("main")
                .ok_or("tauri.conf.json declares no window labelled \"main\"")?;
            window.show()?;
            #[cfg(desktop)]
            desktop_tray::setup(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to run Yonder");
    #[cfg(target_os = "ios")]
    notifications::install_ios_delegate();
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = event {
            let _ = desktop_tray::show_main(app);
        }
        let _ = (app, event);
    });
}

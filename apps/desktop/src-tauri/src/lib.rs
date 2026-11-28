use tauri::Manager;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod apple_resources;

mod device_download;
mod device_info;
#[cfg(desktop)]
mod device_model;
#[cfg(desktop)]
mod device_model_http;
#[cfg(desktop)]
mod device_model_sse;

#[cfg(desktop)]
mod desktop_credentials;

#[cfg(target_os = "ios")]
mod ios_chat_attachments;
#[cfg(target_os = "ios")]
mod ios_chat_microphone;
mod notifications;

#[cfg(target_os = "macos")]
mod mac_permissions;

#[cfg(desktop)]
mod contact_window;

#[cfg(desktop)]
mod desktop_tray;
#[cfg(desktop)]
mod desktop_update;

#[cfg(desktop)]
mod connector_tools;
/// A connector package the owner's Bot wrote for this device (20261128-people-archive 03, 03b).
#[cfg(desktop)]
mod custom_connector_commands;
#[cfg(desktop)]
mod custom_connector_paths;
#[cfg(desktop)]
mod custom_connector_runner;
#[cfg(desktop)]
mod custom_connector_store;
#[cfg(desktop)]
mod custom_connector_support;
#[cfg(desktop)]
mod custom_connectors;
#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
mod desktop_command;
#[cfg(target_os = "macos")]
mod desktop_macos;
#[cfg(desktop)]
mod desktop_time;
#[cfg(windows)]
mod desktop_windows;
#[cfg(desktop)]
mod browser;
#[cfg(desktop)]
mod browser_bsk;
#[cfg(desktop)]
mod browser_commands;
#[cfg(desktop)]
mod browser_limits;
#[cfg(desktop)]
mod browser_ops;
#[cfg(desktop)]
mod browser_png;
#[cfg(windows)]
mod browser_windows;
#[cfg(desktop)]
mod local_files;
#[cfg(desktop)]
mod local_files_access;
#[cfg(desktop)]
mod local_files_binary;
#[cfg(desktop)]
mod local_files_grep;
#[cfg(desktop)]
mod local_files_grep_file;
#[cfg(desktop)]
mod local_files_limits;
#[cfg(desktop)]
mod local_files_mutations;
#[cfg(windows)]
mod local_files_mutations_windows;
#[cfg(desktop)]
mod local_files_operations;
#[cfg(desktop)]
mod local_files_read;
#[cfg(all(desktop, test))]
#[path = "local_files_read_test.rs"]
mod local_files_read_test;
#[cfg(desktop)]
mod local_files_scan;

#[cfg(desktop)]
mod provider_relay;
#[cfg(any(desktop, target_os = "ios"))]
mod local_files_store;
#[cfg(desktop)]
mod local_files_text;

#[cfg(desktop)]
mod shell;
#[cfg(desktop)]
mod shell_elevation;
#[cfg(windows)]
mod shell_elevation_windows;
#[cfg(desktop)]
mod shell_job;
#[cfg(desktop)]
mod shell_jobs;
#[cfg(desktop)]
mod shell_limits;
#[cfg(desktop)]
mod shell_output;
#[cfg(desktop)]
mod shell_process;
#[cfg(windows)]
mod shell_process_windows;
#[cfg(desktop)]
mod shell_runner;
#[cfg(test)]
mod shell_test_support;

#[cfg(target_os = "macos")]
mod selected_note;

#[cfg(target_os = "android")]
mod android_update;

#[cfg(target_os = "ios")]
mod keyboard_ios;

/// Bring up the shell window. The window is declared in `tauri.conf.json` and loads the bundled
/// web build (apps/web/dist); there is nothing to resolve at runtime.
///
/// `mobile_entry_point` is what the generated iOS/Android projects link against: without it the
/// staticlib has no `main` for the mobile runtime and the Xcode "Build Rust Code" phase fails with
/// "does not include required runtime symbols". It is a no-op on desktop, where `src/main.rs`
/// calls `run()` directly.
///
/// On desktop the refresh token is kept in the OS credential store; see
/// apps/web/src/lib/keychain.ts for what the mobile shells do instead.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_meeting_recorder::init())
        .plugin(device_info::init());
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    let builder = builder.plugin(apple_resources::init());
    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(ios_chat_attachments::init())
        .invoke_handler(tauri::generate_handler![
            ios_chat_microphone::prepare_chat_microphone
        ]);
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(mac_permissions::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_update::init());
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_haptics::init());
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
            desktop_update::restore_channel_update,
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
            local_files::local_files_execute,
            custom_connector_commands::custom_connector_confirm,
            custom_connector_commands::custom_connector_execute,
            custom_connector_commands::custom_connector_cancel,
            custom_connector_commands::custom_connector_poll,
            custom_connector_commands::custom_connector_collect,
            custom_connector_commands::custom_connector_ack,
                        shell::shell_execute,
            shell::shell_cancel,
            desktop_command::desktop_execute,
            browser_commands::browser_execute,
            browser_commands::browser_cancel,
            browser_commands::browser_status,
            browser_commands::browser_install,
            provider_relay::provider_relay_bind,
            provider_relay::provider_relay_cancel,
            provider_relay::provider_relay_execute,
            device_model::device_model_activate,
            device_model::device_model_reset,
            desktop_credentials::get_desktop_refresh_token,
            desktop_credentials::set_desktop_refresh_token,
            device_model::device_model_register,
            device_model::device_model_set_key,
            device_model::device_model_ready,
            device_model::device_model_execute,
            device_model::device_model_cancel
        ])
        .manage(local_files_store::LocalFilesState::default())
        .manage(custom_connector_support::CustomConnectorState::default())
        .manage(browser_commands::BrowserState::local())
        .manage(device_model::DeviceModelState::default())
        .plugin(provider_relay::init())
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
            #[cfg(target_os = "ios")]
            keyboard_ios::follow(&window);
            #[cfg(desktop)]
            desktop_tray::setup(app.handle());
            // Terminal jobs are device state: read the records back, re-adopt a process that still
            // runs, and start the watcher that reports each finish to the webview once.
            #[cfg(desktop)]
            {
                let runner = shell::init(app.handle())?;
                app.manage(shell::ShellState(std::sync::Arc::new(runner)));
                shell::resume(app.handle());
                shell::watch(app.handle().clone());
            }
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

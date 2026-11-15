use tauri::Manager;

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
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_keyring::init());
    builder
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("tauri.conf.json declares no window labelled \"main\"")?;
            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Yonder");
}

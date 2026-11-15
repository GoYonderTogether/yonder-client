fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().plugin(
        "android-update",
        tauri_build::InlinedPlugin::new()
            .commands(&["latest", "versionCode", "downloadAndInstall"])
            .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ))
    .expect("failed to run tauri-build")
}

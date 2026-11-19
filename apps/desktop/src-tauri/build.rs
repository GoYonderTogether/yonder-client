fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rerun-if-changed=../apple/DeviceDownload.mm");
        cc::Build::new()
            .cpp(true)
            .flag("-fobjc-arc")
            .file("../apple/DeviceDownload.mm")
            .compile("yonder_apple_device_download");
    }
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("ios" | "macos")
    ) {
        println!("cargo:rerun-if-changed=../apple/Notifications.mm");
        println!("cargo:rerun-if-changed=../apple/DeviceName.mm");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            println!("cargo:rustc-link-lib=framework=SystemConfiguration");
        }
        cc::Build::new()
            .cpp(true)
            .flag("-fobjc-arc")
            .file("../apple/Notifications.mm")
            .file("../apple/DeviceName.mm")
            .compile("yonder_apple");
    }
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin(
                "android-update",
                tauri_build::InlinedPlugin::new()
                    .commands(&["latest", "versionCode", "downloadAndInstall"])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            )
            .plugin(
                "yonder-device-info",
                tauri_build::InlinedPlugin::new()
                    .commands(&["system_name"])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            )
            .plugin(
                "yonder-device-download",
                tauri_build::InlinedPlugin::new().commands(&["open", "share", "copy"]),
            )
            .plugin(
                "yonder-notifications",
                tauri_build::InlinedPlugin::new()
                    .commands(&[
                        "request_permission",
                        "permission_status",
                        "push_registration",
                        "take_open",
                        "show_desktop",
                        "registerListener",
                        "removeListener",
                    ])
                    .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
            ),
    )
    .expect("failed to run tauri-build")
}

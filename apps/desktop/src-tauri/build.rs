fn main() {
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("ios" | "macos")
    ) {
        println!("cargo:rerun-if-changed=../apple/Notifications.mm");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        cc::Build::new()
            .cpp(true)
            .flag("-fobjc-arc")
            .file("../apple/Notifications.mm")
            .compile("yonder_apple_notifications");
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

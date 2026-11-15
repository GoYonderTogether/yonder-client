fn main() {
    tauri_plugin::Builder::new(&["set_owner", "get_state", "start", "stop", "read_audio"])
        .android_path("android")
        .ios_path("ios")
        .build();
}

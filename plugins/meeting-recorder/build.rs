fn main() {
    tauri_plugin::Builder::new(&[
        "set_owner",
        "get_state",
        "start",
        "stop",
        "pause",
        "resume",
        "read_audio",
        "configure_upload",
        "get_upload_jobs",
        "queue_upload",
    ])
    .android_path("android")
    .ios_path("ios")
    .build();
}

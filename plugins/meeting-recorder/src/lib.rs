mod model;
#[doc(hidden)]
pub mod persistence;
mod wav;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod capture;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod capture_clock;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod desktop;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod lifecycle;

pub use model::{RecorderState, Recording, Segment};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, WebviewWindow,
};

#[cfg(any(target_os = "android", target_os = "ios"))]
struct MobileRecorder<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_meeting_recorder);

fn main_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    if window.label() != "main" {
        return Err("meeting_window_not_allowed".into());
    }
    Ok(())
}

#[tauri::command]
async fn set_owner<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: Option<String>,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(&app, "setOwner", serde_json::json!({ "ownerId": owner_id }));
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let state = app
            .state::<desktop::DesktopRecorder>()
            .set_owner(owner_id)?;
        lifecycle::sync_tray(&app, state.active_id.is_some());
        Ok(state)
    }
}

#[tauri::command]
async fn get_state<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(&app, "getState", serde_json::json!({ "ownerId": owner_id }));
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let state = app
            .state::<desktop::DesktopRecorder>()
            .get_state(owner_id)?;
        lifecycle::sync_tray(&app, state.active_id.is_some());
        Ok(state)
    }
}

#[tauri::command]
async fn start<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    title: String,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(
        &app,
        "start",
        serde_json::json!({ "ownerId": owner_id, "title": title }),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let state = app
            .state::<desktop::DesktopRecorder>()
            .start(owner_id, title)?;
        lifecycle::sync_tray(&app, true);
        Ok(state)
    }
}

#[tauri::command]
async fn stop<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    recording_id: String,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(
        &app,
        "stop",
        serde_json::json!({ "ownerId": owner_id, "recordingId": recording_id }),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let state = app
            .state::<desktop::DesktopRecorder>()
            .stop(owner_id, recording_id)?;
        lifecycle::sync_tray(&app, false);
        Ok(state)
    }
}

#[tauri::command]
async fn read_audio<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    recording_id: String,
    segment_index: usize,
) -> Result<tauri::ipc::Response, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        #[derive(serde::Deserialize)]
        struct Audio {
            bytes: Vec<u8>,
        }
        let audio: Audio = mobile(
            &app,
            "readAudio",
            serde_json::json!({ "ownerId": owner_id, "recordingId": recording_id, "segmentIndex": segment_index }),
        )?;
        Ok(tauri::ipc::Response::new(audio.bytes))
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    app.state::<desktop::DesktopRecorder>()
        .read_audio(owner_id, recording_id, segment_index)
        .map(tauri::ipc::Response::new)
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn mobile<R: Runtime, T: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    command: &str,
    args: serde_json::Value,
) -> Result<T, String> {
    app.state::<MobileRecorder<R>>()
        .0
        .run_mobile_plugin(command, args)
        .map_err(|e| e.to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    build(None)
}

/// Reads the actual native end-recording control state for host integration checks.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn recording_indicator<R: Runtime>(app: &AppHandle<R>) -> Option<bool> {
    lifecycle::recording_indicator(app)
}

/// Host-selected private storage, used by the isolated native acceptance app.
pub fn init_with_directory<R: Runtime>(directory: std::path::PathBuf) -> TauriPlugin<R> {
    build(Some(directory))
}

fn build<R: Runtime>(directory: Option<std::path::PathBuf>) -> TauriPlugin<R> {
    Builder::new("meeting-recorder")
        .invoke_handler(tauri::generate_handler![
            set_owner, get_state, start, stop, read_audio
        ])
        .setup(move |app, _api| {
            #[cfg(target_os = "android")]
            app.manage(MobileRecorder(_api.register_android_plugin(
                "net.yonder.meetingrecorder",
                "MeetingRecorderPlugin",
            )?));
            #[cfg(target_os = "ios")]
            app.manage(MobileRecorder(
                _api.register_ios_plugin(init_plugin_meeting_recorder)?,
            ));
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let root = directory
                    .unwrap_or(app.path().app_local_data_dir()?.join("meeting-recordings"));
                let handle = app.clone();
                app.manage(desktop::DesktopRecorder::with_state_listener(
                    root,
                    move |active| {
                        let target = handle.clone();
                        // Enqueue, never wait for the main thread from the recorder worker.
                        let _ = handle
                            .run_on_main_thread(move || lifecycle::sync_tray(&target, active));
                    },
                )?);
                lifecycle::setup_tray(app)?;
            }
            Ok(())
        })
        .on_event(|_app, _event| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            lifecycle::on_event(_app, _event);
        })
        .build()
}

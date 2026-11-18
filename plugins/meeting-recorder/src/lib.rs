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
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod upload;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod upload_http;

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
        app.state::<upload::UploadQueue>()
            .retain_owner(owner_id.as_deref());
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
    conversation_id: Option<String>,
    separate_speakers: Option<bool>,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    let separate_speakers = separate_speakers.unwrap_or_default();
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(
        &app,
        "start",
        serde_json::json!({ "ownerId": owner_id, "title": title, "separateSpeakers": separate_speakers }),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let state = app
            .state::<desktop::DesktopRecorder>()
            .start_for_conversation(owner_id, title, conversation_id, separate_speakers)?;
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
async fn pause<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    recording_id: String,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(
        &app,
        "pause",
        serde_json::json!({ "ownerId": owner_id, "recordingId": recording_id }),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    app.state::<desktop::DesktopRecorder>()
        .pause(owner_id, recording_id)
}

#[tauri::command]
async fn resume<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    recording_id: String,
) -> Result<RecorderState, String> {
    main_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return mobile(
        &app,
        "resume",
        serde_json::json!({ "ownerId": owner_id, "recordingId": recording_id }),
    );
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    app.state::<desktop::DesktopRecorder>()
        .resume(owner_id, recording_id)
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

#[tauri::command]
async fn configure_upload<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    base_url: String,
    access_token: String,
) -> Result<(), String> {
    main_window(&window)?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        app.state::<upload::UploadQueue>()
            .configure(owner_id, base_url, access_token)?;
        lifecycle::sync_tray(&app, app.state::<desktop::DesktopRecorder>().is_recording());
        return Ok(());
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    Err("meeting_upload_unsupported".into())
}

#[tauri::command]
async fn get_upload_jobs<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
) -> Result<serde_json::Value, String> {
    main_window(&window)?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return serde_json::to_value(app.state::<upload::UploadQueue>().jobs(owner_id)?)
        .map_err(|_| "meeting_upload_unavailable".into());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    Err("meeting_upload_unsupported".into())
}

#[tauri::command]
async fn queue_upload<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    owner_id: String,
    recording_id: String,
    conversation_id: String,
) -> Result<(), String> {
    main_window(&window)?;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    return app
        .state::<upload::UploadQueue>()
        .enqueue(owner_id, recording_id, conversation_id);
    #[cfg(any(target_os = "android", target_os = "ios"))]
    Err("meeting_upload_unsupported".into())
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
            set_owner,
            get_state,
            start,
            stop,
            pause,
            resume,
            read_audio,
            configure_upload,
            get_upload_jobs,
            queue_upload
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
                let recorder =
                    desktop::DesktopRecorder::with_state_listener(root.clone(), move |active| {
                        let target = handle.clone();
                        // Enqueue, never wait for the main thread from the recorder worker.
                        let _ = handle
                            .run_on_main_thread(move || lifecycle::sync_tray(&target, active));
                    })?;
                let upload_handle = app.clone();
                app.manage(upload::UploadQueue::new(
                    root,
                    recorder.clone(),
                    move || {
                        let target = upload_handle.clone();
                        let _ = upload_handle.run_on_main_thread(move || {
                            lifecycle::sync_tray(
                                &target,
                                target.state::<desktop::DesktopRecorder>().is_recording(),
                            )
                        });
                    },
                )?);
                app.manage(recorder);
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

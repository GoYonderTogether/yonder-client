use std::ffi::c_void;
use tauri::{async_runtime, Runtime, WebviewWindow};

extern "C" {
    fn yonder_ios_prepare_chat_microphone(
        context: *mut c_void,
        complete: extern "C" fn(*mut c_void),
    );
}

#[tauri::command]
pub async fn prepare_chat_microphone<R: Runtime>(
    window: WebviewWindow<R>,
) -> Result<(), &'static str> {
    if window.label() != "main" {
        return Err("window_not_allowed");
    }

    extern "C" fn complete(context: *mut c_void) {
        let sender = unsafe { Box::from_raw(context.cast::<async_runtime::Sender<()>>()) };
        let _ = sender.try_send(());
    }

    let (sender, mut receiver) = async_runtime::channel(1);
    window
        .run_on_main_thread(move || unsafe {
            yonder_ios_prepare_chat_microphone(Box::into_raw(Box::new(sender)).cast(), complete);
        })
        .map_err(|_| "main_thread_unavailable")?;
    receiver.recv().await.ok_or("microphone_request_failed")
}

use std::ffi::c_void;
use tauri::async_runtime;

extern "C" {
    fn yonder_apple_notification_permission(
        request_permission: bool,
        context: *mut c_void,
        callback: extern "C" fn(*mut c_void, i32),
    );
}

extern "C" fn permission_result(context: *mut c_void, status: i32) {
    // The native function owns this allocation until invoking the callback exactly once.
    let sender = unsafe { Box::from_raw(context.cast::<async_runtime::Sender<i32>>()) };
    let _ = sender.try_send(status);
}

pub async fn permission(request: bool) -> &'static str {
    let (sender, mut response) = async_runtime::channel(1);
    unsafe {
        yonder_apple_notification_permission(
            request,
            Box::into_raw(Box::new(sender)).cast(),
            permission_result,
        );
    }
    match response.recv().await {
        Some(2) => "granted",
        Some(1) => "denied",
        _ => "default",
    }
}

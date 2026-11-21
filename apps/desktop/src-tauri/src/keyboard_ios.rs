use std::ffi::c_void;
use tauri::{Runtime, WebviewWindow};

extern "C" {
    fn yonder_ios_follow_keyboard(webview: *mut c_void);
}

/// Let the page move its composer with the keyboard instead of after it (apple/KeyboardFollow.mm).
pub fn follow<R: Runtime>(window: &WebviewWindow<R>) {
    // with_webview supplies the live WKWebView on the UI thread.
    let _ = window.with_webview(|webview| unsafe { yonder_ios_follow_keyboard(webview.inner()) });
}

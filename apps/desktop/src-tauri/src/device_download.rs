#[cfg(mobile)]
use tauri::Manager;
use tauri::{plugin::TauriPlugin, AppHandle, Runtime, Url};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "android")]
struct AndroidShare<R: Runtime>(tauri::plugin::PluginHandle<R>);

fn download_url(url: &str) -> Result<Url, &'static str> {
    let invalid = "Expected a public Yonder device download URL.";
    let url = Url::parse(url).map_err(|_| invalid)?;
    if url.scheme() != "https"
        || url.host_str() != Some("yonder.zethai.cn")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/download"
        || url.fragment().is_some()
    {
        return Err(invalid);
    }

    let mut connect_device = false;
    for (name, value) in url.query_pairs() {
        match (name.as_ref(), value.as_ref()) {
            ("connect-device", "1") if !connect_device => connect_device = true,
            ("platform", "macos" | "windows" | "android" | "ios") => {}
            _ => return Err(invalid),
        }
    }
    connect_device.then_some(url).ok_or(invalid)
}

#[tauri::command]
async fn open<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    app.opener()
        .open_url(download_url(&url)?.to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn copy<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    app.clipboard()
        .write_text(download_url(&url)?.to_string())
        .map_err(|error| error.to_string())
}

#[cfg(mobile)]
#[tauri::command]
async fn share<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    let url = download_url(&url)?.to_string();

    #[cfg(target_os = "android")]
    return app
        .state::<AndroidShare<R>>()
        .0
        .run_mobile_plugin_async("share", serde_json::json!({ "url": url }))
        .await
        .map_err(|error| error.to_string());

    #[cfg(target_os = "ios")]
    {
        use std::ffi::{c_char, c_void, CString};
        extern "C" {
            fn yonder_ios_share_download(webview: *mut c_void, url: *const c_char) -> bool;
        }

        let url = CString::new(url).map_err(|error| error.to_string())?;
        let (send, mut receive) = tauri::async_runtime::channel(1);
        app.get_webview_window("main")
            .ok_or("The Yonder window is not available.")?
            .with_webview(move |webview| {
                // with_webview supplies a live WKWebView on the UI thread.
                let shown = unsafe { yonder_ios_share_download(webview.inner(), url.as_ptr()) };
                let _ = send.try_send(shown);
            })
            .map_err(|error| error.to_string())?;
        if receive.recv().await == Some(true) {
            return Ok(());
        }
        Err("The system share sheet could not be opened.".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("yonder-device-download");
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![open, copy]);
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![open, copy, share]);
    #[cfg(target_os = "android")]
    let builder = builder.setup(|app, api| {
        app.manage(AndroidShare(api.register_android_plugin(
            "net.yonderbot.app",
            "YonderDeviceDownloadPlugin",
        )?));
        Ok(())
    });
    builder.build()
}

#[cfg(test)]
mod tests {
    use super::download_url;

    #[test]
    fn native_actions_only_accept_public_device_download_urls() {
        for url in [
            "https://yonder.zethai.cn/download?connect-device=1",
            "https://yonder.zethai.cn/download?connect-device=1&platform=macos&platform=windows",
        ] {
            assert_eq!(download_url(url).unwrap().as_str(), url);
        }
        for url in [
            "http://yonder.zethai.cn/download?connect-device=1",
            "https://yonder.zethai.cn.evil.invalid/download?connect-device=1",
            "https://token@yonder.zethai.cn/download?connect-device=1",
            "https://yonder.zethai.cn:8080/download?connect-device=1",
            "https://yonder.zethai.cn/sign-in?connect-device=1",
            "https://yonder.zethai.cn/download?connect-device=1#secret",
            "https://yonder.zethai.cn/download?platform=macos",
            "https://yonder.zethai.cn/download?connect-device=1&connect-device=0",
            "https://yonder.zethai.cn/download?connect-device=1&platform=unknown",
            "https://yonder.zethai.cn/download?connect-device=1&token=secret",
        ] {
            assert!(download_url(url).is_err(), "{url}");
        }
    }
}

use tauri::{plugin::TauriPlugin, AppHandle, Runtime};

#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct AndroidDeviceInfo<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[tauri::command]
async fn system_name<R: Runtime>(_app: AppHandle<R>) -> Option<String> {
    #[cfg(target_os = "android")]
    return _app
        .state::<AndroidDeviceInfo<R>>()
        .0
        .run_mobile_plugin_async("systemName", ())
        .await
        .ok();

    #[cfg(target_os = "ios")]
    {
        let (send, mut receive) = tauri::async_runtime::channel(1);
        _app.run_on_main_thread(move || {
            let _ = send.try_send(apple_name());
        })
        .ok()?;
        receive.recv().await.flatten()
    }

    #[cfg(target_os = "macos")]
    return apple_name();
    #[cfg(target_os = "windows")]
    return windows_name();
    #[cfg(target_os = "linux")]
    return std::fs::read_to_string("/proc/sys/kernel/hostname").ok();
    #[cfg(not(any(
        target_os = "android",
        target_os = "ios",
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    )))]
    None
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn apple_name() -> Option<String> {
    use std::ffi::{c_char, c_void, CStr};

    extern "C" {
        fn yonder_apple_device_name(
            context: *mut c_void,
            reply: extern "C" fn(*mut c_void, *const c_char),
        );
    }

    extern "C" fn copy_name(context: *mut c_void, name: *const c_char) {
        if !name.is_null() {
            // The bridge calls this synchronously while the NSString and the output slot live.
            unsafe {
                *context.cast::<Option<String>>() =
                    CStr::from_ptr(name).to_str().ok().map(str::to_owned);
            }
        }
    }

    let mut name: Option<String> = None;
    unsafe { yonder_apple_device_name((&mut name as *mut Option<String>).cast(), copy_name) };
    name
}

#[cfg(target_os = "windows")]
fn windows_name() -> Option<String> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetComputerNameExW(format: i32, name: *mut u16, size: *mut u32) -> i32;
    }
    const COMPUTER_NAME_PHYSICAL_DNS_HOSTNAME: i32 = 5;
    let mut name = [0; 256];
    let mut size = name.len() as u32;
    // The buffer can hold the maximum DNS name with its terminating zero.
    let ok = unsafe {
        GetComputerNameExW(
            COMPUTER_NAME_PHYSICAL_DNS_HOSTNAME,
            name.as_mut_ptr(),
            &mut size,
        )
    } != 0;
    ok.then(|| String::from_utf16_lossy(&name[..size as usize]))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("yonder-device-info")
        .invoke_handler(tauri::generate_handler![system_name]);
    #[cfg(target_os = "android")]
    let builder = builder.setup(|app, api| {
        app.manage(AndroidDeviceInfo(api.register_android_plugin(
            "net.yonderbot.app",
            "YonderDeviceInfoPlugin",
        )?));
        Ok(())
    });
    builder.build()
}

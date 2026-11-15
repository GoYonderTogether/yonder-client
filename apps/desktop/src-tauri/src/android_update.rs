use tauri::{plugin::TauriPlugin, Runtime};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("android-update")
        .setup(|_app, api| {
            api.register_android_plugin("net.yonderbot.app", "UpdatePlugin")?;
            Ok(())
        })
        .build()
}

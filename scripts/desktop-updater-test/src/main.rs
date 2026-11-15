use std::{
    error::Error,
    fs,
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};
use tauri_plugin_updater::UpdaterExt;

const BUILD_VERSION: &str = env!("HARNESS_BUILD_VERSION");

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    let root = PathBuf::from(&args[1]).canonicalize()?;
    assert_eq!(root.parent().and_then(|p| p.to_str()), Some("/private/tmp"));
    assert!(root
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("yonder-updater-bg."));
    let expected_app = root.join("Fixture.app");
    let executable = std::env::current_exe()?.canonicalize()?;
    assert_eq!(executable, expected_app.join("Contents/MacOS/updater-test"));
    assert_eq!(
        tauri_plugin_updater::extract_path_from_executable(&executable)?,
        expected_app
    );
    assert_eq!(
        fs::read_to_string(expected_app.join("Contents/Resources/version"))?.trim(),
        BUILD_VERSION
    );
    let started = root.join(format!("started-{BUILD_VERSION}"));
    let started_tmp = started.with_extension("tmp");
    fs::write(
        &started_tmp,
        format!(
            "{BUILD_VERSION}\n{}\n{}\n",
            std::process::id(),
            executable.display()
        ),
    )?;
    fs::rename(started_tmp, started)?;
    if BUILD_VERSION == "0.2.0" {
        let deadline = Instant::now() + Duration::from_secs(30);
        while !root.join("verified").exists() {
            if Instant::now() >= deadline {
                return Err("parent did not verify restarted process".into());
            }
            thread::sleep(Duration::from_millis(100));
        }
        fs::write(root.join("restart-complete.tmp"), BUILD_VERSION)?;
        fs::rename(
            root.join("restart-complete.tmp"),
            root.join("restart-complete"),
        )?;
        return Ok(());
    }
    assert_eq!(BUILD_VERSION, "0.1.0");
    println!(
        "original native executable: {BUILD_VERSION}, pid {}",
        std::process::id()
    );

    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = "dev.yonder.updater-background-test".into();
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({
            "endpoints": [&args[2]],
            "pubkey": fs::read_to_string(root.join("test.key.pub"))?.trim(),
            "requireSignedVersion": true,
            "dangerousInsecureTransportProtocol": true
        }),
    );
    context.package_info_mut().version = BUILD_VERSION.parse()?;
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)?;
    let updater = app
        .updater_builder()
        .executable_path(&executable)
        .no_proxy()
        .build()?;
    let update = tauri::async_runtime::block_on(updater.check())?
        .ok_or("fixture did not announce an update")?;
    assert_eq!(update.version, "0.2.0");
    let mut downloaded = 0usize;
    let bytes =
        tauri::async_runtime::block_on(update.download(|size, _| downloaded += size, || {}))?;
    assert_eq!(downloaded, bytes.len());
    assert!(!bytes.is_empty());
    println!(
        "checked {}, downloaded and signature-verified {downloaded} bytes",
        update.version
    );
    update.install(&bytes)?;
    assert_eq!(
        fs::read_to_string(expected_app.join("Contents/Resources/version"))?.trim(),
        "0.2.0"
    );
    println!(
        "installed fixture bundle 0.2.0 at {}",
        expected_app.display()
    );
    println!("restarting with Tauri AppHandle::restart");
    app.handle().restart();
}

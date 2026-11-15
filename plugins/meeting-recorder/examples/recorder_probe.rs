//! Isolated local acceptance helper. Synthetic input exists only in this example, never in the plugin.
use std::{io::Write, path::PathBuf, time::Duration};
use tauri_plugin_meeting_recorder::{desktop::DesktopRecorder, persistence::Store};

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let mode = args
        .get(1)
        .ok_or("usage: recorder_probe fixture|inspect|capture DIRECTORY [SECONDS]")?;
    let root = PathBuf::from(
        args.get(2)
            .ok_or("a private isolated directory is required")?,
    );
    match mode.as_str() {
        "fixture" => {
            let store = Store::new(root)?;
            let mut item =
                store.create("qa_fixture", "Synthetic PCM — not microphone", 16_000, 1)?;
            let samples: Vec<i16> = (0..64_000)
                .map(|index| {
                    ((index as f64 * 440.0 * std::f64::consts::TAU / 16_000.0).sin() * 8000.0)
                        as i16
                })
                .collect();
            println!("{}", serde_json::to_string(&item).unwrap());
            std::io::stdout().flush().map_err(|e| e.to_string())?;
            loop {
                std::thread::sleep(Duration::from_secs(4));
                store.append(&mut item, &samples)?;
                println!("{}", serde_json::to_string(&item).unwrap());
                std::io::stdout().flush().map_err(|e| e.to_string())?;
            }
        }
        "inspect" => {
            let store = Store::new(root)?;
            let items = store.list("qa_fixture", None)?;
            for item in &items {
                for segment in &item.segments {
                    store.read_audio("qa_fixture", &item.id, segment.index)?;
                }
            }
            println!("{}", serde_json::to_string_pretty(&items).unwrap());
        }
        "capture" => {
            let seconds: u64 = args
                .get(3)
                .ok_or("capture requires SECONDS")?
                .parse()
                .map_err(|_| "invalid seconds")?;
            if seconds == 0 || seconds > 7200 {
                return Err("capture must be 1..7200 seconds".into());
            }
            let recorder = DesktopRecorder::new(root)?;
            recorder.set_owner(Some("qa_microphone".into()))?;
            let started = recorder.start("qa_microphone".into(), "Microphone QA".into())?;
            let id = started.active_id.clone().ok_or("capture did not start")?;
            println!("{}", serde_json::to_string(&started).unwrap());
            std::thread::sleep(Duration::from_secs(seconds));
            println!(
                "{}",
                serde_json::to_string_pretty(&recorder.stop("qa_microphone".into(), id)?).unwrap()
            );
        }
        _ => return Err("unknown mode".into()),
    }
    Ok(())
}

//! Hidden real Wry runtime; stdin automation never changes TCC or sends keyboard/mouse input.
use serde_json::{json, Value};
use std::{
    fs,
    io::{self, BufRead, Write},
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Results(Mutex<mpsc::Sender<Value>>);

#[tauri::command]
fn test_result(value: Value, state: tauri::State<'_, Results>) {
    let _ = state.0.lock().unwrap().send(value);
}

fn main() {
    let root = std::path::PathBuf::from(
        std::env::var("NATIVE_MEETING_TEST_ROOT").expect("isolated root required"),
    );
    assert!(
        root.to_string_lossy().contains("native-meeting"),
        "use an isolated native-meeting directory"
    );
    fs::create_dir_all(&root).unwrap();
    let (send, receive) = mpsc::channel();
    let init = r#"window.__nativeEval=(id,source)=>Promise.resolve().then(()=>eval(source)).then(
        value=>window.__TAURI_INTERNALS__.invoke('test_result',{value:{id,ok:true,value:value??null}}),
        error=>window.__TAURI_INTERNALS__.invoke('test_result',{value:{id,ok:false,error:String(error)}}));"#;
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.enable_macos_default_menu(false);
    let app = builder
        .plugin(tauri_plugin_meeting_recorder::init_with_directory(
            root.join("recordings"),
        ))
        .manage(Results(Mutex::new(send)))
        .invoke_handler(tauri::generate_handler![test_result])
        .on_page_load(|webview, payload| {
            eprintln!("native meeting page event: {:?}", payload.event());
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                let _ = webview.eval("window.__nativeEval('__ready','true')");
            }
        })
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .initialization_script(init)
                .visible(false)
                .focused(false)
                .data_directory(root.join("webview"))
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!("tauri.conf.json"))
        .expect("native meeting acceptance app");
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let mut window = None;
        for _ in 0..400 {
            window = handle.get_webview_window("main");
            if window.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let Some(_window) = window else {
            println!(
                "{}",
                json!({"ready":false,"error":"main webview was not registered"})
            );
            handle.exit(1);
            return;
        };
        if receive
            .recv_timeout(Duration::from_secs(30))
            .ok()
            .is_none_or(|result| result["id"] != "__ready" || result["ok"] != true)
        {
            println!(
                "{}",
                json!({"ready":false,"error":"main webview IPC was not ready"})
            );
            handle.exit(1);
            return;
        }
        println!("{}", json!({"ready":true}));
        io::stdout().flush().unwrap();
        for line in io::stdin().lock().lines() {
            let command: Value = serde_json::from_str(&line.unwrap()).unwrap();
            let id = command["id"].as_str().unwrap_or("request");
            if command["op"] == "quit" {
                handle.exit(0);
                return;
            }
            let window = handle.get_webview_window("main");
            let value = if command["op"] == "inspect" {
                json!({"id":id,"ok":true,"value":window.as_ref().map(|window|json!({"visible":window.is_visible().unwrap(),"focused":window.is_focused().unwrap(),"trayRecording":tauri_plugin_meeting_recorder::recording_indicator(&handle)}))})
            } else if command["op"] == "close" {
                window.unwrap().close().unwrap();
                json!({"id":id,"ok":true,"value":true})
            } else if let Some(window) = window {
                let source = command["source"].as_str().unwrap();
                window.eval(format!("(function poll(){{if(window.__nativeEval)window.__nativeEval({},{});else setTimeout(poll,20)}})()",json!(id),json!(source))).unwrap();
                receive
                    .recv_timeout(Duration::from_secs(30))
                    .unwrap_or_else(
                        |_| json!({"id":id,"ok":false,"error":"native evaluation timed out"}),
                    )
            } else {
                json!({"id":id,"ok":false,"error":"window absent"})
            };
            println!("{value}");
            io::stdout().flush().unwrap();
        }
        handle.exit(0);
    });
    app.run(|_, _| {});
}

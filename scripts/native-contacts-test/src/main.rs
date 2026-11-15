//! Real Wry/WKWebView runtime. No production app, OS keychain or screen input.
use std::{fs, io::{self, BufRead, Write}, sync::{Mutex, mpsc}, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use serde_json::{json, Value};

mod contact_window {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/desktop/src-tauri/src/contact_window.rs"));
}

struct Results(Mutex<mpsc::Sender<Value>>);
struct Credentials(Mutex<Option<String>>);

#[cfg(target_os = "macos")]
static SUPPRESSED_SHOWS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(target_os = "macos")]
unsafe extern "C" fn suppress_display(_: *mut std::ffi::c_void, _: *mut std::ffi::c_void, _: *mut std::ffi::c_void) {
    SUPPRESSED_SHOWS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(target_os = "macos")]
#[link(name = "objc")]
unsafe extern "C" {
    fn object_getClass(object: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;
    fn class_replaceMethod(class: *mut std::ffi::c_void, selector: *mut std::ffi::c_void,
        implementation: *const std::ffi::c_void, types: *const std::ffi::c_char) -> *mut std::ffi::c_void;
}

#[cfg(target_os = "macos")]
fn put_offscreen(window: tauri::Window) {
    let native_window = window.clone();
    let (sent, received) = mpsc::channel();
    window.run_on_main_thread(move || {
        use objc2_app_kit::NSWindow;
        let pointer = native_window.ns_window().unwrap();
        let native = unsafe { &*(pointer as *const NSWindow) };
        assert!(!native.isVisible(), "test windows must remain hidden until placement is verified");
        // macOS brings offscreen windows back onto a monitor on their first show.
        // Suppress display in this test process only; this is hidden-runtime validation.
        unsafe {
            let class = object_getClass(pointer);
            for name in [c"makeKeyAndOrderFront:", c"orderFront:"] {
                class_replaceMethod(class, sel_registerName(name.as_ptr()), suppress_display as *const std::ffi::c_void, c"v@:@".as_ptr());
            }
        }
        let mut frame = native.frame();
        frame.origin.x = -20000.0;
        frame.origin.y = -20000.0;
        native.setFrame_display(frame, false);
        let position = native_window.outer_position().unwrap();
        let size = native_window.outer_size().unwrap();
        for monitor in native_window.available_monitors().unwrap() {
            let origin = monitor.position();
            let bounds = monitor.size();
            assert!(position.x + size.width as i32 <= origin.x
                || position.y + size.height as i32 <= origin.y
                || position.x >= origin.x + bounds.width as i32
                || position.y >= origin.y + bounds.height as i32,
                "test window intersects an attached screen");
        }
        let _ = sent.send(());
    }).unwrap();
    received.recv_timeout(Duration::from_secs(10)).unwrap();
}

#[tauri::command]
fn get_password(window: tauri::WebviewWindow, state: tauri::State<'_, Credentials>) -> Result<Option<String>, String> {
    if window.label() != "main" { return Err("auxiliary window accessed keychain".into()); }
    Ok(state.0.lock().unwrap().clone())
}

#[tauri::command]
fn set_password(password: String, window: tauri::WebviewWindow, state: tauri::State<'_, Credentials>) -> Result<(), String> {
    if window.label() != "main" { return Err("auxiliary window accessed keychain".into()); }
    *state.0.lock().unwrap() = Some(password);
    Ok(())
}

#[tauri::command]
fn delete_password(window: tauri::WebviewWindow, state: tauri::State<'_, Credentials>) -> Result<(), String> {
    if window.label() != "main" { return Err("auxiliary window accessed keychain".into()); }
    *state.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn test_result(value: Value, state: tauri::State<'_, Results>) {
    let _ = state.0.lock().unwrap().send(value);
}

fn main() {
    let root = std::path::PathBuf::from(std::env::var("NATIVE_TEST_ROOT").expect("NATIVE_TEST_ROOT"));
    assert!(root.to_string_lossy().contains("native-contacts"));
    let seed: Value = serde_json::from_str(&fs::read_to_string(root.join("seed.json")).expect("seed")).unwrap();
    let init = format!("if(window.__TAURI_INTERNALS__.metadata.currentWindow.label==='main'&&localStorage.getItem('__nativeRun')!=={id}){{localStorage.clear();localStorage.setItem('__nativeRun',{id});}}", id=json!(root.to_string_lossy())) + r#"
        (() => {
            const original = window.__TAURI_INTERNALS__.invoke;
            window.__nativeEvidence = { refreshRequests: 0 };
            const request = window.fetch;
            window.fetch = (...args) => {
                if (String(args[0]).includes('/v1/auth/refresh')) window.__nativeEvidence.refreshRequests++;
                return request(...args);
            };
            if (!localStorage.getItem('yonder.locale')) localStorage.setItem('yonder.locale', 'en');
            window.__nativeEval = (id, source) => Promise.resolve().then(() => eval(source)).then(
                value => original('test_result', { value: {id, ok:true, value: value ?? null} }),
                error => original('test_result', { value: {id, ok:false, error: String(error)} })
            );
        })();
    "#;
    let (send, receive) = mpsc::channel();
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.enable_macos_default_menu(false);
    let app = builder
        .on_window_event(contact_window::on_window_event)
        .plugin(tauri::plugin::Builder::<tauri::Wry, ()>::new("keyring")
            .invoke_handler(tauri::generate_handler![get_password, set_password, delete_password])
            .on_window_ready(|window| {
                #[cfg(target_os = "macos")]
                if std::env::var("NATIVE_TEST_ALLOW_DISPLAY").as_deref() != Ok("1") { put_offscreen(window); }
                #[cfg(not(target_os = "macos"))]
                let _ = window;
            })
            .js_init_script(init).build())
        .manage(Results(Mutex::new(send)))
        .manage(Credentials(Mutex::new(seed["refreshToken"].as_str().map(str::to_owned))))
        .invoke_handler(tauri::generate_handler![test_result,
            contact_window::open_add_contacts, contact_window::request_main_session,
            contact_window::provide_contacts_session, contact_window::contact_added,
            contact_window::close_add_contacts])
        .setup(move |app| {
            let visible = std::env::var("NATIVE_TEST_ALLOW_DISPLAY").as_deref() == Ok("1");
            #[cfg(target_os = "macos")]
            app.set_activation_policy(if visible { tauri::ActivationPolicy::Accessory } else { tauri::ActivationPolicy::Prohibited });
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("messages".into()))
                .title("Yonder Native Test")
                .inner_size(1180.0, 760.0).position(if visible { 80.0 } else { -20000.0 }, if visible { 80.0 } else { -20000.0 })
                .visible(visible).focused(visible).data_directory(root.join("webview"))
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!("tauri.conf.json")).expect("real native app");
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        for _ in 0..200 {
            if handle.get_webview_window("main").is_some() { break; }
            std::thread::sleep(Duration::from_millis(50));
        }
        println!("{}", json!({"ready":true}));
        for line in io::stdin().lock().lines() {
            let command: Value = serde_json::from_str(&line.unwrap()).unwrap();
            let id = command["id"].as_str().unwrap().to_string();
            let operation = command["op"].as_str().unwrap();
            if operation == "quit" { handle.exit(0); return; }
            let label = command["window"].as_str().unwrap_or("main");
            let window = handle.get_webview_window(label);
            let value = if operation == "windows" {
                json!({"id":id,"ok":true,"value":handle.webview_windows().keys().collect::<Vec<_>>()})
            } else if operation == "close" {
                window.unwrap().close().unwrap();
                json!({"id":id,"ok":true,"value":true})
            } else if operation == "inspect" {
                let (tx, rx) = mpsc::channel();
                let key = id.clone();
                handle.run_on_main_thread(move || {
                    #[cfg(target_os = "macos")]
                    use objc2_app_kit::{NSWindow, NSWindowButton};
                    let value = window.map(|webview| {
                        #[cfg(target_os = "macos")]
                        {
                        let pointer = webview.ns_window().unwrap();
                        let native = unsafe { &*(pointer as *const NSWindow) };
                        let hidden: Vec<_> = [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton]
                            .iter().map(|button| native.standardWindowButton(*button).map(|button| button.isHidden())).collect();
                        json!({"visible":native.isVisible(),"key":native.isKeyWindow(),"buttonsHidden":hidden,"windowNumber":native.windowNumber(),
                            "displaySuppressed":std::env::var("NATIVE_TEST_ALLOW_DISPLAY").as_deref() != Ok("1"),"showRequests":SUPPRESSED_SHOWS.load(std::sync::atomic::Ordering::SeqCst),
                            "x":webview.outer_position().unwrap().x,"y":webview.outer_position().unwrap().y})
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                        json!({"visible":webview.is_visible().unwrap(),"focused":webview.is_focused().unwrap(),
                            "resizable":webview.is_resizable().unwrap(),"minimizable":webview.is_minimizable().unwrap(),
                            "maximizable":webview.is_maximizable().unwrap(),
                            "x":webview.outer_position().unwrap().x,"y":webview.outer_position().unwrap().y})
                        }
                    });
                    let _ = tx.send(json!({"id":key,"ok":true,"value":value}));
                }).unwrap();
                rx.recv_timeout(Duration::from_secs(20)).unwrap()
            } else if let Some(window) = window {
                let source = command["source"].as_str().unwrap();
                let script = format!("(function poll(){{if(window.__nativeEval)window.__nativeEval({}, {});else setTimeout(poll,50);}})()", json!(id), json!(source));
                window.eval(&script).unwrap();
                receive.recv_timeout(Duration::from_secs(40)).unwrap_or_else(|_| json!({"id":id,"ok":false,"error":"native evaluation timed out"}))
            } else { json!({"id":id,"ok":false,"error":"window not found"}) };
            println!("{value}");
            io::stdout().flush().unwrap();
        }
        handle.exit(0);
    });
    app.run(|_, event| {
        if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event { api.prevent_exit(); }
    });
}

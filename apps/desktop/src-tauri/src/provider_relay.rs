//! One relayed provider call, made from this machine. The server hands the request over the
//! account's realtime socket; the main window runs this command, which dials the endpoint from
//! here (the only place a localhost gateway is reachable) and streams the answer back through a
//! Tauri channel: one head, then body parts as they arrive, then an end.
//!
//! This is an HTTP egress from the webview, so it is narrow on purpose:
//! - the main window only;
//! - the target must be one of the endpoints the user bound to a provider on this device
//!   (`provider_relay_bind`), and must match scheme, host and port exactly;
//! - redirects are never followed, and the method is always POST (or GET for the model list).
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{Manager, State, WebviewWindow};

#[derive(Default)]
pub struct RelayState {
    /// `scheme://host:port` origins the user bound to a provider on this device.
    origins: Mutex<HashSet<String>>,
    /// Relay ids currently running, so `cancel` can stop one.
    running: Mutex<HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>>,
}

#[derive(Deserialize)]
pub struct RelayHeader {
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayRequest {
    relay_id: String,
    method: String,
    url: String,
    headers: Vec<RelayHeader>,
    body: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum RelayEvent {
    #[serde(rename_all = "camelCase")]
    Head { status: u16, content_type: Option<String> },
    Chunk { part: String },
    #[serde(rename_all = "camelCase")]
    End { error: Option<String> },
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("permission_denied".into())
    }
}

/// `scheme://host:port` of a URL, or `None` when it is not a plain http(s) URL.
pub fn origin_of(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || !parsed.username().is_empty() || parsed.password().is_some() {
        return None;
    }
    Some(format!(
        "{}://{}:{}",
        parsed.scheme(),
        parsed.host_str()?,
        parsed.port_or_known_default()?
    ))
}

/// Replace the set of endpoints this device may dial on a provider's behalf.
#[tauri::command]
pub fn provider_relay_bind(
    window: WebviewWindow,
    state: State<'_, RelayState>,
    base_urls: Vec<String>,
) -> Result<(), String> {
    main_window(&window)?;
    let mut origins = state.origins.lock().map_err(|_| "operation_failed".to_string())?;
    *origins = base_urls.iter().filter_map(|url| origin_of(url)).collect();
    Ok(())
}

#[tauri::command]
pub fn provider_relay_cancel(
    window: WebviewWindow,
    state: State<'_, RelayState>,
    relay_id: String,
) -> Result<(), String> {
    main_window(&window)?;
    if let Some(flag) = state.running.lock().map_err(|_| "operation_failed".to_string())?.get(&relay_id) {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}

fn client() -> Result<reqwest::blocking::Client, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        // A model may think for a long time before its first token; only the connect is bounded.
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "operation_failed".to_string())
}

/// Run the call and stream it. Everything that can go wrong ends the stream with an error string.
pub fn run(
    request: &RelayRequest,
    allowed: &HashSet<String>,
    cancelled: &std::sync::atomic::AtomicBool,
    emit: &mut dyn FnMut(RelayEvent),
) {
    let end = |emit: &mut dyn FnMut(RelayEvent), error: &str| emit(RelayEvent::End { error: Some(error.into()) });
    let Some(origin) = origin_of(&request.url) else {
        return end(emit, "address_not_allowed");
    };
    if !allowed.contains(&origin) {
        return end(emit, "address_not_allowed");
    }
    let method = match request.method.as_str() {
        "POST" => reqwest::Method::POST,
        "GET" => reqwest::Method::GET,
        _ => return end(emit, "method_not_allowed"),
    };
    let Ok(client) = client() else {
        return end(emit, "operation_failed");
    };
    let mut call = client.request(method.clone(), &request.url);
    for header in &request.headers {
        // The dialer sets framing itself; a caller-supplied one would conflict.
        if header.name.eq_ignore_ascii_case("content-length") || header.name.eq_ignore_ascii_case("host") {
            continue;
        }
        if let Ok(value) = reqwest::header::HeaderValue::from_str(&header.value) {
            call = call.header(header.name.as_str(), value);
        }
    }
    if method == reqwest::Method::POST {
        call = call.body(request.body.clone());
    }
    let mut response = match call.send() {
        Ok(response) => response,
        Err(error) if error.is_connect() => return end(emit, "connect_failed"),
        Err(_) => return end(emit, "request_failed"),
    };
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    emit(RelayEvent::Head { status: response.status().as_u16(), content_type });
    let mut buffer = [0u8; 8192];
    // A UTF-8 character can straddle two reads; carry the incomplete tail into the next one.
    let mut carry: Vec<u8> = Vec::new();
    loop {
        if cancelled.load(std::sync::atomic::Ordering::SeqCst) {
            return end(emit, "cancelled");
        }
        match response.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                carry.extend_from_slice(&buffer[..read]);
                let valid = match std::str::from_utf8(&carry) {
                    Ok(_) => carry.len(),
                    Err(error) => error.valid_up_to(),
                };
                if valid > 0 {
                    let part = String::from_utf8_lossy(&carry[..valid]).into_owned();
                    emit(RelayEvent::Chunk { part });
                    carry.drain(..valid);
                }
            }
            Err(_) => return end(emit, "read_failed"),
        }
    }
    if !carry.is_empty() {
        return end(emit, "invalid_body_encoding");
    }
    emit(RelayEvent::End { error: None });
}

#[tauri::command]
pub async fn provider_relay_execute(
    window: WebviewWindow,
    state: State<'_, RelayState>,
    request: RelayRequest,
    on_event: Channel<RelayEvent>,
) -> Result<(), String> {
    main_window(&window)?;
    let allowed = state.origins.lock().map_err(|_| "operation_failed".to_string())?.clone();
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    state
        .running
        .lock()
        .map_err(|_| "operation_failed".to_string())?
        .insert(request.relay_id.clone(), cancelled.clone());
    let relay_id = request.relay_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run(&request, &allowed, &cancelled, &mut |event| {
            let _ = on_event.send(event);
        });
    })
    .await
    .map_err(|_| "operation_failed".to_string())?;
    if let Ok(mut running) = state.running.lock() {
        running.remove(&relay_id);
    }
    Ok(())
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("provider-relay")
        .setup(|app, _api| {
            app.manage(RelayState::default());
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read as _, Write as _};
    use std::net::TcpListener;
    use std::sync::atomic::AtomicBool;

    fn request(url: &str, method: &str) -> RelayRequest {
        RelayRequest {
            relay_id: "r1".into(),
            method: method.into(),
            url: url.into(),
            headers: vec![RelayHeader { name: "authorization".into(), value: "Bearer local".into() }],
            body: "{\"stream\":true}".into(),
        }
    }

    fn collect(request: &RelayRequest, allowed: &[&str]) -> Vec<String> {
        let allowed: HashSet<String> = allowed.iter().map(|s| s.to_string()).collect();
        let mut events = Vec::new();
        run(request, &allowed, &AtomicBool::new(false), &mut |event| {
            events.push(match event {
                RelayEvent::Head { status, .. } => format!("head:{status}"),
                RelayEvent::Chunk { part } => format!("chunk:{part}"),
                RelayEvent::End { error } => format!("end:{}", error.unwrap_or_default()),
            })
        });
        events
    }

    /// A one-shot local HTTP server answering with `body` in two writes.
    fn serve(status_line: &str, body_parts: &'static [&'static [u8]]) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let status = status_line.to_string();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut received = vec![0u8; 4096];
            let read = stream.read(&mut received).unwrap();
            let text = String::from_utf8_lossy(&received[..read]).to_string();
            let total: usize = body_parts.iter().map(|p| p.len()).sum();
            write!(stream, "HTTP/1.1 {status}\r\ncontent-type: text/event-stream\r\ncontent-length: {total}\r\nconnection: close\r\n\r\n").unwrap();
            for part in body_parts {
                stream.write_all(part).unwrap();
                stream.flush().unwrap();
                std::thread::sleep(Duration::from_millis(40));
            }
            text
        });
        (format!("http://{address}"), handle)
    }

    #[test]
    fn origins_compare_scheme_host_and_port() {
        assert_eq!(origin_of("http://127.0.0.1:8080/v1/x").as_deref(), Some("http://127.0.0.1:8080"));
        assert_eq!(origin_of("https://example.com/a").as_deref(), Some("https://example.com:443"));
        assert_eq!(origin_of("file:///etc/passwd"), None);
        assert_eq!(origin_of("http://user:pw@127.0.0.1:1/"), None);
    }

    #[test]
    fn an_unbound_address_is_refused_before_any_connection() {
        let events = collect(&request("http://127.0.0.1:9/v1", "POST"), &["http://127.0.0.1:8080"]);
        assert_eq!(events, vec!["end:address_not_allowed"]);
        let events = collect(&request("http://127.0.0.1:8080/v1", "DELETE"), &["http://127.0.0.1:8080"]);
        assert_eq!(events, vec!["end:method_not_allowed"]);
    }

    #[test]
    fn a_bound_endpoint_streams_head_then_chunks_then_end() {
        let (base, server) = serve("200 OK", &[b"data: one\n\n", b"data: [DONE]\n\n"]);
        let origin = origin_of(&base).unwrap();
        let events = collect(&request(&format!("{base}/v1/chat/completions"), "POST"), &[&origin]);
        let received = server.join().unwrap();
        assert!(received.starts_with("POST /v1/chat/completions"), "{received}");
        assert!(received.to_lowercase().contains("authorization: bearer local"));
        assert_eq!(events.first().map(String::as_str), Some("head:200"));
        assert_eq!(events.last().map(String::as_str), Some("end:"));
        let body: String = events.iter().filter_map(|e| e.strip_prefix("chunk:")).collect();
        assert_eq!(body, "data: one\n\ndata: [DONE]\n\n");
    }

    #[test]
    fn a_character_split_across_reads_is_not_corrupted() {
        // "你" is E4 BD A0; cut it between two writes.
        let (base, server) = serve("200 OK", &[&[b'a', 0xE4, 0xBD], &[0xA0, b'b']]);
        let origin = origin_of(&base).unwrap();
        let events = collect(&request(&format!("{base}/x"), "POST"), &[&origin]);
        server.join().unwrap();
        let body: String = events.iter().filter_map(|e| e.strip_prefix("chunk:")).collect();
        assert_eq!(body, "a你b");
        assert_eq!(events.last().map(String::as_str), Some("end:"));
    }

    #[test]
    fn a_redirect_is_not_followed() {
        let (base, server) = serve("302 Found", &[b""]);
        let origin = origin_of(&base).unwrap();
        let events = collect(&request(&format!("{base}/x"), "POST"), &[&origin]);
        server.join().unwrap();
        assert_eq!(events.first().map(String::as_str), Some("head:302"));
    }

    #[test]
    fn nothing_listening_reports_a_connect_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let base = format!("http://127.0.0.1:{port}");
        let events = collect(&request(&format!("{base}/x"), "POST"), &[&origin_of(&base).unwrap()]);
        assert_eq!(events, vec!["end:connect_failed"]);
    }
}

use super::*;
use crate::device_model_sse::SseFrames;

#[test]
fn cleartext_is_loopback_only_and_https_may_reach_a_public_provider() {
    assert_eq!(local_base("http://localhost:11434/v1").unwrap().as_str(), "http://127.0.0.1:11434/v1/");
    assert!(local_base("http://[::1]:1234/v1/").is_ok());
    // A public provider the device calls itself: https, a name, path at most /v1.
    assert_eq!(local_base("https://www.rightapi.ai/v1").unwrap().as_str(), "https://www.rightapi.ai/v1/");
    assert_eq!(local_base("https://cf.api.fan").unwrap().as_str(), "https://cf.api.fan/v1/");
    for input in ["https://localhost/v1", "http://example.invalid", "http://192.168.0.1",
        "http://localhost.evil.invalid", "http://localhost:1234/admin", "http://127.0.0.1/v1?key=a",
        "http://user:pass@localhost/v1", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd",
        // Public https still refuses private, metadata and IP-literal hosts, and deeper paths.
        "https://10.0.0.1/v1", "https://127.0.0.1/v1", "https://169.254.169.254/v1",
        "https://192.168.1.1/v1", "https://metadata.google.internal/v1", "https://intranet/v1",
        "https://www.rightapi.ai/v1/chat/completions", "https://www.rightapi.ai/v1?x=1"]
    { assert!(local_base(input).is_err(), "{input}"); }
}

#[test]
fn approved_openai_requests_only() {
    let good = serde_json::json!({"model":"local/model:1","messages":[{"role":"user","content":"sample"}],
        "stream":true,"max_tokens":8192,"stream_options":{"include_usage":true}});
    assert!(check_openai_body(&good).is_ok());
    for key in ["url", "headers"] {
        let mut bad = good.clone();
        bad[key] = serde_json::json!("untrusted");
        assert!(check_openai_body(&bad).is_err());
    }
    let mut media = good.clone();
    media["messages"][0]["content"] = serde_json::json!([{"type":"image_url"}]);
    assert!(check_openai_body(&media).is_err());
    let mut large = good;
    large["max_tokens"] = serde_json::json!(10_000_001);
    assert!(check_openai_body(&large).is_err());
}

#[test]
fn frames_are_bounded_and_split_chunks_wait_for_a_complete_event() {
    let mut parser = SseFrames::new(Wire::OpenAi);
    let mut frames = Vec::new();
    let mut emit = |frame| { frames.push(frame); Ok(()) };
    assert!(!parser.push(b"data: {\"choices\":[]}", None, &mut emit).unwrap());
    assert!(parser.push(b"\r\n\r\ndata: [DONE]\n\n", None, &mut emit).unwrap());
    assert_eq!(frames, vec!["data: {\"choices\":[]}\n\n"]);
    assert!(SseFrames::new(Wire::OpenAi).push(&vec![b'a'; 64 * 1024 + 5], None, &mut |_| Ok(())).is_err());
    assert!(SseFrames::new(Wire::OpenAi).push(b"data: not-json\n\n", None, &mut |_| Ok(())).is_err());
}

fn synthetic_upstream(response: &'static str, protocol: Protocol, expected_key: Option<&'static str>) -> (Url, std::thread::JoinHandle<String>) {
    use std::io::{BufRead, BufReader, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let base = local_base(&format!("http://{}", listener.local_addr().unwrap())).unwrap();
    let worker = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let mut stream = BufReader::new(stream);
        let mut first = String::new();
        stream.read_line(&mut first).unwrap();
        let mut content_length = 0;
        let mut authorization_seen = false;
        let mut anthropic_version_seen = false;
        loop {
            let mut line = String::new();
            stream.read_line(&mut line).unwrap();
            if line.trim().is_empty() { break; }
            if let Some((name, value)) = line.split_once(':') {
                if name.eq_ignore_ascii_case("content-length") {
                    content_length = value.trim().parse().unwrap();
                }
                if name.eq_ignore_ascii_case("authorization") {
                    assert!(matches!(protocol, Protocol::OpenaiChat | Protocol::OpenaiResponses) && !authorization_seen);
                    assert_eq!(value.trim().strip_prefix("Bearer "), expected_key);
                    authorization_seen = true;
                } else if name.eq_ignore_ascii_case("x-api-key") {
                    assert!(protocol == Protocol::AnthropicMessages && !authorization_seen);
                    assert_eq!(Some(value.trim()), expected_key);
                    authorization_seen = true;
                } else if name.eq_ignore_ascii_case("anthropic-version") {
                    assert_eq!(value.trim(), "2023-06-01");
                    anthropic_version_seen = true;
                }
            }
        }
        assert_eq!(authorization_seen, expected_key.is_some());
        assert_eq!(anthropic_version_seen, protocol == Protocol::AnthropicMessages);
        let mut body = vec![0; content_length];
        std::io::Read::read_exact(&mut stream, &mut body).unwrap();
        stream.get_mut().write_all(response.as_bytes()).unwrap();
        first
    });
    (base, worker)
}

#[test]
fn real_http_on_isolated_loopback_uses_only_the_expected_routes() {
    const FIXTURE_KEY: &str = "synthetic-test-key";
    let (base, worker) = synthetic_upstream(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"data\":[{\"id\":\"my-local-model\"}]}",
        Protocol::OpenaiChat,
        Some(FIXTURE_KEY),
    );
    let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Protocol::OpenaiChat, Some(FIXTURE_KEY))).unwrap();
    assert_eq!(models.as_slice(), ["my-local-model"]);
    assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");

    let (base, worker) = synthetic_upstream(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"choices\":[]}\n\ndata: [DONE]\n\n",
        Protocol::OpenaiChat,
        Some(FIXTURE_KEY),
    );
    let mut data = vec![];
    let body = serde_json::json!({"model":"my-local-model","messages":[{"role":"user","content":"sample"}],
        "stream":true,"max_tokens":128});
    tauri::async_runtime::block_on(chat(base, Duration::from_secs(3), Protocol::OpenaiChat, Some(FIXTURE_KEY), body, |frame| {
        data.push(frame);
        Ok(())
    })).unwrap();
    assert_eq!(data.as_slice(), ["data: {\"choices\":[]}\n\n"]);
    assert_eq!(worker.join().unwrap(), "POST /v1/chat/completions HTTP/1.1\r\n");
}

#[test]
fn no_key_does_not_send_an_authorization_header() {
    let (base, worker) = synthetic_upstream(
        concat!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n", r#"{"data":[]}"#),
        Protocol::OpenaiChat,
        None,
    );
    let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Protocol::OpenaiChat, None)).unwrap();
    assert!(models.is_empty());
    assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");
}

#[test]
fn redirects_are_refused_instead_of_followed() {
    const FIXTURE_KEY: &str = "synthetic-test-key";
    let (base, worker) = synthetic_upstream(
        "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/v1/models\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        Protocol::OpenaiChat,
        Some(FIXTURE_KEY),
    );
    assert_eq!(tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Protocol::OpenaiChat, Some(FIXTURE_KEY))), Err("upstream_rejected"));
    assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");
}


#[test]
fn validates_fixed_bearer_and_rejects_direct_reflection() {
    assert!(validate_key("synthetic-test-key").is_ok());
    for invalid in ["", "stand-in\r\nredacted", "not a bearer token"] {
        assert!(validate_key(invalid).is_err());
    }
    let mut frames = SseFrames::new(Wire::OpenAi);
    let reflection = concat!(r#"data: {"choices":[{"delta":{"content":"Bearer synthetic-test-\u006bey"}}]}"#, "\n\n");
    assert_eq!(
        frames.push(reflection.as_bytes(), Some("synthetic-test-key"), &mut |_| {
            panic!("credential must not be emitted")
        }),
        Err("invalid_response"),
    );
}

#[test]
fn native_anthropic_uses_exact_routes_and_credential_scheme() {
    const KEY: &str = "synthetic-test-key";
    let (base, worker) = synthetic_upstream(
        concat!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
            r#"{"data":[{"id":"local-claude"}]}"#),
        Protocol::AnthropicMessages, Some(KEY),
    );
    let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Protocol::AnthropicMessages, Some(KEY))).unwrap();
    assert_eq!(models.as_slice(), ["local-claude"]);
    assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");

    let (base, worker) = synthetic_upstream(
        concat!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
            "event: ping\ndata: {\"type\":\"ping\"}\n\n", "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"),
        Protocol::AnthropicMessages, Some(KEY),
    );
    let body = serde_json::json!({"model":"local-claude","system":"","max_tokens":32,"stream":true,
        "messages":[{"role":"user","content":[{"type":"text","text":"sample"}]}]});
    let mut seen = Vec::new();
    tauri::async_runtime::block_on(chat(base, Duration::from_secs(3), Protocol::AnthropicMessages, Some(KEY), body.clone(), |frame| {
        seen.push(frame);
        Ok(())
    })).unwrap();
    assert_eq!(seen.as_slice(), ["event: ping\ndata: {\"type\":\"ping\"}\n\n"]);
    assert_eq!(worker.join().unwrap(), "POST /v1/messages HTTP/1.1\r\n");
    let mut bad = body;
    bad["messages"][0]["content"][0] = serde_json::json!({"type":"image","source":{"type":"url","url":"https://origin.invalid"}});
    assert_eq!(check_anthropic_body(&bad), Err("upstream_rejected"));
}


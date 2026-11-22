use reqwest::{header::{HeaderValue, AUTHORIZATION}, redirect::Policy, Client, RequestBuilder, Response, Url};
use serde_json::Value;
use std::time::Duration;

pub type Error = &'static str;
const MAX_REQUEST: usize = 256 * 1024;

pub fn local_base(source: &str) -> Result<Url, Error> {
    if source.len() > 256 {
        return Err("endpoint_unavailable");
    }
    let mut url = Url::parse(source.trim()).map_err(|_| "endpoint_unavailable")?;
    if url.scheme() != "http"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "/" | "/v1" | "/v1/")
    {
        return Err("endpoint_unavailable");
    }
    match url.host_str() {
        // Do not permit a DNS lookup, including one controlled by a modified hosts file or proxy.
        Some("localhost") => url.set_host(Some("127.0.0.1")).map_err(|_| "endpoint_unavailable")?,
        Some("127.0.0.1" | "[::1]") => {}
        _ => return Err("endpoint_unavailable"),
    }
    url.set_path("/v1/");
    Ok(url)
}

fn client(timeout: Duration) -> Result<Client, Error> {
    // Reqwest's locked desktop features also serve the recorder and updater's TLS transports.
    let _ = rustls::crypto::ring::default_provider().install_default();
    Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(timeout)
        .build()
        .map_err(|_| "endpoint_unavailable")
}

fn request_error(error: reqwest::Error) -> Error {
    if error.is_timeout() { "timeout" } else { "endpoint_unavailable" }
}

fn accepted(response: Response) -> Result<Response, Error> {
    if response.status().is_success() {
        Ok(response)
    } else if response.status().as_u16() == 404 {
        Err("model_not_found")
    } else {
        Err("upstream_rejected")
    }
}

fn model_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 180 && !value.chars().any(|c| c.is_control() || c.is_whitespace())
}

pub fn validate_key(key: &str) -> Result<(), Error> {
    if !(1..=2048).contains(&key.len()) || !key.bytes().all(|c| c.is_ascii_graphic()) {
        return Err("upstream_rejected");
    }
    Ok(())
}

fn authorize(request: RequestBuilder, key: Option<&str>) -> Result<RequestBuilder, Error> {
    let Some(key) = key else { return Ok(request); };
    validate_key(key)?;
    let mut value = HeaderValue::from_str(&format!("Bearer {key}")).map_err(|_| "upstream_rejected")?;
    value.set_sensitive(true);
    Ok(request.header(AUTHORIZATION, value))
}

/// Anthropic authenticates with `x-api-key`, not a bearer token; the two never travel together.
fn authorize_anthropic(request: RequestBuilder, key: Option<&str>) -> Result<RequestBuilder, Error> {
    let Some(key) = key else { return Ok(request); };
    validate_key(key)?;
    let mut value = HeaderValue::from_str(key).map_err(|_| "upstream_rejected")?;
    value.set_sensitive(true);
    Ok(request.header("x-api-key", value).header("anthropic-version", "2023-06-01"))
}

/// Reject directly reflected credential strings before forwarding a structured response.
pub(crate) fn contains_credential(value: &Value, key: &str) -> bool {
    match value {
        Value::String(text) => text.contains(key),
        Value::Array(values) => values.iter().any(|v| contains_credential(v, key)),
        Value::Object(fields) => fields.iter().any(|(name, v)| name.contains(key) || contains_credential(v, key)),
        _ => false,
    }
}

pub async fn discover(base: Url, timeout: Duration, key: Option<&str>) -> Result<Vec<String>, Error> {
    let request = base.join("models").map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(authorize(client(timeout)?.get(request), key)?.send().await.map_err(request_error)?)?;
    if !json_content(res.headers().get("content-type")) { return Err("invalid_response"); }
    let mut bytes = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(request_error)? {
        if bytes.len() + chunk.len() > MAX_REQUEST {
            return Err("invalid_response");
        }
        bytes.extend_from_slice(&chunk);
    }
    let doc: Value = serde_json::from_slice(&bytes).map_err(|_| "invalid_response")?;
    let models = doc.get("data").and_then(Value::as_array).ok_or("invalid_response")?;
    let mut ids = Vec::new();
    for id in models.iter().filter_map(|m| m.get("id").and_then(Value::as_str)) {
        if key.is_some_and(|key| id.contains(key)) { return Err("invalid_response"); }
        if model_id(id) && !ids.iter().any(|known| known == id) {
            ids.push(id.to_owned());
        }
        if ids.len() == 100 { break; }
    }
    Ok(ids)
}

fn json_content(value: Option<&HeaderValue>) -> bool {
    value.and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(';').next().is_some_and(|kind| kind.trim().eq_ignore_ascii_case("application/json")))
}

fn check_body(body: &Value) -> Result<(), Error> {
    let object = body.as_object().ok_or("upstream_rejected")?;
    if object.keys().any(|key| !matches!(key.as_str(),
        "model" | "messages" | "stream" | "max_tokens" | "stream_options" | "tools" | "tool_choice"))
        || !body.get("model").and_then(Value::as_str).is_some_and(model_id)
        || !body.get("messages").and_then(Value::as_array).is_some_and(|messages|
            !messages.is_empty() && messages.iter().all(|message|
                matches!(message.get("role").and_then(Value::as_str), Some("system" | "user" | "assistant" | "tool"))
                && message.get("content").is_some_and(Value::is_string)
                && message.as_object().is_some_and(|fields| fields.keys().all(|key|
                    matches!(key.as_str(), "role" | "content" | "tool_calls" | "tool_call_id")
                ))
            )
        )
        || body.get("stream").and_then(Value::as_bool) != Some(true)
        || !body.get("max_tokens").and_then(Value::as_u64).is_some_and(|tokens| (1..=8192).contains(&tokens))
        || serde_json::to_vec(body).map_err(|_| "upstream_rejected")?.len() > MAX_REQUEST
    {
        return Err("upstream_rejected");
    }
    Ok(())
}

/// What the OpenAI-shaped answer adds that is not part of an Anthropic body.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Wire { OpenAi, Anthropic }

/// The Anthropic Messages body the server assembled. It is already filtered and bounded by the
/// server; this side only refuses fields the wire never carries.
fn check_anthropic_body(body: &Value) -> Result<(), Error> {
    let object = body.as_object().ok_or("upstream_rejected")?;
    if object.keys().any(|key| !matches!(key.as_str(),
        "model" | "system" | "messages" | "max_tokens" | "stream" | "tools" | "tool_choice"))
        || !body.get("model").and_then(Value::as_str).is_some_and(model_id)
        || body.get("system").and_then(Value::as_str).is_none()
        || body.get("stream").and_then(Value::as_bool) != Some(true)
        || !body.get("max_tokens").and_then(Value::as_u64).is_some_and(|tokens| (1..=8192).contains(&tokens))
        || !body.get("messages").and_then(Value::as_array).is_some_and(|messages|
            !messages.is_empty() && messages.iter().all(|message|
                matches!(message.get("role").and_then(Value::as_str), Some("user" | "assistant"))
                && message.get("content").and_then(Value::as_array).is_some_and(|parts|
                    !parts.is_empty() && parts.iter().all(|part| matches!(
                        part.get("type").and_then(Value::as_str),
                        Some("text" | "tool_use" | "tool_result")
                    ))
                )
            )
        )
        || serde_json::to_vec(body).map_err(|_| "upstream_rejected")?.len() > MAX_REQUEST
    {
        return Err("upstream_rejected");
    }
    Ok(())
}

pub async fn chat(
    base: Url,
    timeout: Duration,
    key: Option<&str>,
    wire: Wire,
    body: Value,
    mut emit: impl FnMut(String) -> Result<(), Error>,
) -> Result<(), Error> {
    match wire {
        Wire::OpenAi => check_body(&body)?,
        Wire::Anthropic => check_anthropic_body(&body)?,
    }
    let path = match wire { Wire::OpenAi => "chat/completions", Wire::Anthropic => "messages" };
    let request = base.join(path).map_err(|_| "endpoint_unavailable")?;
    let call = match wire {
        Wire::OpenAi => authorize(client(timeout)?.post(request), key),
        Wire::Anthropic => authorize_anthropic(client(timeout)?.post(request), key),
    }?;
    let mut res = accepted(
        call.header("content-type", "application/json")
            .header("accept", "text/event-stream")
            .body(serde_json::to_vec(&body).map_err(|_| "upstream_rejected")?)
            .send()
            .await
            .map_err(request_error)?,
    )?;
    if !res.headers().get("content-type").and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(';').next().is_some_and(|kind| kind.trim().eq_ignore_ascii_case("text/event-stream")))
    {
        return Err("invalid_response");
    }
    let mut frames = crate::device_model_sse::SseFrames::new(wire);
    while let Some(chunk) = res.chunk().await.map_err(request_error)? {
        if frames.push(&chunk, key, &mut emit)? {
            return Ok(());
        }
    }
    Err("invalid_response")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_fixed_cleartext_loopback_routes_are_allowed() {
        assert_eq!(local_base("http://localhost:11434/v1").unwrap().as_str(), "http://127.0.0.1:11434/v1/");
        assert!(local_base("http://[::1]:1234/v1/").is_ok());
        for input in ["https://localhost/v1", "http://example.invalid", "http://192.168.0.1",
            "http://localhost.evil.invalid", "http://localhost:1234/admin", "http://127.0.0.1/v1?key=a",
            "http://user:pass@localhost/v1", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd"]
        { assert!(local_base(input).is_err(), "{input}"); }
    }

    #[test]
    fn approved_openai_requests_only() {
        let good = serde_json::json!({"model":"local/model:1","messages":[{"role":"user","content":"sample"}],
            "stream":true,"max_tokens":8192,"stream_options":{"include_usage":true}});
        assert!(check_body(&good).is_ok());
        for key in ["url", "headers"] {
            let mut bad = good.clone();
            bad[key] = serde_json::json!("untrusted");
            assert!(check_body(&bad).is_err());
        }
        let mut media = good.clone();
        media["messages"][0]["content"] = serde_json::json!([{"type":"image_url"}]);
        assert!(check_body(&media).is_err());
        let mut large = good;
        large["max_tokens"] = serde_json::json!(8193);
        assert!(check_body(&large).is_err());
    }

    #[test]
    fn approved_anthropic_requests_only() {
        let good = serde_json::json!({"model":"claude-local","system":"be brief","stream":true,"max_tokens":512,
            "messages":[{"role":"user","content":[{"type":"text","text":"sample"}]}]});
        assert!(check_anthropic_body(&good).is_ok());
        for key in ["url", "headers", "apiKey"] {
            let mut bad = good.clone();
            bad[key] = serde_json::json!("untrusted");
            assert!(check_anthropic_body(&bad).is_err());
        }
        let mut media = good.clone();
        media["messages"][0]["content"] = serde_json::json!([{"type":"image"}]);
        assert!(check_anthropic_body(&media).is_err());
        // An OpenAI body is not an Anthropic one, whatever the profile says.
        assert!(check_anthropic_body(&serde_json::json!({"model":"m","messages":[{"role":"user","content":"x"}],
            "stream":true,"max_tokens":8})).is_err());
    }

    fn synthetic_upstream(response: &'static str, expected_key: Option<&'static str>) -> (Url, std::thread::JoinHandle<String>) {
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
            loop {
                let mut line = String::new();
                stream.read_line(&mut line).unwrap();
                if line.trim().is_empty() { break; }
                if let Some((name, value)) = line.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse().unwrap();
                    }
                    if name.eq_ignore_ascii_case("authorization") {
                        assert!(!authorization_seen);
                        assert_eq!(value.trim().strip_prefix("Bearer "), expected_key);
                        authorization_seen = true;
                    }
                }
            }
            assert_eq!(authorization_seen, expected_key.is_some());
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
            Some(FIXTURE_KEY),
        );
        let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Some(FIXTURE_KEY))).unwrap();
        assert_eq!(models.as_slice(), ["my-local-model"]);
        assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");

        let (base, worker) = synthetic_upstream(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"choices\":[]}\n\ndata: [DONE]\n\n",
            Some(FIXTURE_KEY),
        );
        let mut data = vec![];
        let body = serde_json::json!({"model":"my-local-model","messages":[{"role":"user","content":"sample"}],
            "stream":true,"max_tokens":128});
        tauri::async_runtime::block_on(chat(base, Duration::from_secs(3), Some(FIXTURE_KEY), Wire::OpenAi, body, |frame| {
            data.push(frame);
            Ok(())
        })).unwrap();
        assert_eq!(data.as_slice(), ["data: {\"choices\":[]}\n\n"]);
        assert_eq!(worker.join().unwrap(), "POST /v1/chat/completions HTTP/1.1\r\n");
    }

    /// Anthropic is reached at `/messages` with `x-api-key` and never a bearer token; its
    /// `message_stop` frame reaches the webview as an ordinary frame.
    #[test]
    fn anthropic_calls_use_the_messages_route_and_its_own_auth_header() {
        use std::io::{BufRead, BufReader, Write};
        const FIXTURE_KEY: &str = "synthetic-anthropic-key";
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = local_base(&format!("http://{}", listener.local_addr().unwrap())).unwrap();
        let worker = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut stream = BufReader::new(stream);
            let mut first = String::new();
            stream.read_line(&mut first).unwrap();
            let mut content_length = 0;
            let mut headers: Vec<String> = Vec::new();
            loop {
                let mut line = String::new();
                stream.read_line(&mut line).unwrap();
                if line.trim().is_empty() { break; }
                if let Some((name, value)) = line.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse().unwrap();
                    }
                    headers.push(line.trim().to_lowercase());
                }
            }
            let mut body = vec![0; content_length];
            std::io::Read::read_exact(&mut stream, &mut body).unwrap();
            stream.get_mut().write_all(concat!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
                "event: content_block_delta\ndata: {\"type\":\"content_block_delta\"}\n\n",
                "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
            ).as_bytes()).unwrap();
            (first, headers)
        });
        let mut frames = vec![];
        let body = serde_json::json!({"model":"claude-local","system":"be brief","stream":true,"max_tokens":64,
            "messages":[{"role":"user","content":[{"type":"text","text":"sample"}]}]});
        tauri::async_runtime::block_on(chat(base, Duration::from_secs(3), Some(FIXTURE_KEY), Wire::Anthropic, body,
            |frame| { frames.push(frame); Ok(()) })).unwrap();
        let (first, headers) = worker.join().unwrap();
        assert_eq!(first, "POST /v1/messages HTTP/1.1\r\n");
        assert!(headers.iter().any(|line| line == &format!("x-api-key: {FIXTURE_KEY}")));
        assert!(headers.iter().any(|line| line == "anthropic-version: 2023-06-01"));
        assert!(!headers.iter().any(|line| line.starts_with("authorization:")));
        assert_eq!(frames, vec![
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\"}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ]);
    }

    #[test]
    fn no_key_does_not_send_an_authorization_header() {
        let (base, worker) = synthetic_upstream(
            concat!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n", r#"{"data":[]}"#),
            None,
        );
        let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), None)).unwrap();
        assert!(models.is_empty());
        assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");
    }

    #[test]
    fn redirects_are_refused_instead_of_followed() {
        const FIXTURE_KEY: &str = "synthetic-test-key";
        let (base, worker) = synthetic_upstream(
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/v1/models\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            Some(FIXTURE_KEY),
        );
        assert_eq!(tauri::async_runtime::block_on(discover(base, Duration::from_secs(3), Some(FIXTURE_KEY))), Err("upstream_rejected"));
        assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");
    }


}

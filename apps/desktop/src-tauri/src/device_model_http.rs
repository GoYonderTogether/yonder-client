use reqwest::{redirect::Policy, Client, Response, Url};
use serde_json::Value;
use std::time::Duration;

pub type Error = &'static str;
const MAX_REQUEST: usize = 256 * 1024;
const MAX_FRAME: usize = 64 * 1024;
const MAX_STREAM: usize = 2 * 1024 * 1024;

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

pub async fn discover(base: Url, timeout: Duration) -> Result<Vec<String>, Error> {
    let request = base.join("models").map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(client(timeout)?.get(request).send().await.map_err(request_error)?)?;
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
        if model_id(id) && !ids.iter().any(|known| known == id) {
            ids.push(id.to_owned());
        }
        if ids.len() == 100 { break; }
    }
    Ok(ids)
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

pub async fn chat(
    base: Url,
    timeout: Duration,
    body: Value,
    mut emit: impl FnMut(String) -> Result<(), Error>,
) -> Result<(), Error> {
    check_body(&body)?;
    let request = base.join("chat/completions").map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(client(timeout)?
        .post(request)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .body(serde_json::to_vec(&body).map_err(|_| "upstream_rejected")?)
        .send()
        .await
        .map_err(request_error)?)?;
    if !res.headers().get("content-type").and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(';').next().is_some_and(|kind| kind.trim().eq_ignore_ascii_case("text/event-stream")))
    {
        return Err("invalid_response");
    }
    let mut frames = SseFrames::default();
    while let Some(chunk) = res.chunk().await.map_err(request_error)? {
        if frames.push(&chunk, &mut emit)? {
            return Ok(());
        }
    }
    Err("invalid_response")
}

#[derive(Default)]
struct SseFrames {
    line: Vec<u8>,
    event: Option<String>,
    total: usize,
}

impl SseFrames {
    fn push(&mut self, chunk: &[u8], emit: &mut impl FnMut(String) -> Result<(), Error>) -> Result<bool, Error> {
        self.total += chunk.len();
        if self.total > MAX_STREAM { return Err("invalid_response"); }
        for byte in chunk {
            if *byte != b'\n' {
                if self.line.len() >= MAX_FRAME - 3 { return Err("invalid_response"); }
                self.line.push(*byte);
                continue;
            }
            let line = std::str::from_utf8(&self.line).map_err(|_| "invalid_response")?.trim_end_matches('\r');
            if line.is_empty() {
                if let Some(event) = self.event.take() {
                    // Never send [DONE] on the native channel: Web sends it together with terminal ack.
                    if event == "[DONE]" { return Ok(true); }
                    emit(format!("data: {event}\n\n"))?;
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if self.event.is_some()
                    || (data != "[DONE]" && !serde_json::from_str::<Value>(data).is_ok_and(|value| value.is_object()))
                {
                    return Err("invalid_response");
                }
                self.event = Some(data.to_owned());
            } else if !line.starts_with(':') {
                return Err("invalid_response");
            }
            self.line.clear();
        }
        Ok(false)
    }
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
    fn frames_are_bounded_and_split_chunks_wait_for_a_complete_event() {
        let mut parser = SseFrames::default();
        let mut frames = Vec::new();
        let mut emit = |frame| { frames.push(frame); Ok(()) };
        assert!(!parser.push(b"data: {\"choices\":[]}", &mut emit).unwrap());
        assert!(parser.push(b"\r\n\r\ndata: [DONE]\n\n", &mut emit).unwrap());
        assert_eq!(frames, vec!["data: {\"choices\":[]}\n\n"]);
        assert!(SseFrames::default().push(&vec![b'a'; MAX_FRAME + 5], &mut |_| Ok(())).is_err());
        assert!(SseFrames::default().push(b"data: not-json\n\n", &mut |_| Ok(())).is_err());
    }

    fn synthetic_upstream(response: &'static str) -> (Url, std::thread::JoinHandle<String>) {
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
            loop {
                let mut line = String::new();
                stream.read_line(&mut line).unwrap();
                if line.trim().is_empty() { break; }
                if let Some((name, value)) = line.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse().unwrap();
                    }
                }
            }
            let mut body = vec![0; content_length];
            std::io::Read::read_exact(&mut stream, &mut body).unwrap();
            stream.get_mut().write_all(response.as_bytes()).unwrap();
            first
        });
        (base, worker)
    }

    #[test]
    fn real_http_on_isolated_loopback_uses_only_the_expected_routes() {
        let (base, worker) = synthetic_upstream(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"data\":[{\"id\":\"my-local-model\"}]}",
        );
        let models = tauri::async_runtime::block_on(discover(base, Duration::from_secs(3))).unwrap();
        assert_eq!(models.as_slice(), ["my-local-model"]);
        assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");

        let (base, worker) = synthetic_upstream(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"choices\":[]}\n\ndata: [DONE]\n\n",
        );
        let mut data = vec![];
        let body = serde_json::json!({"model":"my-local-model","messages":[{"role":"user","content":"sample"}],
            "stream":true,"max_tokens":128});
        tauri::async_runtime::block_on(chat(base, Duration::from_secs(3), body, |frame| {
            data.push(frame);
            Ok(())
        })).unwrap();
        assert_eq!(data.as_slice(), ["data: {\"choices\":[]}\n\n"]);
        assert_eq!(worker.join().unwrap(), "POST /v1/chat/completions HTTP/1.1\r\n");
    }

    #[test]
    fn redirects_are_refused_instead_of_followed() {
        let (base, worker) = synthetic_upstream(
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/v1/models\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        assert_eq!(tauri::async_runtime::block_on(discover(base, Duration::from_secs(3))), Err("upstream_rejected"));
        assert_eq!(worker.join().unwrap(), "GET /v1/models HTTP/1.1\r\n");
    }

}

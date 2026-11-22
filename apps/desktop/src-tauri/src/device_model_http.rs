use reqwest::{header::{HeaderValue, AUTHORIZATION}, redirect::Policy, Client, RequestBuilder, Response, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub type Error = &'static str;
const MAX_REQUEST: usize = 256 * 1024;
const MAX_FRAME: usize = 64 * 1024;
const MAX_STREAM: usize = 2 * 1024 * 1024;

#[derive(Clone, Copy, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    #[default]
    Openai,
    Anthropic,
}

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

fn authorize(mut request: RequestBuilder, protocol: Protocol, key: Option<&str>) -> Result<RequestBuilder, Error> {
    if protocol == Protocol::Anthropic {
        request = request.header("anthropic-version", "2023-06-01");
    }
    let Some(key) = key else { return Ok(request); };
    validate_key(key)?;
    let value = match protocol {
        Protocol::Openai => HeaderValue::from_str(&format!("Bearer {key}")),
        Protocol::Anthropic => HeaderValue::from_str(key),
    };
    let mut value = value.map_err(|_| "upstream_rejected")?;
    value.set_sensitive(true);
    Ok(match protocol {
        Protocol::Openai => request.header(AUTHORIZATION, value),
        Protocol::Anthropic => request.header("x-api-key", value),
    })
}

/// Reject directly reflected credential strings before forwarding a structured response.
fn contains_credential(value: &Value, key: &str) -> bool {
    match value {
        Value::String(text) => text.contains(key),
        Value::Array(values) => values.iter().any(|v| contains_credential(v, key)),
        Value::Object(fields) => fields.iter().any(|(name, v)| name.contains(key) || contains_credential(v, key)),
        _ => false,
    }
}

pub async fn discover(base: Url, timeout: Duration, protocol: Protocol, key: Option<&str>) -> Result<Vec<String>, Error> {
    let request = base.join("models").map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(authorize(client(timeout)?.get(request), protocol, key)?.send().await.map_err(request_error)?)?;
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

fn check_openai_body(body: &Value) -> Result<(), Error> {
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

fn only_fields(value: &Value, fields: &[&str]) -> bool {
    value.as_object().is_some_and(|object| object.keys().all(|key| fields.contains(&key.as_str())))
}

fn string_field(value: &Value, field: &str) -> bool {
    value.get(field).is_some_and(Value::is_string)
}

// Only the text, tool use and tool result forms emitted by the existing Anthropic adapter.
fn anthropic_block(block: &Value, assistant: bool) -> bool {
    match block.get("type").and_then(Value::as_str) {
        Some("text") => only_fields(block, &["type", "text"]) && string_field(block, "text"),
        Some("tool_use") if assistant => only_fields(block, &["type", "id", "name", "input"])
            && string_field(block, "id") && string_field(block, "name")
            && block.get("input").is_some_and(Value::is_object),
        Some("tool_result") if !assistant => only_fields(block, &["type", "tool_use_id", "content", "is_error"])
            && string_field(block, "tool_use_id") && string_field(block, "content")
            && block.get("is_error").is_some_and(Value::is_boolean),
        _ => false,
    }
}

fn anthropic_message(message: &Value) -> bool {
    let assistant = match message.get("role").and_then(Value::as_str) {
        Some("user") => false,
        Some("assistant") => true,
        _ => return false,
    };
    only_fields(message, &["role", "content"])
        && message.get("content").and_then(Value::as_array)
            .is_some_and(|blocks| blocks.iter().all(|block| anthropic_block(block, assistant)))
}

fn check_anthropic_body(body: &Value) -> Result<(), Error> {
    if !only_fields(body, &["model", "system", "messages", "max_tokens", "stream", "tools", "tool_choice"])
        || !body.get("model").and_then(Value::as_str).is_some_and(model_id)
        || !string_field(body, "system")
        || !body.get("messages").and_then(Value::as_array)
            .is_some_and(|messages| !messages.is_empty() && messages.iter().all(anthropic_message))
        || body.get("stream").and_then(Value::as_bool) != Some(true)
        || !body.get("max_tokens").and_then(Value::as_u64).is_some_and(|tokens| (1..=8192).contains(&tokens))
        || body.get("tools").is_some_and(|tools| !tools.as_array().is_some_and(|tools| tools.iter().all(|tool|
            only_fields(tool, &["name", "description", "input_schema"])
                && string_field(tool, "name") && string_field(tool, "description")
                && tool.get("input_schema").is_some_and(Value::is_object)
        )))
        || body.get("tool_choice").is_some_and(|choice|
            !only_fields(choice, &["type"]) || choice.get("type").and_then(Value::as_str) != Some("none"))
        || serde_json::to_vec(body).map_err(|_| "upstream_rejected")?.len() > MAX_REQUEST
    {
        return Err("upstream_rejected");
    }
    Ok(())
}

pub async fn chat(
    base: Url,
    timeout: Duration,
    protocol: Protocol,
    key: Option<&str>,
    body: Value,
    mut emit: impl FnMut(String) -> Result<(), Error>,
) -> Result<(), Error> {
    let route = match protocol {
        Protocol::Openai => { check_openai_body(&body)?; "chat/completions" }
        Protocol::Anthropic => { check_anthropic_body(&body)?; "messages" }
    };
    let request = base.join(route).map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(authorize(client(timeout)?.post(request), protocol, key)?
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
    let mut frames = SseFrames { protocol, ..Default::default() };
    while let Some(chunk) = res.chunk().await.map_err(request_error)? {
        if frames.push(&chunk, key, &mut emit)? {
            return Ok(());
        }
    }
    Err("invalid_response")
}

#[derive(Default)]
struct SseFrames {
    protocol: Protocol,
    line: Vec<u8>,
    event: Option<(String, Option<String>)>,
    event_name: Option<String>,
    total: usize,
}

impl SseFrames {
    fn push(&mut self, chunk: &[u8], key: Option<&str>, emit: &mut impl FnMut(String) -> Result<(), Error>) -> Result<bool, Error> {
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
                let event_name = self.event_name.take();
                if let Some((event, kind)) = self.event.take() {
                    if self.protocol == Protocol::Openai {
                        if event == "[DONE]" { return Ok(true); }
                        emit(format!("data: {event}\n\n"))?;
                    } else {
                        let kind = kind.as_deref().ok_or("invalid_response")?;
                        if event_name.as_deref().is_some_and(|name| name != kind) { return Err("invalid_response"); }
                        // Only a real message_stop signals success; the bridge emits its canonical frame in the terminal batch.
                        if kind == "message_stop" { return Ok(true); }
                        let frame = format!("event: {kind}\ndata: {event}\n\n");
                        if frame.len() > MAX_FRAME { return Err("invalid_response"); }
                        emit(frame)?;
                    }
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if self.event.is_some() { return Err("invalid_response"); }
                let mut kind = None;
                if self.protocol != Protocol::Openai || data != "[DONE]" {
                    let parsed: Value = serde_json::from_str(data).map_err(|_| "invalid_response")?;
                    if !parsed.is_object() || key.is_some_and(|key| contains_credential(&parsed, key)) {
                        return Err("invalid_response");
                    }
                    if self.protocol == Protocol::Anthropic {
                        let name = parsed.get("type").and_then(Value::as_str).ok_or("invalid_response")?;
                        if name.is_empty() || name.len() > 64 || !name.bytes().all(|c| c.is_ascii_lowercase() || c == b'_') {
                            return Err("invalid_response");
                        }
                        kind = Some(name.to_owned());
                    }
                }
                self.event = Some((data.to_owned(), kind));
            } else if let Some(name) = line.strip_prefix("event:").filter(|_| self.protocol == Protocol::Anthropic) {
                if self.event_name.is_some() || name.len() > 65 { return Err("invalid_response"); }
                self.event_name = Some(name.trim().to_owned());
            } else if !line.starts_with(':') {
                return Err("invalid_response");
            }
            self.line.clear();
        }
        Ok(false)
    }
}

#[cfg(test)]
#[path = "device_model_http_tests.rs"]
mod tests;

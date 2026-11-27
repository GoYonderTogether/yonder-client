use reqwest::{header::{HeaderValue, AUTHORIZATION}, redirect::Policy, Client, RequestBuilder, Response, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::IpAddr;
use std::time::Duration;

pub type Error = &'static str;
const MAX_REQUEST: usize = 256 * 1024;

/// The four wires a local endpoint can serve. They are distinct request and stream shapes, so the
/// shell routes and parses each on its own terms rather than pretending one is another.
#[derive(Clone, Copy, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Protocol {
    #[default]
    OpenaiChat,
    OpenaiResponses,
    AnthropicMessages,
    GeminiNative,
}

impl Protocol {
    /// The credential header this wire expects.
    fn key_header(self) -> &'static str {
        match self {
            Protocol::AnthropicMessages => "x-api-key",
            Protocol::GeminiNative => "x-goog-api-key",
            Protocol::OpenaiChat | Protocol::OpenaiResponses => AUTHORIZATION.as_str(),
        }
    }
}

pub fn local_base(source: &str) -> Result<Url, Error> {
    if source.len() > 256 {
        return Err("endpoint_unavailable");
    }
    let mut url = Url::parse(source.trim()).map_err(|_| "endpoint_unavailable")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "/" | "/v1" | "/v1/")
    {
        return Err("endpoint_unavailable");
    }
    match url.scheme() {
        // A cleartext address is only ever this machine: no DNS lookup, so a modified hosts file or
        // proxy cannot point it elsewhere.
        "http" => match url.host_str() {
            Some("localhost") => url.set_host(Some("127.0.0.1")).map_err(|_| "endpoint_unavailable")?,
            Some("127.0.0.1" | "[::1]") => {}
            _ => return Err("endpoint_unavailable"),
        },
        // A public provider the person names directly: the device makes the call, so a gateway only
        // this machine can reach works. Never a private, loopback, link-local or cloud-metadata host,
        // which would turn the device into a stepping stone into its own network.
        "https" => {
            let host = url.host_str().ok_or("endpoint_unavailable")?;
            if !public_https_host(host) {
                return Err("endpoint_unavailable");
            }
        }
        _ => return Err("endpoint_unavailable"),
    }
    url.set_path("/v1/");
    Ok(url)
}

/// A hostname a public provider can live on: a name (never an IP literal, which could be private),
/// and not loopback, a private-name suffix or a cloud-metadata name. The name itself is what is
/// checked: pre-resolving here would refuse a valid provider on a machine whose proxy answers with
/// a fake address (198.18.x.x), and the actual connection still goes to the name.
fn public_https_host(host: &str) -> bool {
    let name = host.trim_end_matches('.');
    if name.is_empty() || name.parse::<IpAddr>().is_ok() {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    if lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower == "metadata.google.internal"
    {
        return false;
    }
    lower.contains('.')
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

/// Which answer shape a call returns; the SSE module reads it as it parses one stream.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Wire { OpenAi, Anthropic }

pub fn validate_key(key: &str) -> Result<(), Error> {
    if !(1..=2048).contains(&key.len()) || !key.bytes().all(|c| c.is_ascii_graphic()) {
        return Err("upstream_rejected");
    }
    Ok(())
}

fn authorize(mut request: RequestBuilder, protocol: Protocol, key: Option<&str>) -> Result<RequestBuilder, Error> {
    if protocol == Protocol::AnthropicMessages {
        request = request.header("anthropic-version", "2023-06-01");
    }
    let Some(key) = key else { return Ok(request); };
    validate_key(key)?;
    // Only the OpenAI wires carry the key as a bearer token; the other two name it in their own header.
    let value = match protocol {
        Protocol::OpenaiChat | Protocol::OpenaiResponses => HeaderValue::from_str(&format!("Bearer {key}")),
        Protocol::AnthropicMessages | Protocol::GeminiNative => HeaderValue::from_str(key),
    };
    let mut value = value.map_err(|_| "upstream_rejected")?;
    value.set_sensitive(true);
    Ok(request.header(protocol.key_header(), value))
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

pub async fn discover(base: Url, timeout: Duration, protocol: Protocol, key: Option<&str>) -> Result<Vec<String>, Error> {
    let request = base.join("models").map_err(|_| "endpoint_unavailable")?;
    let mut res = accepted(authorize(client(timeout)?.get(request), protocol, key)?.send().await.map_err(request_error)?)?;
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
    value
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(';').next().is_some_and(|kind| kind.trim().eq_ignore_ascii_case("application/json")))
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
        || !body.get("max_tokens").and_then(Value::as_u64).is_some_and(|tokens| (1..=10_000_000).contains(&tokens))
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
        || !body.get("max_tokens").and_then(Value::as_u64).is_some_and(|tokens| (1..=10_000_000).contains(&tokens))
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

/// A Gemini request as this shell forwards it: the node speaks Gemini's own shape, so the body is
/// checked for the one field the route needs and the size limit, and passed through unchanged.
fn check_gemini_body(body: &Value) -> Result<(), Error> {
    if !body.is_object()
        || !body.get("model").and_then(Value::as_str).is_some_and(model_id)
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
    // Gemini's route names the model and asks for SSE; every other wire has one fixed path.
    let gemini_route;
    let route = match protocol {
        Protocol::OpenaiChat => { check_openai_body(&body)?; "chat/completions" }
        Protocol::OpenaiResponses => { check_openai_body(&body)?; "responses" }
        Protocol::AnthropicMessages => { check_anthropic_body(&body)?; "messages" }
        Protocol::GeminiNative => {
            check_gemini_body(&body)?;
            let model = body.get("model").and_then(Value::as_str).ok_or("upstream_rejected")?;
            gemini_route = format!("models/{model}:streamGenerateContent?alt=sse");
            gemini_route.as_str()
        }
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
    let mut frames = crate::device_model_sse::SseFrames::new(match protocol {
        Protocol::OpenaiChat | Protocol::OpenaiResponses | Protocol::GeminiNative => Wire::OpenAi,
        Protocol::AnthropicMessages => Wire::Anthropic,
    });
    while let Some(chunk) = res.chunk().await.map_err(request_error)? {
        if frames.push(&chunk, key, &mut emit)? {
            return Ok(());
        }
    }
    Err("invalid_response")
}

#[cfg(test)]
#[path = "device_model_http_tests.rs"]
mod tests;

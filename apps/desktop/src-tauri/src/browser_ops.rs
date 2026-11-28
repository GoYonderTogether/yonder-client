//! The five browser operations' argument handling and result shaping, kept out of `browser.rs` so
//! each file has one responsibility (and stays under the repository's length limit). `browser.rs`
//! owns the device state and the four-state check; here are the calls that run `bsk` and the parsing
//! of what it answers (aria-snapshot lines into elements, a PNG path into an inline image).

use crate::browser::Device;
use crate::browser_bsk::BskError;
use crate::browser_limits as limits;
use serde_json::{json, Value};

/// "upstream" `bsk` browser commands a person's 0.3.x install needs: `--json` is a global that may
/// come before the subcommand on either major version, so every call puts it first.
pub(crate) fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

pub(crate) fn session(device: &Device, args: &Value) -> Result<Value, BskError> {
    let action = string_arg(args, "action").unwrap_or("");
    match action {
        "start" => {
            let output = device
                .bsk
                .json(&strings(&["--json", "session", "start"]), limits::SESSION_START_TIMEOUT)?;
            let id = output
                .get("session_id")
                .and_then(Value::as_str)
                .ok_or(BskError::Unreadable)?
                .to_owned();
            Ok(json!({
                "kind": "browser_session",
                "sessions": [page_of(device, &id)],
                "sessionId": id,
            }))
        }
        "stop" => {
            let id = required_session(args)?;
            device.bsk.json(
                &strings(&["--json", "session", "stop", &id]),
                limits::SESSION_STOP_TIMEOUT,
            )?;
            Ok(json!({ "kind": "browser_session", "sessions": list_sessions(device)?, "sessionId": id }))
        }
        _ => Ok(json!({ "kind": "browser_session", "sessions": list_sessions(device)? })),
    }
}

/// Every open session, each named by the page its Agent Window shows. A session that answers with no
/// tab yet (a just-opened window) reports empty url and title rather than being dropped.
pub(crate) fn list_sessions(device: &Device) -> Result<Vec<Value>, BskError> {
    let output = device
        .bsk
        .json(&strings(&["--json", "session", "list"]), limits::LIST_TIMEOUT)?;
    let sessions = output.as_array().cloned().unwrap_or_default();
    let mut rows = Vec::new();
    for row in sessions.iter().take(limits::SESSIONS) {
        let Some(id) = row.get("session_id").and_then(Value::as_str) else {
            continue;
        };
        rows.push(page_of(device, id));
    }
    Ok(rows)
}

/// One session's page: the active tab's url and title. The tab fields are looked up on the Agent
/// Window's own tab scope so a person's unrelated tab is never read into the answer.
pub(crate) fn page_of(device: &Device, id: &str) -> Value {
    let page = page_row(device, id).unwrap_or_default();
    json!({ "id": id, "url": page.0, "title": page.1 })
}

pub(crate) fn page_row(device: &Device, id: &str) -> Option<(String, String)> {
    let output = device.bsk.json(
        &strings(&["--json", "tab", "list", "--session", id, "--scope", "agent"]),
        limits::LIST_TIMEOUT,
    ).ok()?;
    let tabs = output.get("tabs").and_then(Value::as_array).cloned().unwrap_or_default();
    let active = tabs.iter().find(|tab| tab.get("active").and_then(Value::as_bool) == Some(true));
    let tab = active.or_else(|| tabs.first())?;
    Some((
        clean(tab.get("url").and_then(Value::as_str).unwrap_or(""), 8_192),
        clean(tab.get("title").and_then(Value::as_str).unwrap_or(""), 500),
    ))
}

pub(crate) fn navigate(device: &Device, args: &Value) -> Result<Value, BskError> {
    let id = required_session(args)?;
    let url = string_arg(args, "url").filter(|url| allowed_url(url)).ok_or(BskError::Failed)?;
    let wait = match string_arg(args, "waitUntil") {
        Some("domcontentloaded") => "domcontentloaded",
        _ => "load",
    };
    let timeout = limits::NAVIGATE_CLI_SECONDS.to_string();
    let output = device.bsk.json(
        &strings(&[
            "--json", "navigate", "--session", &id, "--wait-until", wait, "--timeout", &timeout, &url,
        ]),
        limits::NAVIGATE_TIMEOUT,
    )?;
    // The final url is what a redirect settled on; the title comes from the tab the navigation left.
    let final_url = output
        .get("final_url")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| url.to_owned());
    let title = page_row(device, &id).map(|(_, title)| title).unwrap_or_default();
    Ok(json!({ "kind": "browser_navigate", "url": final_url, "title": title }))
}

pub(crate) fn observe(device: &Device, args: &Value) -> Result<Value, BskError> {
    let id = required_session(args)?;
    let mode = string_arg(args, "mode").unwrap_or("text");
    let timeout = limits::OBSERVE_TIMEOUT;
    if mode == "snapshot" {
        // `bsk snapshot` lists the ref-addressable tree; `bsk observe` reads the page's text. The
        // protocol's `ref` narrows a subtree, which the CLI's snapshot does not take in this version,
        // so it is not passed rather than silently widening what the caller asked for.
        let output = device.bsk.json(&strings(&["--json", "snapshot", "--session", &id]), timeout)?;
        let text = clean(output.get("text").and_then(Value::as_str).unwrap_or(""), limits::OBSERVE_TEXT_BYTES);
        let elements = elements(&text);
        let truncated = output.get("truncated").and_then(Value::as_bool).unwrap_or(false)
            || elements.len() >= limits::OBSERVE_ELEMENTS;
        let mut value = json!({ "kind": "browser_observe", "text": text, "truncated": truncated });
        if !elements.is_empty() {
            value["elements"] = Value::Array(elements);
        }
        Ok(value)
    } else {
        let output = device.bsk.json(&strings(&["--json", "observe", "--session", &id]), timeout)?;
        let text = clean(output.get("text").and_then(Value::as_str).unwrap_or(""), limits::OBSERVE_TEXT_BYTES);
        let truncated = output.get("truncated").and_then(Value::as_bool).unwrap_or(false);
        Ok(json!({ "kind": "browser_observe", "text": text, "truncated": truncated }))
    }
}

/// The ref-addressable elements a snapshot's text names. bsk renders each as an indented line
/// `@e12 role "accessible name" =value`; this reads those back into the protocol's element rows,
/// stopping at the server's 400-element cap so a long page reports `truncated` instead of failing.
pub(crate) fn elements(text: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    for line in text.lines() {
        if rows.len() >= limits::OBSERVE_ELEMENTS {
            break;
        }
        let trimmed = line.trim_start();
        let Some(rest) = trimmed.strip_prefix('@') else {
            continue;
        };
        let Some((ref_, tail)) = split_first(rest, ' ') else {
            continue;
        };
        if !ref_.starts_with('e') || !ref_[1..].chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        // role is the first token; the quoted name follows it; `=value` closes the line.
        let (role, remainder) = split_first(tail.trim_start(), ' ').unwrap_or((tail.trim(), ""));
        let (name, value) = quoted(remainder);
        let mut row = json!({ "ref": ref_, "role": clean(role, 64), "name": clean(&name, 500) });
        if !value.is_empty() {
            row["value"] = json!(clean(&value, 2_000));
        }
        rows.push(row);
    }
    rows
}

/// The quoted accessible name and an optional `=value` after it, from one snapshot line's tail.
pub(crate) fn quoted(text: &str) -> (String, String) {
    let text = text.trim_start();
    if let Some(inner) = text.strip_prefix('"') {
        let mut name = String::new();
        let mut chars = inner.char_indices();
        while let Some((index, character)) = chars.next() {
            match character {
                '"' => {
                    let after = &inner[index + 1..];
                    let value = after.trim_start().strip_prefix('=').map(str::to_owned).unwrap_or_default();
                    return (name, unquote(&value));
                }
                '\\' => {
                    if let Some((_, next)) = chars.next() {
                        name.push(next);
                    }
                }
                _ => name.push(character),
            }
        }
        return (name, String::new());
    }
    (String::new(), String::new())
}

pub(crate) fn unquote(value: &str) -> String {
    let value = value.trim();
    value
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
        .unwrap_or(value)
        .replace("\\\"", "\"")
}

pub(crate) fn act(device: &Device, args: &Value) -> Result<Value, BskError> {
    let id = required_session(args)?;
    let action = string_arg(args, "action").unwrap_or("");
    let ref_ = string_arg(args, "ref");
    let target = ref_.map(|ref_| format!("@{}", ref_.trim_start_matches('@')));
    let (argv, timeout) = match action {
        "click" => (
            interaction(&["click", "--session", &id], target.as_deref()),
            limits::ACT_TIMEOUT,
        ),
        "hover" => (
            interaction(&["hover", "--session", &id], target.as_deref()),
            limits::ACT_TIMEOUT,
        ),
        "fill" => {
            let value = string_arg(args, "value").unwrap_or("");
            let mut argv = interaction(&["fill", "--session", &id], target.as_deref());
            argv.push("--value".into());
            argv.push(value.to_owned());
            (argv, limits::ACT_TIMEOUT)
        }
        "select" => {
            let value = string_arg(args, "value").unwrap_or("");
            let mut argv = interaction(&["select", "--session", &id], target.as_deref());
            argv.push("--value".into());
            argv.push(value.to_owned());
            (argv, limits::ACT_TIMEOUT)
        }
        "press" => {
            let key = string_arg(args, "key").unwrap_or("");
            let argv = strings(&["--json", "press", "--session", &id, key]);
            (argv, limits::ACT_TIMEOUT)
        }
        "scroll" => {
            let delta = args.get("deltaY").and_then(Value::as_i64).unwrap_or(0);
            let mut argv = interaction(&["wheel", "--session", &id], target.as_deref());
            argv.push("--delta-y".into());
            argv.push(delta.to_string());
            (argv, limits::ACT_TIMEOUT)
        }
        "screenshot" => {
            let full = args.get("fullPage").and_then(Value::as_bool).unwrap_or(false);
            let mut argv = strings(&["--json", "screenshot", "--session", &id]);
            if full {
                argv.push("--full-page".into());
            }
            let seconds = limits::SCREENSHOT_CLI_SECONDS.to_string();
            argv.push("--timeout".into());
            argv.push(seconds);
            (argv, limits::SCREENSHOT_TIMEOUT)
        }
        _ => return Err(BskError::Failed),
    };
    let output = device.bsk.json(&argv, timeout)?;
    if action == "screenshot" {
        return screenshot(output).ok_or(BskError::Failed);
    }
    // Every other action answers with the tool's own JSON; a non-error status is the success the
    // protocol reports as `ok`.
    let ok = !output.get("ok").and_then(Value::as_bool).is_some_and(|ok| !ok);
    Ok(json!({ "kind": "browser_act", "ok": ok }))
}

/// `["--json", <subcommand>, ...]`, with the ref appended as a positional target when one is given.
pub(crate) fn interaction(head: &[&str], target: Option<&str>) -> Vec<String> {
    let mut argv = strings(&["--json"]);
    argv.extend(head.iter().map(|value| (*value).to_owned()));
    if let Some(target) = target {
        argv.push(target.to_owned());
    }
    argv
}

/// The screenshot `bsk` wrote to a temp path, read back, size-checked and base64-encoded. A PNG over
/// the device's cap is refused as `operation_failed` rather than cut; a smaller one reports its own
/// header dimensions, and a header that will not parse reports zero rather than refusing the image.
pub(crate) fn screenshot(output: Value) -> Option<Value> {
    let path = output.get("path").and_then(Value::as_str)?;
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() > limits::SCREENSHOT_BYTES {
        return None;
    }
    let (width, height) = crate::browser_png::dimensions(&bytes).unwrap_or((0, 0));
    Some(json!({
        "kind": "browser_act",
        "ok": true,
        "image": {
            "base64": base64(&bytes),
            "mimeType": "image/png",
            "width": width,
            "height": height,
        },
    }))
}

/// URL-safe is not wanted here: the server's base64 check is the standard alphabet with padding.
pub(crate) fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
    }
    out
}

pub(crate) fn required_session(args: &Value) -> Result<String, BskError> {
    string_arg(args, "sessionId")
        .filter(|id| valid_session(id))
        .map(str::to_owned)
        .ok_or(BskError::Failed)
}

pub(crate) fn valid_session(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub(crate) fn allowed_url(url: &str) -> bool {
    if url == "about:blank" {
        return true;
    }
    matches!(url.split_once("://"), Some((scheme, rest)) if (scheme == "http" || scheme == "https") && !rest.is_empty())
}

fn string_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

/// Cut text to a bound at a character boundary and drop NULs, so a hostile page cannot make the
/// receipt fail the server's own checks.
pub(crate) fn clean(text: &str, max: usize) -> String {
    let text = text.replace('\0', "");
    if text.len() <= max {
        return text;
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}

pub(crate) fn split_first(text: &str, separator: char) -> Option<(&str, &str)> {
    let index = text.find(separator)?;
    Some((&text[..index], &text[index + separator.len_utf8()..]))
}

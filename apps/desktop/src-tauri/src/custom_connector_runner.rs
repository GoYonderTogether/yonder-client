//! Running one custom connector package's entry on this device (20261128-people-archive 03 §4).
//!
//! A call arrives as `connector.custom.call`; this module starts the package's entry **without a
//! shell** — `Command::new(entry)`, so only a real executable (a binary or a shebang script) runs —
//! with `{tool, args}` as one JSON object on stdin, the package directory as the working directory,
//! and a minimal environment. stdout must be one JSON object or a fixed refusal comes back.
//!
//! Every limit here is a device-side backstop that names what it protects:
//! * the result is 64 KiB after serialization — one result must not eat a whole run of the owner's
//!   context (03b). Over the bound the value is `{truncated: true, text}` and the text is shrunk
//!   until the wrapper itself fits;
//! * a cancel flag ends the call at once and kills the entry's process group, not just the entry:
//!   a compile the package started must not outlive its caller;
//! * the fallback deadline is 30 minutes, the same `COMMAND_BACKSTOP_MS` the server gives a device
//!   command. It protects against a caller whose cancel signal never arrives (a socket lost
//!   mid-call); the server's `expiresAt` normally ends the call first, and a call arriving after it
//!   never starts.
//!
//! Nothing here logs the package's arguments or output, so a package that keeps a credential in its
//! own files cannot leak it through this module.

use crate::custom_connector_store::{self, Cursors};
use crate::custom_connectors::{self, Manifest};
use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Serialized-result bound, the protocol's own `CUSTOM_CALL_RESULT_MAX_BYTES`.
pub const RESULT_MAX_BYTES: usize = 64 * 1024;
/// Event body excerpt, in characters, matching the server's cut (03b: 2000).
pub const EVENT_BODY_MAX: usize = 2000;
/// The slowest a package may be polled; below this it would drag the device down (03b).
pub const POLL_MIN_SECONDS: u64 = 30;
/// One batch's cap, the server's own `CUSTOM_EVENT_BATCH_MAX`.
pub const EVENT_BATCH_MAX: usize = 100;
/// A call's fallback deadline: `COMMAND_BACKSTOP_MS`, 30 minutes of wall clock.
pub const CALL_BACKSTOP_MS: u64 = 30 * 60_000;
/// A poll holds no owner request open, so it is cut shorter than a call; a package that hangs must
/// not stack polls behind itself on the same entry.
pub const POLL_TIMEOUT_MS: u64 = 2 * 60_000;
const MAX_STDIN_BYTES: usize = 256 * 1024;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX)
}

/// One entry run's outcome; `error` is always one of this module's fixed codes.
pub struct Outcome {
    pub stdout: Option<Vec<u8>>,
    pub error: Option<String>,
}

impl Outcome {
    fn fail(code: &str) -> Outcome {
        Outcome { stdout: None, error: Some(code.into()) }
    }
}

/// The environment an entry gets: its own directory is `cwd`, and these four are all it can read.
/// `PATH` is what a shebang's `env` lookup needs; `HOME` and `TMPDIR` are where a package may keep
/// its own files; `LANG` keeps text output in one encoding. Everything else the owner's shell holds
/// (tokens, proxies, editor paths) is withheld by `env_clear`.
fn environment() -> Vec<(String, String)> {
    let mut env = Vec::new();
    for name in ["PATH", "HOME", "TMPDIR"] {
        if let Some(text) = std::env::var_os(name).and_then(|value| value.to_str().map(str::to_owned)) {
            env.push((name.to_string(), text));
        }
    }
    if !env.iter().any(|(name, _)| name == "PATH") {
        env.push(("PATH".into(), "/usr/local/bin:/usr/bin:/bin".into()));
    }
    env.push(("LANG".into(), "C.UTF-8".into()));
    env
}

/// Start the entry, hand it `input` as JSON on stdin, and collect stdout until it exits, the cancel
/// flag is set, or `deadline_ms` passes.
pub fn execute(entry: &Path, workdir: &Path, input: &Value, cancelled: &AtomicBool, deadline_ms: u64) -> Outcome {
    let payload = match serde_json::to_vec(input) {
        Ok(bytes) if bytes.len() <= MAX_STDIN_BYTES => bytes,
        _ => return Outcome::fail("invalid_arguments"),
    };
    let mut command = Command::new(entry);
    command
        .current_dir(workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .env_clear();
    for (name, value) in environment() {
        command.env(name, value);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // The entry's own process group, so a cancel kills it and everything it started — the same
        // rule the terminal runner uses for a shell command.
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0000_0200);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return Outcome::fail("entry_not_executable"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Outcome::fail("entry_missing"),
        Err(_) => return Outcome::fail("entry_unavailable"),
    };
    #[cfg(windows)]
    let _ = crate::shell_process_windows::assign(child.id());
    if let Some(mut stdin) = child.stdin.take() {
        // A package that never reads its input must not fail the call when the pipe closes on it.
        let _ = stdin.write_all(&payload);
        let _ = stdin.flush();
    }
    // stdout is drained on its own thread: a package may write more than a pipe buffer, and a list
    // — not one write — is what is bounded, so the pipe never blocks the entry.
    let stdout = child.stdout.take();
    let reader = std::thread::spawn(move || -> Vec<u8> {
        let mut collected = Vec::new();
        if let Some(mut stdout) = stdout {
            let mut buffer = [0u8; 8192];
            while let Ok(read) = stdout.read(&mut buffer) {
                if read == 0 {
                    break;
                }
                // The bound plus one byte: the extra byte is what says the output was cut.
                let room = RESULT_MAX_BYTES + 1 - collected.len();
                if room > 0 {
                    collected.extend_from_slice(&buffer[..read.min(room)]);
                }
            }
        }
        collected
    });
    let mut timed_out = false;
    loop {
        if cancelled.load(Ordering::SeqCst) {
            crate::shell_process::kill_tree(&mut child);
            let _ = reader.join();
            return Outcome::fail("cancelled");
        }
        if now_ms() >= deadline_ms {
            timed_out = true;
            crate::shell_process::kill_tree(&mut child);
            break;
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                crate::shell_process::kill_tree(&mut child);
                let _ = reader.join();
                return Outcome::fail("operation_failed");
            }
        }
    }
    let bytes = reader.join().unwrap_or_default();
    if timed_out {
        return Outcome::fail("timeout");
    }
    Outcome { stdout: Some(bytes), error: None }
}

/// One JSON object from stdout, or the reason there is none. Over the bound, the value is a
/// `{truncated: true, text}` preview that itself serializes within the bound.
pub fn parse_result(bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() <= RESULT_MAX_BYTES {
        let text = std::str::from_utf8(bytes).map_err(|_| "invalid_result".to_string())?;
        let value: Value = serde_json::from_str(text).map_err(|_| "invalid_result".to_string())?;
        return if value.is_object() { Ok(value) } else { Err("invalid_result".into()) };
    }
    // The head of the output, cut on a character boundary, then shrunk until the wrapper fits:
    // JSON escaping can make a byte cost more than a byte, so the serialized size is the one to
    // trust, not the source length.
    let mut chars: Vec<char> = String::from_utf8_lossy(&bytes[..RESULT_MAX_BYTES]).chars().collect();
    loop {
        let value = json!({ "truncated": true, "text": chars.iter().collect::<String>() });
        match serde_json::to_vec(&value) {
            Ok(serialized) if serialized.len() <= RESULT_MAX_BYTES => return Ok(value),
            Ok(_) if chars.len() > 1 => {
                let next = chars.len() * 3 / 4;
                chars.truncate(next);
            }
            Ok(_) => return Ok(json!({ "truncated": true, "text": "" })),
            Err(_) => return Err("invalid_result".into()),
        }
    }
}

/// Validate one poll's output and cut it to what the server accepts (03b): at most 100 events, each
/// body excerpt at most 2000 characters, participants and conversation bounded the way the server
/// bounds them. Anything malformed is refused whole, so nothing half-written is ever sent.
pub fn poll_output(value: &Value, manifest: &Manifest) -> Result<Value, String> {
    let object = value.as_object().ok_or("invalid_result")?;
    let events = object.get("events").and_then(Value::as_array).ok_or("invalid_result")?;
    if events.len() > EVENT_BATCH_MAX {
        return Err("batch_too_large".into());
    }
    let cursor = match object.get("cursor") {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) if text.len() <= 512 => Some(text.clone()),
        Some(_) => return Err("invalid_result".into()),
    };
    let declared: Vec<&String> = manifest.events.keys().collect();
    let mut rows = Vec::with_capacity(events.len());
    for event in events {
        let row = event.as_object().ok_or("invalid_result")?;
        let text = |key: &str| row.get(key).and_then(Value::as_str);
        let source_id = text("sourceId")
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.len() <= 200);
        let occurred_at = text("occurredAt").filter(|value| value.len() <= 64);
        let (Some(source_id), Some(occurred_at)) = (source_id, occurred_at) else {
            return Err("invalid_result".into());
        };
        let kind = match text("type") {
            Some(kind) if declared.iter().any(|item| item.as_str() == kind) => Some(kind.to_string()),
            Some(_) => return Err("event_type_unknown".into()),
            None if declared.len() == 1 => Some(declared[0].clone()),
            None => return Err("event_type_required".into()),
        };
        let mut out = Map::new();
        out.insert("sourceId".into(), json!(source_id));
        out.insert("occurredAt".into(), json!(occurred_at));
        out.insert(
            "title".into(),
            json!(text("title").unwrap_or("").trim().chars().take(500).collect::<String>()),
        );
        out.insert(
            "body".into(),
            json!(text("body").unwrap_or("").chars().take(EVENT_BODY_MAX).collect::<String>()),
        );
        if let Some(kind) = kind {
            out.insert("type".into(), json!(kind));
        }
        let participants = row
            .get("participants")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .take(64)
                    .filter_map(Value::as_str)
                    .map(|name| name.chars().take(200).collect::<String>())
                    .collect::<Vec<_>>()
            })
            .filter(|list| !list.is_empty());
        if let Some(list) = participants {
            out.insert("participants".into(), json!(list));
        }
        if let Some(conversation) = text("conversation") {
            out.insert(
                "conversation".into(),
                json!(conversation.chars().take(500).collect::<String>()),
            );
        }
        rows.push(Value::Object(out));
    }
    Ok(json!({ "events": rows, "cursor": cursor }))
}

/// The deadline a call runs to: the sooner of the server's `expiresAt` and the 30-minute backstop.
pub fn call_deadline(expires_ms: u64, now: u64) -> u64 {
    expires_ms.min(now.saturating_add(CALL_BACKSTOP_MS))
}

/// Run one call's entry. The caller has already checked the grant, the package and the tool name.
pub fn run_call(
    package: &custom_connectors::Package,
    tool: &str,
    args: &Map<String, Value>,
    cancelled: &AtomicBool,
    expires_ms: u64,
) -> Outcome {
    let input = json!({ "tool": tool, "args": args });
    execute(
        &package.entry,
        &package.root,
        &input,
        cancelled,
        call_deadline(expires_ms, now_ms()),
    )
}

/// Poll a package once: run its manifest poll tool with `{tool, args: {cursor}}`, then return the
/// cut event list and the cursor this batch would advance to. The caller keeps the returned cursor
/// as pending and commits it only when the server acknowledges the batch (03b).
pub fn poll(
    package: &custom_connectors::Package,
    cursors: &Cursors,
    connection_id: &str,
    cancelled: &AtomicBool,
) -> Result<(Value, Option<String>), String> {
    let poll = package.manifest.poll.as_ref().ok_or("poll_not_declared")?;
    if poll.every_seconds < POLL_MIN_SECONDS {
        return Err("poll_interval_invalid".into());
    }
    if package
        .manifest
        .tool(&poll.tool)
        .is_none_or(|tool| tool.mode != "query")
    {
        return Err("poll_not_declared".into());
    }
    let cursor = custom_connector_store::cursor_of(cursors, connection_id);
    let input = json!({ "tool": poll.tool, "args": { "cursor": cursor } });
    let outcome = execute(&package.entry, &package.root, &input, cancelled, now_ms() + POLL_TIMEOUT_MS);
    if let Some(error) = outcome.error {
        return Err(error);
    }
    let value: Value =
        serde_json::from_slice(&outcome.stdout.unwrap_or_default()).map_err(|_| "invalid_result".to_string())?;
    let cut = poll_output(&value, &package.manifest)?;
    let next = cut.get("cursor").and_then(Value::as_str).map(str::to_owned);
    Ok((cut["events"].clone(), next))
}
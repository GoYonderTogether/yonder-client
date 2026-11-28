//! Running the `bsk` command line: spawn it under a deadline, take the JSON object out of its
//! output, and turn a bsk error into this connector's own codes.
//!
//! `bsk` is Tencent's BrowserSkill CLI (specs/connectors/browser.md §1); it owns the daemon and the
//! browser extension, and the device only ever drives it through its ``--json`` subcommands. Three
//! rules shape this module:
//!
//! * **Bounded.** Every call has a deadline and its child is killed when it passes. An agent whose
//!   page hung must get a real error, not a receipt that never arrives.
//! * **Robust.** `bsk --json` prints the payload to stdout, but a rising version banner can be
//!   printed too, so the parser looks for the first balanced JSON object rather than trusting that
//!   the whole of stdout is JSON.
//! * **Honest.** An unparsable answer, a timeout, a missing binary and a bsk RPC error each become a
//!   distinct state the model is told — never raw CLI output, never a generic failure.
//!
//! Everything here is injectable: [`Bsk`] carries the command name, the environment and the
//! [`Supervisor`] that actually spawns. Tests drive a fake `bsk` executable, so nothing depends on
//! the real CLI being installed on the machine running the tests.

use serde_json::Value;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

/// How one child process is started. The real one is [`System`]; tests supply a [`Scripted`] one so
/// argv, environment and timeouts are checked without a real `bsk`.
pub trait Supervisor: Send + Sync {
    /// Run `command` with these arguments and environment under `timeout`, and return what it wrote
    /// to stdout and stderr. `Err(Outcome::TimedOut)` when the deadline passed and the child was
    /// killed; `Err(Outcome::Missing)` when the program cannot be found.
    fn run(
        &self,
        command: &str,
        args: &[String],
        env: &BTreeMap<String, String>,
        timeout: Duration,
    ) -> Result<Output, Spawn>;

    /// Whether a program exists and is runnable on this device's PATH.
    fn resolves(&self, command: &str) -> bool;
}

pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub status: i32,
}

/// Why a run did not produce output to parse.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Spawn {
    /// The program is not on PATH, or cannot be executed.
    Missing,
    /// The deadline passed; the child was killed.
    TimedOut,
}

/// The real supervisor: `std::process::Command`, with a watchdog that kills the child at the deadline.
pub struct System;

impl Supervisor for System {
    fn run(
        &self,
        command: &str,
        args: &[String],
        env: &BTreeMap<String, String>,
        timeout: Duration,
    ) -> Result<Output, Spawn> {
        let mut process = Command::new(command);
        process
            .args(args)
            .envs(env)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // No console window flashes when the daemon is started from the app.
            process.creation_flags(crate::browser_windows::CREATE_NO_WINDOW);
        }
        let mut child = process.spawn().map_err(|_| Spawn::Missing)?;
        let (sender, receiver) = mpsc::channel::<()>();
        let pid = child.id();
        let halted = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let halt = halted.clone();
        let watch = std::thread::spawn(move || {
            if receiver.recv_timeout(timeout).is_ok() {
                return false;
            }
            halt.store(true, std::sync::atomic::Ordering::SeqCst);
            kill(pid);
            true
        });
        // Read both pipes to EOF on their own threads so a full pipe cannot deadlock the wait.
        let mut stdout = child.stdout.take();
        let mut stderr = child.stderr.take();
        let read_out = std::thread::spawn(move || drain(&mut stdout));
        let read_err = std::thread::spawn(move || drain(&mut stderr));
        let status = child.wait();
        let _ = sender.send(());
        let _ = watch.join();
        let out = read_out.join().unwrap_or_default();
        let err = read_err.join().unwrap_or_default();
        if halted.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(Spawn::TimedOut);
        }
        let status = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        Ok(Output {
            stdout: out,
            stderr: err,
            status,
        })
    }

    fn resolves(&self, command: &str) -> bool {
        if command.contains(std::path::MAIN_SEPARATOR) {
            return PathBuf::from(command).is_file();
        }
        let path = std::env::var_os("PATH").unwrap_or_default();
        std::env::split_paths(&path).any(|dir| {
            let candidate = dir.join(command);
            candidate.is_file()
        })
    }
}

fn drain<R: Read>(reader: &mut Option<R>) -> String {
    let mut buffer = Vec::new();
    if let Some(handle) = reader {
        let _ = handle.take(SCREENSHOT_READ_CAP).read_to_end(&mut buffer);
    }
    String::from_utf8_lossy(&buffer).into_owned()
}

/// A hard cap on what one child may print: a screenshot's base64 is the largest answer bsk gives,
/// and twice that is slack for a banner or a log line, not a place to load a whole page.
const SCREENSHOT_READ_CAP: u64 = 2 * 1024 * 1024;

#[cfg(unix)]
fn kill(pid: u32) {
    // The child is `bsk`, not a shell: SIGKILL reaches it, and the daemon it uses is a separate,
    // deliberately reused process that must survive.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(windows)]
fn kill(pid: u32) {
    crate::browser_windows::kill(pid);
}

/// The bsk command as one call site configures it: the program, the environment every child gets,
/// and the supervisor.
pub struct Bsk {
    pub program: String,
    pub env: BTreeMap<String, String>,
    pub supervisor: Box<dyn Supervisor>,
}

impl std::fmt::Debug for Bsk {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("Bsk").field("program", &self.program).finish()
    }
}

impl Bsk {
    /// The device's own `bsk`: found on PATH, auto-update off (the build must not replace itself
    /// under the app — specs/connectors/browser.md §2), and the real supervisor.
    pub fn device() -> Bsk {
        Bsk {
            program: program(),
            env: environment(),
            supervisor: Box::new(System),
        }
    }

    /// Run one `bsk` invocation and return the JSON object it printed.
    pub fn json(&self, args: &[String], timeout: Duration) -> Result<Value, BskError> {
        let output = self
            .supervisor
            .run(&self.program, args, &self.env, timeout)
            .map_err(|failure| match failure {
                Spawn::Missing => BskError::NotInstalled,
                Spawn::TimedOut => BskError::TimedOut,
            })?;
        // bsk writes its structured error as JSON with a non-zero status; parse the JSON first, then
        // decide whether it is a failure the connector recognizes.
        let value = extract_json(&output.stdout)
            .or_else(|| extract_json(&output.stderr))
            .ok_or(BskError::Unreadable)?;
        if let Some(code) = value.get("code").and_then(Value::as_str) {
            return Err(classify(code, output.status));
        }
        if output.status != 0 {
            return Err(classify("", output.status));
        }
        Ok(value)
    }

    /// Whether the program is on this device at all.
    pub fn installed(&self) -> bool {
        self.supervisor.resolves(&self.program)
    }

    /// Run one `bsk` invocation for its exit status alone. `bsk daemon start` writes no JSON — it
    /// starts a detached daemon and returns once it is ready — so parsing its output would report a
    /// success as a failure. A non-zero status is `Failed`, a missing program `NotInstalled`, and a
    /// timeout `TimedOut`; the daemon it started outlives the call.
    pub fn run(&self, args: &[String], timeout: Duration) -> Result<(), BskError> {
        let output = self
            .supervisor
            .run(&self.program, args, &self.env, timeout)
            .map_err(|failure| match failure {
                Spawn::Missing => BskError::NotInstalled,
                Spawn::TimedOut => BskError::TimedOut,
            })?;
        if output.status == 0 {
            Ok(())
        } else if output.status == 2 {
            Err(BskError::DaemonUnavailable)
        } else {
            Err(BskError::Failed)
        }
    }
}

/// What `bsk` said, mapped to the connector's own states. Only the states the model can act on are
/// translated; the rest is a generic failure that says the command did not finish.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BskError {
    /// `bsk` is not on PATH — the device cannot drive a browser.
    NotInstalled,
    /// The call was killed at its deadline.
    TimedOut,
    /// No daemon is listening (or it refused to start) — the browser service is not running.
    DaemonUnavailable,
    /// The daemon is up but no extension is attached.
    Disconnected,
    /// The session a call named is gone.
    SessionNotFound,
    /// `bsk` printed something other than a JSON object.
    Unreadable,
    /// Anything else: a CLI parse error, a CDP failure, a page that never loaded.
    Failed,
}

fn classify(code: &str, status: i32) -> BskError {
    match code {
        "not_found" => BskError::SessionNotFound,
        "no_browser_connected" | "multiple_browsers_online" => BskError::Disconnected,
        "invalid_params" | "unknown_method" => BskError::Failed,
        "" if status == 2 => BskError::DaemonUnavailable,
        _ => BskError::Failed,
    }
}

/// The name the app runs. A packaged build and a person's shell find `bsk` the same way, by PATH;
/// on Windows the installer's own directory is checked too, and the env var is a testing seam and a
/// way to point at a non-standard install.
fn program() -> String {
    let configured = std::env::var("YONDER_BSK").ok();
    let configured = configured.as_deref();
    #[cfg(windows)]
    {
        let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
        return crate::browser_windows::program(configured, home.as_deref());
    }
    #[cfg(not(windows))]
    {
        if let Some(value) = configured.filter(|value| !value.trim().is_empty()) {
            return value.to_owned();
        }
        // `install.sh` writes `bsk` to `$HOME/.local/bin` and only edits shell profiles; a GUI-launched
        // app does not see that PATH, so check the well-known directory directly.
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            let candidate = home.join(".local").join("bin").join("bsk");
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
        "bsk".to_owned()
    }
}

/// Every child gets `BSK_AUTO_UPDATE=off`: the CLI must never replace the copy the app is driving
/// while a session is open (specs/connectors/browser.md §2). `BSK_AUTO_START` is left alone on
/// purpose — the daemon the app reuses is the person's own, and the CLI is allowed to find or start
/// it; whether the app reuses a running one is decided in `browser.rs`, not here.
fn environment() -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("BSK_AUTO_UPDATE".to_owned(), "off".to_owned());
    env
}

/// The first complete JSON value in `text`, tolerating a banner line before it and trailing lines
/// after it. A value may be an object, an array or a scalar — `bsk browsers` prints a bare array, and
/// a single string is still a real answer; balanced braces are counted with string quoting respected,
/// so a `}` inside a title does not end an object early.
pub fn extract_json(text: &str) -> Option<Value> {
    let bytes = text.as_bytes();
    let mut start = None;
    let mut opener = b'{';
    let mut closer = b'}';
    let mut depth = 0i64;
    let mut in_string = false;
    let mut escaped = false;
    for (index, &byte) in bytes.iter().enumerate() {
        let character = byte as char;
        match start {
            None => {
                if character == '{' || character == '[' {
                    start = Some(index);
                    opener = byte;
                    closer = if character == '{' { b'}' } else { b']' };
                    depth = 1;
                }
            }
            Some(from) => {
                if in_string {
                    if escaped {
                        escaped = false;
                    } else if character == '\\' {
                        escaped = true;
                    } else if character == '"' {
                        in_string = false;
                    }
                    continue;
                }
                match character {
                    '"' => in_string = true,
                    '{' if opener == b'{' => depth += 1,
                    '[' if opener == b'[' => depth += 1,
                    _ if byte == closer => {
                        depth -= 1;
                        if depth == 0 {
                            return serde_json::from_str(&text[from..=index]).ok();
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    None
}
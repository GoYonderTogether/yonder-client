//! Browser control on the device: the five `browser.*` operations executed through Tencent's
//! BrowserSkill CLI (`bsk`), plus the four-state check the connector page reads.
//!
//! The device never speaks BrowserSkill's WebSocket, and never starts a second daemon: `bsk` owns
//! both, and the person's own daemon plus their Chrome or Edge extension are what the Bot drives
//! (specs/connectors/browser.md §1, §2). This module only runs the CLI's ``--json`` subcommands under
//! a deadline, shapes their answers into the connector's result kinds, and decides what "installed,
//! daemon running, connected" mean.
//!
//! State, in the four the spec names:
//!
//! * `bsk` not on PATH → `installed: false`, and the hint says to install it.
//! * `bsk` there but `~/.bsk/daemon.json` absent or its pid not alive → `daemonRunning: false`, hint
//!   says to open Yonder (or press install) and let it start the daemon.
//! * daemon up, no extension attached → `connected: false`, hint says to install or open the extension.
//! * extension attached → `connected: true`, and the Bot may proceed.
//!
//! `BSK_AUTO_UPDATE=off` is on every child (see [`crate::browser_bsk`]); the daemon is reused, not
//! replaced, and `bsk daemon start` runs only when nothing is listening.

use crate::browser_bsk::{Bsk, BskError};
use crate::browser_limits as limits;
use crate::browser_ops::{act, clean, navigate, observe, session, strings};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;

/// The parts of a real device a caller needs; tests supply their own so nothing shells out to a CLI
/// that may not be installed.
pub struct Device {
    pub bsk: Bsk,
    /// The daemon's discovery file; `$BSK_HOME/daemon.json`, i.e. `~/.bsk/daemon.json` by default.
    pub daemon_file: PathBuf,
    /// Whether a pid is alive right now.
    pub alive: Arc<dyn Fn(u32) -> bool + Send + Sync>,
}

impl Device {
    /// This device: the real `bsk`, the real `~/.bsk`, and the OS's own notion of a live pid.
    pub fn local() -> Device {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .map(PathBuf::from)
            .unwrap_or_default();
        Device {
            bsk: Bsk::device(),
            daemon_file: home.join(".bsk").join("daemon.json"),
            alive: Arc::new(pid_alive),
        }
    }

    fn installed(&self) -> bool {
        self.bsk.installed()
    }

    /// The daemon's pid from its discovery file, if the file exists and names one.
    fn daemon_pid(&self) -> Option<u32> {
        let bytes = std::fs::read(&self.daemon_file).ok()?;
        let value: Value = serde_json::from_slice(&bytes).ok()?;
        value.get("pid").and_then(Value::as_u64).and_then(|pid| u32::try_from(pid).ok())
    }

    /// Whether the daemon is up: a discovery file that names a live pid. The file is written on
    /// start and removed on stop, so its presence is the daemon's own claim; the pid check catches a
    /// file a crash left behind.
    fn daemon_running(&self) -> bool {
        self.daemon_pid().is_some_and(|pid| (self.alive)(pid))
    }

    /// Attached browsers, one entry per connected extension. An empty list means the daemon is up
    /// but no Chrome or Edge window has the extension attached.
    fn browsers(&self) -> Result<Vec<Value>, BskError> {
        let args = strings(&["--json", "browsers"]);
        let value = self.bsk.json(&args, limits::STATUS_TIMEOUT)?;
        // `bsk --json browsers` prints the array itself on 0.3.x; a newer daemon may wrap it in an
        // object, so both shapes are read.
        Ok(value.as_array().cloned().unwrap_or_default())
    }

    /// Start the daemon if — and only if — none is listening. The child is `bsk daemon start`, which
    /// spawns its own detached daemon and returns once it is ready; ours is reaped as soon as it
    /// answers. The daemon it installs is the person's own and outlives this call.
    fn ensure_daemon(&self) -> Result<(), BskError> {
        if self.daemon_running() {
            return Ok(());
        }
        let args = strings(&["daemon", "start"]);
        self.bsk.run(&args, limits::DAEMON_START_TIMEOUT)
    }
}

/// The five browser operations, dispatched on `operation`.
pub fn execute(device: &Device, operation: &str, args: &Value) -> Result<Value, &'static str> {
    // `browser_status` exists to report `installed: false`; every other operation can do nothing
    // without `bsk`, which is the state the model is told rather than a generic failure.
    if operation == "browser_status" {
        return status(device).map_err(keep);
    }
    if !device.installed() {
        return Err("browser_not_installed");
    }
    // Reuse the person's daemon; start it only when nothing is listening (specs/connectors/browser.md
    // §2). A start here is the same daemon every other bsk client on this device uses.
    device.ensure_daemon().map_err(keep)?;
    match operation {
        "browser_session" => session(device, args).map_err(keep),
        "browser_navigate" => navigate(device, args).map_err(keep),
        "browser_observe" => observe(device, args).map_err(keep),
        "browser_act" => act(device, args).map_err(keep),
        _ => Err("permission_denied"),
    }
}

/// Map a bsk failure onto the connector's codes, keeping the ones the model acts on.
fn keep(error: BskError) -> &'static str {
    match error {
        BskError::NotInstalled => "browser_not_installed",
        BskError::Disconnected => "browser_disconnected",
        BskError::DaemonUnavailable | BskError::TimedOut | BskError::SessionNotFound => {
            "browser_session_not_found"
        }
        BskError::Unreadable | BskError::Failed => "operation_failed",
    }
}

/// The four-state check: what is installed, what is running, what is attached, and the one line the
/// owner should read next.
fn status(device: &Device) -> Result<Value, BskError> {
    if !device.installed() {
        return Ok(json!({
            "kind": "browser_status",
            "installed": false,
            "daemonRunning": false,
            "connected": false,
            "browsers": [],
            "hint": HINT_INSTALL,
        }));
    }
    if !device.daemon_running() {
        return Ok(json!({
            "kind": "browser_status",
            "installed": true,
            "daemonRunning": false,
            "connected": false,
            "browsers": [],
            "hint": HINT_NO_DAEMON,
        }));
    }
    let attached = device.browsers()?;
    let browsers: Vec<Value> = attached.iter().map(browser_summary).collect();
    let connected = !browsers.is_empty();
    Ok(json!({
        "kind": "browser_status",
        "installed": true,
        "daemonRunning": true,
        "connected": connected,
        "browsers": browsers,
        "hint": if connected { HINT_CONNECTED } else { HINT_NO_EXTENSION },
    }))
}

/// One attached browser, as the protocol reports it. bsk's `browsers` list names the browser and its
/// version but not how many extensions its profile holds; that count is reported as 0 rather than a
/// number the device would have to guess.
fn browser_summary(row: &Value) -> Value {
    let name = row.get("browser_name").and_then(Value::as_str).unwrap_or("chrome");
    let version = row.get("browser_version").and_then(Value::as_str).unwrap_or("");
    json!({
        "name": clean(name, 64),
        "version": clean(version, 64),
        "extensions": 0,
    })
}

const HINT_INSTALL: &str = "点卡片上的「安装浏览器控制」装好 bsk，再在 Chrome 或 Edge 里装上 BrowserSkill 扩展。";
const HINT_NO_DAEMON: &str = "bsk 已装好，后台服务没有运行。点卡片上的「安装浏览器控制」或在终端运行 bsk daemon start 启动它。";
const HINT_NO_EXTENSION: &str = "后台服务已在运行，但还没有浏览器连上。请在 Chrome 或 Edge 里安装并启用 BrowserSkill 扩展。";
const HINT_CONNECTED: &str = "浏览器已连上，Bot 可以在你的浏览器里打开页面、点击和输入。";


/// Whether a pid is alive right now. Unix: signal 0; Windows: `OpenProcess`.
#[cfg(unix)]
fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

#[cfg(windows)]
fn pid_alive(pid: u32) -> bool {
    crate::browser_windows::alive(pid)
}

impl Device {
    /// For the connector page's install entry and tests: whether `bsk` is on this device.
    #[allow(dead_code)]
    pub fn has_bsk(&self) -> bool {
        self.installed()
    }
}

/// The install script a device runs, given its platform. macOS and Linux get the shell script;
/// Windows gets the PowerShell one. Both are Tencent's own (specs/connectors/browser.md §2).
pub fn install_command(platform: &str) -> Option<(&'static str, Vec<String>)> {
    match platform {
        "macos" | "linux" => Some((
            "sh",
            vec![
                "-c".into(),
                "curl -fsSL https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.sh | sh".into(),
            ],
        )),
        "windows" => Some((
            "powershell",
            vec![
                "-NoProfile".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-Command".into(),
                "irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex".into(),
            ],
        )),
        _ => None,
    }
}

#[cfg(test)]
#[path = "browser_test.rs"]
mod tests;

#[cfg(test)]
#[path = "browser_argv_test.rs"]
mod argv_tests;
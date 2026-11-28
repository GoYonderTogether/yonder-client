//! Administrator execution on the device: one command, approved at this computer by the owner
//! (supplement §2). The model only supplies `elevated: true` and a one-sentence `justification`;
//! everything the owner sees is the operating system's own prompt, so Yonder never stores, handles or
//! sees a password.
//!
//! Each platform raises its own prompt and the mapping onto the terminal's error codes lives here:
//!
//! * macOS runs the command through `osascript … do shell script … with administrator privileges`. The
//!   owner types a password or uses Touch ID, and the prompt carries the `justification` as its reason.
//! * Windows runs it through `ShellExecuteExW` with the `runas` verb (UAC), see [`windows`].
//!
//! The launch is abstracted behind one struct so a test can swap the real prompt for a fake and never
//! open a dialog: [`set_test_elevator`]. The real elevator is the one the runner uses by default.
//!
//! Every launch writes what an elevated command needs next to its log, and the runner polls those:
//!
//! * `output.log` / `output.exit` — the same files the ordinary runner uses (output and exit code).
//! * `elevated.marker` — written **by the elevated process itself** as its first action. It is the only
//!   proof the owner approved, because the launcher cannot tell "approved" from "still waiting to be
//!   approved": `osascript` blocks in `do shell script … with administrator privileges` until the
//!   owner answers. The runner waits at most [`SHELL_ELEVATION_PROMPT_MS`] for this marker, then reports
//!   `elevation_timeout` and ends the launcher, which cancels the pending prompt.
//! * `elevated.pid` — the elevated command's own pid, written before it runs the real command. `kill`
//!   reads it to end that exact tree, not just the launcher that has already exited. macOS also writes
//!   `elevated.group`, the command's own process group, and watches `elevation.kill`: the unprivileged
//!   client may not signal a root process, but it may write a file, and the privileged wrapper turns
//!   that marker into the group kill from where the privilege lives.
//!
//! The command is never re-quoted into a shell word or an AppleScript string: it is written to a file
//! (`command.sh` / `command.ps1`) and run by path, so the bytes the model wrote are the bytes that run.

use crate::local_files_text::now_ms;
use crate::shell_limits::{SHELL_ELEVATION_PROMPT_MS, SHELL_JUSTIFICATION_CHARS};
use crate::shell_process::Running;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

/// The result of trying to raise the administrator prompt.
pub enum Outcome {
    /// The prompt was answered and the command is now running.
    Started(Running),
    /// The owner refused the prompt.
    Denied,
    /// The prompt went unanswered past the limit.
    Timeout,
    /// This device cannot raise an administrator prompt at all.
    Unavailable,
}

/// Raise the administrator prompt for one already-authorized, already-bounded command and, on
/// approval, take ownership of the running process. Implementations must not retry or fall back to an
/// unprivileged run: a refusal is `Denied`, never quietly downgraded.
pub trait Elevate: Send + Sync {
    fn elevate(&self, request: &Request<'_>) -> Outcome;
}

/// Everything an elevator needs to start one command, all within the job directory the runner made.
pub struct Request<'a> {
    pub job_dir: &'a Path,
    pub command: &'a str,
    pub cwd: &'a Path,
    /// The reason shown in the system prompt (the model's `justification`).
    pub justification: &'a str,
}

impl Request<'_> {
    pub fn log(&self) -> std::path::PathBuf {
        self.job_dir.join("output.log")
    }
    pub fn exit(&self) -> std::path::PathBuf {
        self.job_dir.join("output.exit")
    }
    pub fn marker(&self) -> std::path::PathBuf {
        self.job_dir.join("elevated.marker")
    }
    pub fn pid_file(&self) -> std::path::PathBuf {
        self.job_dir.join("elevated.pid")
    }
}

/// The `elevated` / `justification` pair from a `shell` call, validated before any prompt so a
/// hand-built command that bypassed the server is still refused on the device. Returns whether the
/// call is elevated. Mirrors the server's `elevationInput` byte for byte (terminal.md §4.1):
///
/// * `elevated` present must be a real boolean; `elevated: true` needs a non-empty `justification` of
///   at most [`SHELL_JUSTIFICATION_CHARS`] characters with no NUL byte;
/// * `elevated` absent or false must not carry a `justification` at all.
pub fn args(args: &Value) -> Result<bool, &'static str> {
    let elevated = match args.get("elevated") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(_) => return Err("path_invalid"),
    };
    let justification = match args.get("justification") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(value.as_str()),
        Some(_) => return Err("path_invalid"),
    };
    if !elevated {
        if justification.is_some() {
            return Err("path_invalid");
        }
        return Ok(false);
    }
    let Some(text) = justification else {
        return Err("path_invalid");
    };
    if text.trim().is_empty()
        || text.chars().count() > SHELL_JUSTIFICATION_CHARS
        || text.contains('\0')
    {
        return Err("path_invalid");
    }
    Ok(true)
}

/// The default elevator: the operating system's own administrator prompt.
pub fn default_elevator() -> Arc<dyn Elevate> {
    #[cfg(target_os = "macos")]
    {
        Arc::new(MacElevate)
    }
    #[cfg(windows)]
    {
        Arc::new(WindowsElevate)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Arc::new(UnsupportedElevate)
    }
}

/// Test seam: how the runner gets its elevator. Real code never installs one; a test swaps in a fake
/// with [`set_test_elevator`] so no system dialog is ever opened, then clears it.
#[cfg(test)]
static TEST_ELEVATOR: std::sync::Mutex<Option<Arc<dyn Elevate>>> = std::sync::Mutex::new(None);

#[cfg(test)]
pub fn set_test_elevator(elevator: Option<Arc<dyn Elevate>>) {
    *TEST_ELEVATOR
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = elevator;
}

fn elevator() -> Arc<dyn Elevate> {
    #[cfg(test)]
    if let Some(elevator) = TEST_ELEVATOR
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone()
    {
        return elevator;
    }
    default_elevator()
}

/// Start one elevated command. The command's bytes and working directory are checked by the caller,
/// exactly as for an ordinary command; this only raises the prompt and takes the process.
pub fn launch(request: &Request<'_>) -> Outcome {
    elevator().elevate(request)
}

/// The elevated command's own pid, read from `elevated.pid` (written by the command's shell before it
/// runs the real command). `None` when the record does not exist yet, was never elevated, or does not
/// apply (Windows tracks the `cmd.exe` pid directly, so it writes no pid file).
pub fn recorded_pid(job_dir: &Path) -> Option<u32> {
    std::fs::read_to_string(job_dir.join("elevated.pid"))
        .ok()
        .and_then(|text| text.trim().parse().ok())
}

/// The command's process-group id, read from `elevated.group` (the macOS wrapper gives the command its
/// own group with `set -m`, so this group reaches the command's descendants). Windows has no such file.
pub fn recorded_group(job_dir: &Path) -> Option<u32> {
    std::fs::read_to_string(job_dir.join("elevated.group"))
        .ok()
        .and_then(|text| text.trim().parse().ok())
}

/// A platform with no administrator prompt in this build.
#[cfg(not(any(target_os = "macos", windows)))]
struct UnsupportedElevate;

#[cfg(not(any(target_os = "macos", windows)))]
impl Elevate for UnsupportedElevate {
    fn elevate(&self, _request: &Request<'_>) -> Outcome {
        Outcome::Unavailable
    }
}

// ---------------------------------------------------------------------------------------------------
// macOS: `osascript … with administrator privileges`
// ---------------------------------------------------------------------------------------------------
/// The privileged wrapper `osascript` runs. Split out so a test can generate the exact bytes and run
/// them as `/bin/sh` (unprivileged, no dialog), proving what the real flow depends on: the command's
/// output goes to `output.log` while it runs, the exit code lands in `output.exit`, and
/// `elevation.kill` ends the whole group.
///
/// `set -m` gives the command its own process group; the recorded group is what `kill` reaches. The
/// watcher subshell turns the client's kill *file* into a group kill *here*, where the privilege is:
/// the unprivileged client may not signal a root process, but it may write a file beside its log.
#[cfg(target_os = "macos")]
fn wrapper_body(request: &Request<'_>) -> String {
    let log = request.log();
    let group = request.job_dir.join("elevated.group");
    let kill_marker = request.job_dir.join("elevation.kill");
    format!(
        "umask 022\n\
         cd {cwd} || exit 1\n\
         printf '%s' $$ > {pid}\n\
         touch {marker}\n\
         set -m\n\
         {{ {shell} {script}\n}} >> {log} 2>&1 &\n\
         child=$!\n\
         printf '%s' \"$child\" > {group}\n\
         (\n\
         \twhile [ ! -e {kill} ]; do sleep 0.2; done\n\
         \tkill -KILL -\"$child\" 2>/dev/null\n\
         \tkill -KILL \"$child\" 2>/dev/null\n\
         ) &\n\
         watcher=$!\n\
         wait \"$child\"\n\
         code=$?\n\
         kill -KILL \"$watcher\" 2>/dev/null\n\
         printf '%s' \"$code\" > {exit}\n\
         exit \"$code\"\n",
        cwd = sh_quote(request.cwd.to_string_lossy()),
        pid = sh_quote(request.pid_file().to_string_lossy()),
        marker = sh_quote(request.marker().to_string_lossy()),
        shell = sh_quote(crate::shell_process::default_shell()),
        script = sh_quote(request.job_dir.join("command.sh").to_string_lossy()),
        log = sh_quote(log.to_string_lossy()),
        group = sh_quote(group.to_string_lossy()),
        kill = sh_quote(kill_marker.to_string_lossy()),
        exit = sh_quote(request.exit().to_string_lossy()),
    )
}

#[cfg(target_os = "macos")]
struct MacElevate;

#[cfg(target_os = "macos")]
impl Elevate for MacElevate {
    fn elevate(&self, request: &Request<'_>) -> Outcome {
        // The elevated /bin/sh records its own pid, marks approval, runs the command from its file in
        // the requested directory **with both streams appended to the job's log**, and records the exit
        // code — the same `output.log` / `output.exit` contract the ordinary wrapper uses.
        //
        // The redirection is not optional: `do shell script` captures the wrapper's stdout and returns
        // it to `osascript` as the AppleScript result, which this client discards. Without `>>` the
        // command's output would never reach the log at all, so `shell` would return empty output and
        // `shell_job log` would have nothing to page. `>/dev/null 2>&1` on the `do shell script` call in
        // [`Self::script`] closes the remaining door: the wrapper's own noise also stays out.
        //
        // The command runs in the background with a group of its own (`set -m`) and the wrapper waits for
        // it, so the log grows while it runs rather than only at the end, and the recorded group reaches
        // its descendants.
        //
        // `kill` is the `elevation.kill` marker, not a signal: this is the privileged process, and the
        // unprivileged client may not signal it. A watcher subshell turns the marker into a group kill
        // from here, where the privilege lives; `wait` returns at once when the command ends, so a
        // one-second command is noticed immediately and a long one costs no spinning. The client's own
        // `kill_pid` is the fallback for a wrapper that died before its watcher could act.
        let body = wrapper_body(request);
        let wrapper = request.job_dir.join("elevated.sh");
        // The command is written verbatim; it is run by path, never spliced into a shell word.
        if std::fs::write(request.job_dir.join("command.sh"), request.command).is_err()
            || std::fs::write(&wrapper, body).is_err()
        {
            return Outcome::Unavailable;
        }

        // The command's output is the file's; the wrapper must print nothing into the AppleScript
        // result, which is discarded anyway. `</dev/null` keeps a command that reads stdin from
        // hanging on the terminal-less session.
        let script = format!(
            "do shell script \"/bin/sh {wrapper} >/dev/null 2>&1 </dev/null\" with administrator privileges with prompt \"{prompt}\"",
            wrapper = escape_apple(&sh_quote(wrapper.to_string_lossy())),
            prompt = escape_apple(&prompt_text(request)),
        );
        let Ok(mut child) = spawn_osascript(&script, &request.log()) else {
            return Outcome::Unavailable;
        };
        match wait_for_marker(request, &mut child) {
            Marker::Present => Outcome::Started(Running::Child(child)),
            // Before the marker: a finished agent was refused; a still-running one timed out.
            Marker::ExitedWithout => Outcome::Denied,
            Marker::Deadline => {
                crate::shell_process::kill_tree(&mut child);
                let _ = child.wait();
                Outcome::Timeout
            }
        }
    }
}

/// The reason the owner reads in the macOS prompt. Short and concrete: it names the machine.
#[cfg(target_os = "macos")]
fn prompt_text(request: &Request<'_>) -> String {
    format!(
        "Yonder 需要管理员权限在这台电脑上运行命令：{}",
        request.justification
    )
}

/// A single-quoted POSIX shell word, with any embedded `'` written as `'\''`. Also used to quote the
/// shell program name (a plain string), so it takes `&str`.
#[cfg(target_os = "macos")]
fn sh_quote(value: impl AsRef<str>) -> String {
    format!("'{}'", value.as_ref().replace('\'', "'\\''"))
}

/// An AppleScript string literal: `\` and `"` are escaped. Applied after [`sh_quote`], so the
/// backslashes it introduced survive AppleScript's own parsing.
#[cfg(target_os = "macos")]
fn escape_apple(text: &str) -> String {
    text.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Run `osascript -` (the script on stdin, so no part of it is a shell word) in its own process group.
#[cfg(target_os = "macos")]
fn spawn_osascript(script: &str, log: &Path) -> std::io::Result<std::process::Child> {
    use std::io::Write;
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log)?;
    let errors = output.try_clone()?;
    let mut child = {
        let mut command = Command::new("osascript");
        command
            .arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::from(output))
            .stderr(Stdio::from(errors))
            // A new group whose id is the pid: `kill(-pid)` reaches the security agent and the command.
            .process_group(0);
        command.spawn()?
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(script.as_bytes());
        // Dropping stdin closes the pipe: `osascript -` reads to EOF before it runs.
    }
    Ok(child)
}

/// What waiting for the marker found.
#[cfg(target_os = "macos")]
enum Marker {
    Present,
    ExitedWithout,
    Deadline,
}

/// Wait for `elevated.marker` up to [`SHELL_ELEVATION_PROMPT_MS`], also watching the launcher: if it
/// exits before marking, the owner refused (or `osascript` failed).
#[cfg(target_os = "macos")]
fn wait_for_marker(request: &Request<'_>, child: &mut std::process::Child) -> Marker {
    let marker = request.marker();
    let until = now_ms() + SHELL_ELEVATION_PROMPT_MS;
    loop {
        if marker.exists() {
            return Marker::Present;
        }
        if matches!(child.try_wait(), Ok(Some(_))) {
            // The agent finished before the marker landed; re-check in case it was the same instant.
            return if marker.exists() {
                Marker::Present
            } else {
                Marker::ExitedWithout
            };
        }
        if now_ms() >= until {
            return Marker::Deadline;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

// ---------------------------------------------------------------------------------------------------
// Windows: `ShellExecuteExW` with the `runas` verb
// ---------------------------------------------------------------------------------------------------
#[cfg(windows)]
struct WindowsElevate;

#[cfg(windows)]
impl Elevate for WindowsElevate {
    fn elevate(&self, request: &Request<'_>) -> Outcome {
        // The elevated wrapper writes `elevated.marker` after UAC succeeds. `ShellExecuteExW` already
        // blocks until UAC is answered, so the wait below is normally immediate; it exists so a
        // wrapper that never marks itself is reported as a timeout rather than an id-less success.
        match crate::shell_elevation_windows::start(
            request.job_dir,
            request.command,
            &request.log(),
            &request.exit(),
            request.cwd,
        ) {
            Ok(pid) => {
                let token = crate::shell_process::start_token(pid);
                if !wait_for_win_marker(request, pid, &token) {
                    return Outcome::Timeout;
                }
                Outcome::Started(Running::Pid { pid, token })
            }
            Err(crate::shell_elevation_windows::Failure::Denied) => Outcome::Denied,
            Err(crate::shell_elevation_windows::Failure::Unavailable) => Outcome::Unavailable,
        }
    }
}

#[cfg(windows)]
fn wait_for_win_marker(request: &Request<'_>, pid: u32, token: &str) -> bool {
    let marker = request.marker();
    let until = now_ms() + SHELL_ELEVATION_PROMPT_MS;
    loop {
        if marker.exists() {
            return true;
        }
        if !crate::shell_process::alive(pid, token) {
            return marker.exists();
        }
        if now_ms() >= until {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
#[path = "shell_elevation_test.rs"]
mod tests;

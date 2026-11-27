//! `computer_shell` and `computer_shell_job` on the device (TOOLS-V3 §4 and §9).
//!
//! The runner owns every job this client started. A `shell` call spawns the command's wrapper in its
//! own process group and waits at most [`SHELL_FOREGROUND_MS`]; if the process is still there, the
//! call returns `status: "running"` with the job id and the output so far, and the process keeps
//! running — the tool call ending does not end it. `shell_job` then lists, inspects, pages the log of,
//! waits for, writes to, or kills that job.
//!
//! Nothing here sends the completion event itself: the background watcher does, through the callback
//! the app registers, so one finished job notifies the Bot exactly once whether the client is in the
//! foreground, in the tray, or just back from a restart.
//!
//! Authorization lives in `local_files.rs`, not here: this module is reached only after the device has
//! checked that the connection is `computer-control`, carries `terminal: true`, is the current
//! account/device/session, and has not expired.

use crate::shell_jobs::{Job, JobStatus, Jobs};
use crate::shell_limits::{
    SHELL_COMMAND_BYTES, SHELL_FOREGROUND_MS, SHELL_MAX_RUNNING, SHELL_TIMEOUT_MAX_MS,
    SHELL_WORKDIR_BYTES,
};
use crate::shell_output;
use crate::shell_process;
use crate::local_files_text::now_ms;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// One job that has a live child handle in this process.
///
/// The child sits behind its own lock so a foreground `shell` waiting out its 15 seconds does not
/// hold the runner's state: a `shell_job` call for another job, or a cancel, must not wait behind it.
/// Lock order is always state → child, never the other way.
pub struct Live {
    pub child: Mutex<Child>,
    /// A hard timeout the caller asked for; the job is killed when it passes.
    pub deadline: Option<u64>,
}

/// Everything the runner keeps between calls: the records (with the file they persist to), the
/// root their directories live in, and the live children. One per app process.
pub struct Runner {
    pub state: Mutex<State>,
    pub jobs_file: PathBuf,
    pub jobs_root: PathBuf,
}

pub struct State {
    pub jobs: Jobs,
    pub live: std::collections::HashMap<String, Live>,
    /// Command id → job id, so a cancel that arrives after the command already answered `running`
    /// still reaches the process. Kept for the job's lifetime; bounded by the same retention.
    pub commands: std::collections::HashMap<String, String>,
}

impl Runner {
    pub fn new(jobs_file: PathBuf, jobs_root: PathBuf) -> Runner {
        Runner {
            state: Mutex::new(State {
                jobs: Jobs::default(),
                live: std::collections::HashMap::new(),
                commands: std::collections::HashMap::new(),
            }),
            jobs_file,
            jobs_root,
        }
    }
}

/// A new job id: time-ordered so `list` shows recent work first without a second sort field.
fn new_id(now: u64) -> String {
    let salt = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("job-{:x}-{:04x}", now, salt % 0x10000)
}

fn flag(args: &Value, key: &str) -> Result<bool, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err("path_invalid"),
    }
}

fn string<'a>(args: &'a Value, key: &str) -> Result<Option<&'a str>, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.as_str())),
        Some(_) => Err("path_invalid"),
    }
}

/// The tool description says the working directory must be absolute; an absent one is the user's
/// home, which is where a person's own terminal opens.
fn workdir(args: &Value) -> Result<PathBuf, &'static str> {
    let Some(raw) = string(args, "workdir")? else {
        return crate::local_files_operations::home();
    };
    if raw.len() > SHELL_WORKDIR_BYTES || raw.contains('\0') {
        return Err("path_invalid");
    }
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err("path_invalid");
    }
    if !path.is_dir() {
        return Err("not_found");
    }
    path.canonicalize().map_err(|_| "not_found")
}

/// Whether a background watcher should send the completion event for this job.
pub type Notify = Arc<dyn Fn(&Job) -> bool + Send + Sync>;

/// The job directory under the runner's root; one per job, holding the log and the `.exit` file.
fn job_dir(root: &Path, id: &str) -> PathBuf {
    root.join(id)
}

fn finished_status(job: &mut Job, exit: Option<i64>) {
    job.exit_code = exit;
}

/// Spawn the wrapper, record the job, and hand back the record.
///
/// The record is written after the process starts, because the pid and its start token do not exist
/// before then. A crash between the two makes an unrecorded process: it is not in `jobs.json`, so a
/// later `list` never shows it and the user still sees it in their system, which is what any terminal
/// does when its client dies. The order keeps the more damaging failure — a record with no process —
/// impossible.
#[allow(clippy::too_many_arguments)]
pub fn start(
    runner: &Runner,
    connection_id: &str,
    command_id: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let command = string(args, "command")?.ok_or("path_invalid")?;
    if command.is_empty() || command.len() > SHELL_COMMAND_BYTES || command.contains('\0') {
        return Err("path_invalid");
    }
    let cwd = workdir(args)?;
    let background = flag(args, "background")?;
    let notify = match args.get("notify") {
        // Notifying is the default: the Bot asked for the work and a silent completion is a lost one.
        None | Some(Value::Null) => true,
        Some(Value::Bool(value)) => *value,
        Some(_) => return Err("path_invalid"),
    };
    let stdin = flag(args, "stdin")?;
    let timeout = match args.get("timeoutMs") {
        None | Some(Value::Null) => None,
        Some(value) => match value.as_u64() {
            Some(ms) if ms >= 1 => Some(ms.min(SHELL_TIMEOUT_MAX_MS)),
            _ => return Err("path_invalid"),
        },
    };

    let mut state = runner
        .state
        .lock()
        .map_err(|_| "operation_failed")?;
    if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
        return Err("cancelled");
    }
    if state.jobs.running() >= SHELL_MAX_RUNNING {
        return Err("operation_failed");
    }
    let now = now_ms();
    let id = new_id(now);
    let dir = job_dir(&runner.jobs_root, &id);
    std::fs::create_dir_all(&dir).map_err(|_| "operation_failed")?;
    let log = dir.join("output.log");
    let exit_path = dir.join("output.exit");
    let launch = shell_process::launch(&dir, command, &shell_process::default_shell(), &exit_path)
        .map_err(|_| "operation_failed")?;
    let child =
        shell_process::spawn(&launch, &cwd, &log, stdin).map_err(|_| "operation_failed")?;
    let pid = child.id();
    let token = shell_process::start_token(pid);
    let deadline = timeout.map(|ms| now + ms);
    state.live.insert(
        id.clone(),
        Live {
            child: Mutex::new(child),
            deadline,
        },
    );
    state.commands.insert(command_id.to_owned(), id.clone());
    let job = Job {
        id: id.clone(),
        command: command.to_owned(),
        workdir: cwd,
        started_ms: now,
        pid,
        start_token: token,
        log_path: log.clone(),
        notify,
        notified: false,
        status: JobStatus::Running,
        exit_code: None,
        stdin,
        connection_id: connection_id.to_owned(),
    };
    state.jobs.items.push(job);
    if let Err(error) = state.jobs.save(&runner.jobs_file) {
        // The process is already running: report the job, keep the record in memory, and let the
        // next save retry rather than kill work the user asked for.
        let _ = error;
    }

    if background {
        let (output, truncated) = shell_output::bounded(&log);
        return Ok(json!({
            "kind": "shell", "status": "running", "jobId": id,
            "output": output, "truncated": truncated,
            "outputPath": log.to_string_lossy(),
        }));
    }

    // Foreground: wait up to the window. The state lock is released between checks so another
    // command's `shell_job`, or a cancel for this one, never waits behind a command that is slow.
    drop(state);
    let until = now + SHELL_FOREGROUND_MS;
    loop {
        let mut state = runner.state.lock().map_err(|_| "operation_failed")?;
        if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
            kill_live(&mut state, &id);
            let _ = state.jobs.save(&runner.jobs_file);
            return Err("cancelled");
        }
        let Some(live) = state.live.get(&id) else {
            // `shell_job kill` (or the round's cancel) ended this job while the foreground waited;
            // the command no longer has an outcome of its own to report.
            return Err("cancelled");
        };
        let timed_out = {
            let mut child = live.child.lock().map_err(|_| "operation_failed")?;
            match child.try_wait().map_err(|_| "operation_failed")? {
                Some(status) => Some(status.code()),
                None => {
                    if live.deadline.is_some_and(|at| now_ms() >= at) {
                        Some(None)
                    } else {
                        None
                    }
                }
            }
        };
        if let Some(code) = timed_out {
            let hit_deadline = state
                .live
                .get(&id)
                .is_some_and(|live| live.deadline.is_some_and(|at| now_ms() >= at));
            if hit_deadline {
                if let Some(live) = state.live.remove(&id) {
                    if let Ok(mut child) = live.child.lock() {
                        shell_process::kill_tree(&mut child);
                        let _ = child.wait();
                    }
                }
                if let Some(job) = state.jobs.get_mut(&id) {
                    job.status = JobStatus::Killed;
                    job.exit_code = None;
                }
                let _ = state.jobs.save(&runner.jobs_file);
                return Err("timeout");
            }
            state.live.remove(&id);
            let exit = code.map(i64::from).or_else(|| shell_output::exit_code(&exit_path));
            if let Some(job) = state.jobs.get_mut(&id) {
                job.status = JobStatus::Done;
                finished_status(job, exit);
            }
            let _ = state.jobs.save(&runner.jobs_file);
            let (output, truncated) = shell_output::bounded(&log);
            return Ok(json!({
                "kind": "shell", "status": "done", "exitCode": exit,
                "output": output, "truncated": truncated,
                "outputPath": log.to_string_lossy(),
            }));
        }
        if now_ms() >= until {
            break;
        }
        // Release before the pause: a sleep with the guard alive would hold the lock for most of
        // every interval, and other calls would queue behind the wait anyway.
        drop(state);
        std::thread::sleep(Duration::from_millis(50));
    }
    let (output, truncated) = shell_output::bounded(&log);
    Ok(json!({
        "kind": "shell", "status": "running", "jobId": id,
        "output": output, "truncated": truncated,
        "outputPath": log.to_string_lossy(),
    }))
}

/// Kill one live job tree and record it. Used by `kill`, by cancellation, and by the timeout path.
pub(crate) fn kill_live(state: &mut State, id: &str) -> bool {
    let Some(live) = state.live.remove(id) else {
        return false;
    };
    if let Ok(mut child) = live.child.lock() {
        shell_process::kill_tree(&mut child);
        let _ = child.wait();
    }
    if let Some(job) = state.jobs.get_mut(id) {
        job.status = JobStatus::Killed;
        job.exit_code = None;
    }
    true
}

#[cfg(test)]
#[path = "shell_runner_test.rs"]
mod tests;

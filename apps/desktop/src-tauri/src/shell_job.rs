//! `shell_job` and the job lifecycle: list/status/log/wait/write/kill, the watcher's completion
//! notice, and the restart check (TOOLS-V3 §4). `shell_runner.rs` owns spawning and the foreground
//! window; together they are the device side of `computer_shell` / `computer_shell_job`.

use crate::local_files_text::now_ms;
use crate::shell_jobs::{Job, JobStatus, Jobs};
use crate::shell_limits::{
    SHELL_EVENT_TAIL_BYTES, SHELL_EXIT_GRACE_MS, SHELL_MAX_FINISHED_JOBS, SHELL_STDIN_BYTES,
    SHELL_WAIT_MS,
};
use crate::shell_output;
use crate::shell_process;
use crate::shell_runner::{kill_live, Notify, Runner, State};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

fn string<'a>(args: &'a Value, key: &str) -> Result<Option<&'a str>, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.as_str())),
        Some(_) => Err("path_invalid"),
    }
}

fn flag(args: &Value, key: &str) -> Result<bool, &'static str> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err("path_invalid"),
    }
}

/// One `shell_job` call.
pub fn job(
    runner: &Runner,
    action: &str,
    args: &Value,
    cancelled: &AtomicBool,
    expires: u64,
) -> Result<Value, &'static str> {
    let requested = string(args, "jobId")?;
    let mut state = runner.state.lock().map_err(|_| "operation_failed")?;
    if cancelled.load(Ordering::SeqCst) || now_ms() >= expires {
        return Err("cancelled");
    }
    if action == "list" {
        let mut items: Vec<&Job> = state.jobs.items.iter().collect();
        items.sort_by_key(|job| std::cmp::Reverse(job.started_ms));
        let now = now_ms();
        let jobs = items
            .into_iter()
            .map(|job| {
                json!({
                    "jobId": job.id,
                    "name": job.name(),
                    "status": job.status.as_str(),
                    "elapsedMs": if job.status == JobStatus::Running { job.elapsed_ms(now) } else { 0 },
                    "exitCode": job.exit_code,
                    "logPath": job.log_path.to_string_lossy(),
                })
            })
            .collect::<Vec<_>>();
        return Ok(json!({"kind": "shell_job", "jobs": jobs}));
    }
    let id = state.jobs.find(requested.ok_or("path_invalid")?)?.id.clone();
    match action {
        "status" => {
            settle(&mut state, &id, &runner.jobs_file);
            let job = state.jobs.get(&id).ok_or("job_not_found")?;
            let (output, truncated) = shell_output::bounded(&job.log_path);
            Ok(json!({
                "kind": "shell_job",
                "output": output,
                "truncated": truncated,
                "running": job.status == JobStatus::Running,
                "exitCode": job.exit_code,
            }))
        }
        "log" => {
            let job = state.jobs.get(&id).ok_or("job_not_found")?;
            let offset = match args.get("offset") {
                None | Some(Value::Null) => 0,
                Some(value) => value.as_u64().ok_or("path_invalid")?,
            };
            let (output, offset, next, truncated) = shell_output::page(&job.log_path, offset)?;
            Ok(json!({
                "kind": "shell_job", "output": output,
                "offset": offset, "next": next, "truncated": truncated,
            }))
        }
        "wait" => {
            drop(state);
            wait(runner, &id, SHELL_WAIT_MS)
        }
        "write" => {
            let text = string(args, "text")?.unwrap_or("").as_bytes().to_vec();
            if text.len() > SHELL_STDIN_BYTES {
                return Err("too_large");
            }
            let eof = flag(args, "eof")?;
            let job = state.jobs.get(&id).ok_or("job_not_found")?;
            if !job.stdin {
                return Err("permission_denied");
            }
            let live = state.live.get(&id).ok_or("job_not_found")?;
            let mut child = live.child.lock().map_err(|_| "operation_failed")?;
            let Some(mut input) = child.stdin.take() else {
                return Err("job_lost");
            };
            use std::io::Write;
            let written = input
                .write_all(&text)
                .and_then(|_| input.flush())
                .map_err(|_| "operation_failed");
            if eof {
                // Closing the pipe is what ends a `read`; dropping the handle does that.
                drop(input);
            } else {
                child.stdin = Some(input);
            }
            drop(child);
            written?;
            let job = state.jobs.get(&id).ok_or("job_not_found")?;
            Ok(json!({
                "kind": "shell_job",
                "running": job.status == JobStatus::Running,
                "exitCode": job.exit_code,
            }))
        }
        "kill" => {
            let killed = kill_live(&mut state, &id);
            let _ = state.jobs.save(&runner.jobs_file);
            if !killed {
                // Taken over after a restart: the process is not ours to wait on, but the tree is
                // still killable by pid.
                let job = state.jobs.get_mut(&id).ok_or("job_not_found")?;
                if job.status == JobStatus::Running {
                    if shell_process::alive(job.pid, &job.start_token) {
                        shell_process::kill_pid(job.pid);
                        job.status = JobStatus::Killed;
                    } else if let Some(code) =
                        shell_output::exit_code(&job.log_path.with_extension("exit"))
                    {
                        job.status = JobStatus::Done;
                        job.exit_code = Some(code);
                    } else {
                        job.status = JobStatus::Lost;
                    }
                }
            }
            let job = state.jobs.get(&id).ok_or("job_not_found")?;
            Ok(json!({
                "kind": "shell_job",
                "running": false,
                "exitCode": job.exit_code,
            }))
        }
        _ => Err("path_invalid"),
    }
}

/// Bring one record up to date from the process: still running, exited with a code, or gone without
/// one. Also finishes the kill of a hard deadline that arrived while nobody was calling.
pub(crate) fn settle(state: &mut State, id: &str, jobs_file: &Path) {
    let exit_path = state
        .jobs
        .get(id)
        .map(|job| job.log_path.with_extension("exit"));
    let mut changed = false;
    if let Some(live) = state.live.get(id) {
        if live.deadline.is_some_and(|at| now_ms() >= at) {
            let live = state.live.remove(id).expect("checked above");
            if let Ok(mut child) = live.child.lock() {
                shell_process::kill_tree(&mut child);
                let _ = child.wait();
            }
            if let Some(job) = state.jobs.get_mut(id) {
                job.status = JobStatus::Killed;
                job.exit_code = None;
            }
            changed = true;
        } else {
            let exited = live
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok().flatten())
                .map(|status| status.code().map(i64::from));
            if let Some(code) = exited {
                state.live.remove(id);
                let exit = code.or_else(|| exit_path.as_deref().and_then(shell_output::exit_code));
                if let Some(job) = state.jobs.get_mut(id) {
                    job.status = JobStatus::Done;
                    job.exit_code = exit;
                }
                changed = true;
            }
        }
    } else if let Some(job) = state.jobs.get_mut(id) {
        if job.status == JobStatus::Running && !shell_process::alive(job.pid, &job.start_token) {
            let exit = exit_path.as_deref().and_then(shell_output::exit_code);
            job.exit_code = exit;
            job.status = if exit.is_some() {
                JobStatus::Done
            } else {
                JobStatus::Lost
            };
            changed = true;
        }
    }
    if changed {
        let _ = state.jobs.save(jobs_file);
    }
}

/// Wait up to `limit` for a job to finish, then report its state with the bounded output.
pub fn wait(runner: &Runner, id: &str, limit: u64) -> Result<Value, &'static str> {
    let until = now_ms() + limit;
    loop {
        {
            let mut state = runner.state.lock().map_err(|_| "operation_failed")?;
            settle(&mut state, id, &runner.jobs_file);
            let job = state.jobs.get(id).ok_or("job_not_found")?;
            if job.status.finished() || now_ms() >= until {
                let (output, truncated) = shell_output::bounded(&job.log_path);
                return Ok(json!({
                    "kind": "shell_job",
                    "output": output,
                    "truncated": truncated,
                    "running": job.status == JobStatus::Running,
                    "exitCode": job.exit_code,
                }));
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// End the tree a command left running after it answered `running`. The command id is what the
/// cancel names; the job it started is what has to die.
pub fn cancel(runner: &Runner, command_id: &str) -> bool {
    let Ok(mut state) = runner.state.lock() else {
        return false;
    };
    let Some(id) = state.commands.get(command_id).cloned() else {
        return false;
    };
    let killed = kill_live(&mut state, &id);
    if killed {
        let _ = state.jobs.save(&runner.jobs_file);
    }
    killed
}

/// What the background watcher does for every job whose notice is still owed: record the code,
/// mark it finished, persist, and hand it to the notifier once.
pub fn settle_all(runner: &Runner, notify: &Notify) {
    let Ok(mut state) = runner.state.lock() else {
        return;
    };
    let ids: Vec<String> = state
        .jobs
        .items
        .iter()
        // A running job may have just ended; a finished one may have been settled by `wait` or
        // `status` before this tick, and its notice is still owed (`notified` says so).
        .filter(|job| {
            job.status == JobStatus::Running || (job.status.finished() && job.notify && !job.notified)
        })
        .map(|job| job.id.clone())
        .collect();
    for id in ids {
        settle(&mut state, &id, &runner.jobs_file);
        let Some(job) = state.jobs.get(&id) else {
            continue;
        };
        if job.status.finished() && job.notify && !job.notified {
            let snapshot = job.clone();
            if notify(&snapshot) {
                if let Some(stored) = state.jobs.get_mut(&id) {
                    stored.notified = true;
                }
                let _ = state.jobs.save(&runner.jobs_file);
            }
        }
    }
    let root = runner.jobs_root.clone();
    if state.jobs.items.len() > SHELL_MAX_FINISHED_JOBS * 2 {
        let dropped = state.jobs.prune(SHELL_MAX_FINISHED_JOBS, &root);
        state.commands.retain(|_, job_id| !dropped.contains(job_id));
        let _ = state.jobs.save(&runner.jobs_file);
    }
}

/// On client start: read `jobs.json`, then for each record decide which of three states it is in.
///
/// * The process still exists with the same start token: re-adopt it. A child handle cannot span a
///   restart, so the record stays as it is and `kill` goes through `kill_pid`, which kills the group.
/// * The process is gone and the `.exit` file has a code: the job finished while the client was
///   closing or crashed; keep it `done` and let the watcher send the event.
/// * Neither: mark `lost` and notify, in those words — never pretend it succeeded.
///
/// Returns the number of adopted, finished and lost records, for the log line at start and for tests.
pub fn resume(runner: &Runner) -> (usize, usize, usize) {
    let mut state = match runner.state.lock() {
        Ok(state) => state,
        Err(poison) => poison.into_inner(),
    };
    state.jobs = Jobs::load(&runner.jobs_file);
    let mut adopted = 0;
    let mut finished = 0;
    let mut lost = 0;
    for job in &mut state.jobs.items {
        if job.status != JobStatus::Running {
            continue;
        }
        if shell_process::alive(job.pid, &job.start_token) {
            adopted += 1;
            continue;
        }
        // A wrapper that just wrote its exit code may need a moment to land it.
        let exit_path = job.log_path.with_extension("exit");
        let mut code = shell_output::exit_code(&exit_path);
        if code.is_none() {
            std::thread::sleep(Duration::from_millis(SHELL_EXIT_GRACE_MS));
            code = shell_output::exit_code(&exit_path);
        }
        match code {
            Some(code) => {
                job.status = JobStatus::Done;
                job.exit_code = Some(code);
                finished += 1;
            }
            None => {
                job.status = JobStatus::Lost;
                job.exit_code = None;
                lost += 1;
                // A lost job has no code left to report, but its death is still news.
                job.notified = false;
            }
        }
    }
    let _ = state.jobs.save(&runner.jobs_file);
    (adopted, finished, lost)
}

/// The event payload for one finished job, as the realtime wire carries it.
pub fn event(job: &Job) -> Value {
    let head: String = job.command.chars().take(80).collect();
    json!({
        "type": "shell.job.finished",
        "connectionId": job.connection_id,
        "jobId": job.id,
        "command": head,
        "status": match job.status {
            JobStatus::Done => "done",
            JobStatus::Killed => "killed",
            // A job the client lost is reported as lost, in the event's own vocabulary.
            _ => "lost",
        },
        "exitCode": job.exit_code,
        "elapsedMs": now_ms().saturating_sub(job.started_ms),
        "outputTail": shell_output::tail(&job.log_path, SHELL_EVENT_TAIL_BYTES),
    })
}

#[cfg(test)]
#[path = "shell_job_test.rs"]
mod tests;

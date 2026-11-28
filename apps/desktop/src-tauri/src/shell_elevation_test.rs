//! The elevation argument pair and the mapping from a launch outcome to the terminal's error codes,
//! exercised with a fake elevator so no test ever opens a system dialog (supplement §2).
//!
//! The pair checks (`elevated` without `justification`, `justification` without `elevated`) run before
//! any prompt, so they touch no global state. The outcome mapping installs a [`shell_elevation::
//! set_test_elevator`] fake and runs the cases one after another in a single test, because that seam is
//! process-global and parallel tests must not race on it.

use super::*;
use crate::shell_limits::SHELL_JUSTIFICATION_CHARS;
use crate::shell_process::{self, Running};
use crate::shell_test_support::{args as shell_args, run_shell, sandbox};
use serde_json::json;

#[test]
fn an_elevated_command_without_a_justification_is_refused_before_any_prompt() {
    let (runner, root) = sandbox("elevated-no-justification");
    assert_eq!(
        run_shell(&runner, "true", shell_args(json!({"elevated": true}))),
        Err("path_invalid")
    );
    // A blank justification is the same refusal.
    assert_eq!(
        run_shell(
            &runner,
            "true",
            shell_args(json!({"elevated": true, "justification": "   "}))
        ),
        Err("path_invalid")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_justification_without_elevated_is_refused() {
    let (runner, root) = sandbox("justification-no-elevated");
    // `elevated` absent.
    assert_eq!(
        run_shell(
            &runner,
            "true",
            shell_args(json!({"justification": "please"}))
        ),
        Err("path_invalid")
    );
    // `elevated: false` with a justification is still a refusal: a no is never dressed as a yes.
    assert_eq!(
        run_shell(
            &runner,
            "true",
            shell_args(json!({"elevated": false, "justification": "please"}))
        ),
        Err("path_invalid")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_pair_bounds_match_the_server() {
    // A 300-character justification is accepted (the function only checks the pair, not the prompt).
    let ok = "a".repeat(SHELL_JUSTIFICATION_CHARS);
    assert_eq!(
        args(&json!({"elevated": true, "justification": ok})),
        Ok(true)
    );
    // 301 is refused; so is a NUL byte; so is a non-boolean `elevated`.
    let too_long = "a".repeat(SHELL_JUSTIFICATION_CHARS + 1);
    assert_eq!(
        args(&json!({"elevated": true, "justification": too_long})),
        Err("path_invalid")
    );
    assert_eq!(
        args(&json!({"elevated": true, "justification": "a\0b"})),
        Err("path_invalid")
    );
    assert_eq!(args(&json!({"elevated": "yes"})), Err("path_invalid"));
    // An ordinary command is not elevated and takes no justification.
    assert_eq!(args(&json!({})), Ok(false));
    assert_eq!(args(&json!({"elevated": false})), Ok(false));
}

/// The outcome mapping and the job record. One test, because installing the fake is process-global.
#[test]
fn outcomes_map_to_error_codes_and_an_elevated_job_records_it() {
    let (runner, root) = sandbox("elevation-outcomes");

    // 1. The owner refused the prompt.
    set_test_elevator(Some(std::sync::Arc::new(Fake {
        kind: FakeKind::Deny,
    })));
    assert_eq!(
        run_shell(
            &runner,
            "rm -rf /",
            shell_args(json!({"elevated": true, "justification": "install into /usr/local?"})),
        ),
        Err("elevation_denied")
    );

    // 2. The prompt went unanswered.
    set_test_elevator(Some(std::sync::Arc::new(Fake {
        kind: FakeKind::Timeout,
    })));
    assert_eq!(
        run_shell(
            &runner,
            "rm -rf /",
            shell_args(json!({"elevated": true, "justification": "install into /usr/local?"})),
        ),
        Err("elevation_timeout")
    );

    // 3. `stdin` has no meaning for an elevated command and is refused, not silently dropped.
    assert_eq!(
        run_shell(
            &runner,
            "true",
            shell_args(json!({"elevated": true, "justification": "go?", "stdin": true})),
        ),
        Err("path_invalid")
    );

    // 4. Approved: the command runs and the job record says it was elevated, keeping the justification.
    set_test_elevator(Some(std::sync::Arc::new(Fake {
        kind: FakeKind::Run,
    })));
    let done = run_shell(
        &runner,
        "printf elevated-output",
        shell_args(json!({"elevated": true, "justification": "install into /usr/local?"})),
    )
    .unwrap();
    assert_eq!(done["status"], "done");
    assert!(done["output"].as_str().unwrap().contains("elevated-output"));

    let bytes = std::fs::read(&runner.jobs_file).unwrap();
    let jobs: Vec<serde_json::Value> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["elevated"], true);
    assert_eq!(jobs[0]["justification"], "install into /usr/local?");

    set_test_elevator(None);
    let _ = std::fs::remove_dir_all(root);
}

enum FakeKind {
    Deny,
    Timeout,
    Run,
}

struct Fake {
    kind: FakeKind,
}

impl Elevate for Fake {
    fn elevate(&self, request: &Request<'_>) -> Outcome {
        match self.kind {
            FakeKind::Deny => Outcome::Denied,
            FakeKind::Timeout => Outcome::Timeout,
            // Run the command exactly as the ordinary path would, so the job's log and `.exit` file are
            // real and the record the runner writes is honest.
            FakeKind::Run => {
                let launch = match shell_process::launch(
                    request.job_dir,
                    request.command,
                    &shell_process::default_shell(),
                    &request.exit(),
                ) {
                    Ok(launch) => launch,
                    Err(_) => return Outcome::Unavailable,
                };
                match shell_process::spawn(&launch, request.cwd, &request.log(), false) {
                    Ok(child) => Outcome::Started(Running::Child(child)),
                    Err(_) => Outcome::Unavailable,
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// The macOS wrapper, run by `/bin/sh`: the part a unit test can prove without a dialog.
// ---------------------------------------------------------------------------------------------------
#[cfg(target_os = "macos")]
fn run_wrapper(dir: &std::path::Path, command: &str) -> std::process::Command {
    std::fs::write(dir.join("command.sh"), command).unwrap();
    let request = Request {
        job_dir: dir,
        command,
        cwd: dir,
        justification: "install into /usr/local?",
    };
    let wrapper = dir.join("elevated.sh");
    std::fs::write(&wrapper, wrapper_body(&request)).unwrap();
    let mut runner = std::process::Command::new("/bin/sh");
    runner.arg(&wrapper);
    runner
}

#[test]
#[cfg(target_os = "macos")]
fn the_wrapper_streams_output_to_the_log_and_records_the_exit_code() {
    // The landed wrapper first ran the command without redirection, so `do shell script` swallowed its
    // output and the model got an empty `output`; this test holds the log contract the terminal needs.
    let dir = std::env::temp_dir().join(format!("yonder-wrap-output-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let status = run_wrapper(&dir, "printf 'one\\n'; printf 'err\\n' >&2; exit 5")
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(5));
    let log = std::fs::read_to_string(dir.join("output.log")).unwrap();
    assert!(log.contains("one"), "command stdout is in the log: {log:?}");
    assert!(log.contains("err"), "command stderr is in the log: {log:?}");
    assert_eq!(
        std::fs::read_to_string(dir.join("output.exit")).unwrap(),
        "5"
    );
    assert!(
        dir.join("elevated.marker").exists(),
        "approval marker is written"
    );
    assert!(
        dir.join("elevated.pid").exists(),
        "the command's pid is recorded"
    );
    let group: u32 = std::fs::read_to_string(dir.join("elevated.group"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert!(group > 1, "a process group is recorded for kill");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(target_os = "macos")]
fn the_wrapper_writes_the_log_while_the_command_runs() {
    // A long command must show output in `shell`'s 15 s foreground window, not only at the end.
    let dir = std::env::temp_dir().join(format!("yonder-wrap-live-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut child = run_wrapper(&dir, "printf first; sleep 3; printf second")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let mut seen = String::new();
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        seen = std::fs::read_to_string(dir.join("output.log")).unwrap_or_default();
        if seen.contains("first") {
            break;
        }
    }
    assert!(
        seen.contains("first"),
        "output is readable while the command runs: {seen:?}"
    );
    assert!(!seen.contains("second"), "the command has not finished yet");
    let _ = child.wait();
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(target_os = "macos")]
fn the_kill_marker_ends_the_command_and_its_children() {
    let dir = std::env::temp_dir().join(format!("yonder-wrap-kill-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut child = run_wrapper(&dir, "sleep 30 & sleep 30; printf never")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    // Wait for both the wrapper and the command to be up, then leave the marker the client writes.
    for _ in 0..50 {
        if dir.join("elevated.group").exists() && dir.join("elevated.marker").exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert!(dir.join("elevated.group").exists());
    std::fs::write(dir.join("elevation.kill"), b"").unwrap();
    let until = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while child.try_wait().unwrap().is_none() && std::time::Instant::now() < until {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let status = child.try_wait().unwrap();
    assert!(status.is_some(), "the wrapper ended after the kill marker");
    assert!(!std::fs::read_to_string(dir.join("output.log"))
        .unwrap_or_default()
        .contains("never"));
    // The command's own group is gone, which is what `kill` promises.
    if let Some(group) = recorded_group(&dir) {
        let alive = unsafe { libc::kill(group as i32, 0) } == 0;
        assert!(!alive, "the command group is gone");
    }
    let _ = std::fs::remove_dir_all(dir);
}

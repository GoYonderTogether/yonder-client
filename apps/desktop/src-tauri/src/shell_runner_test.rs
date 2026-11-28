//! The terminal runner's device-side behaviour, exercised against a real shell: the 15 s hand-off to
//! a background job, the bounded result, the hard timeout, and the job-management actions. Restart
//! checks live in `shell_job_test.rs`. Every test runs in its own temp directory and uses `/bin/sh`
//! commands that finish fast, so the suite stays inside the pre-release time budget.

use super::*;
use crate::shell_job as ops;
use crate::shell_limits::{
    SHELL_FOREGROUND_MS, SHELL_OUTPUT_BYTES, SHELL_OUTPUT_HEAD_BYTES, SHELL_TIMEOUT_MAX_MS,
};
use crate::shell_test_support::{args, run_job, run_shell, sandbox, wait_done};

#[test]
fn a_short_command_returns_done_with_its_code_and_output() {
    let (runner, root) = sandbox("done");
    let result = run_shell(&runner, "printf 'hello'; exit 3", args(json!({}))).unwrap();
    assert_eq!(result["kind"], "shell");
    assert_eq!(result["status"], "done");
    assert_eq!(result["exitCode"], 3);
    assert_eq!(result["output"], "hello");
    assert_eq!(result["truncated"], false);
    assert!(result.get("jobId").is_none());
    let log = result["outputPath"].as_str().unwrap();
    assert!(PathBuf::from(log).starts_with(root.join("jobs")));
    // The wrapper records the code beside the log, so a restart can find it without the process.
    assert_eq!(
        shell_output::exit_code(&PathBuf::from(log).with_extension("exit")),
        Some(3)
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn workdir_must_be_absolute_and_defaults_to_the_home_directory() {
    let (runner, root) = sandbox("workdir");
    assert_eq!(
        run_shell(&runner, "pwd", args(json!({"workdir": "relative/dir"}))),
        Err("path_invalid")
    );
    assert_eq!(
        run_shell(
            &runner,
            "pwd",
            args(json!({"workdir": "/definitely/not/a/directory"}))
        ),
        Err("not_found")
    );
    let home = crate::local_files_operations::home().unwrap();
    let result = run_shell(&runner, "pwd", args(json!({}))).unwrap();
    let printed = result["output"].as_str().unwrap().trim();
    // macOS reports /private/var/... for /var/...; compare the canonical forms.
    assert_eq!(
        PathBuf::from(printed).canonicalize().unwrap(),
        home.canonicalize().unwrap()
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn output_is_cut_to_the_head_and_tail_and_the_full_log_stays_on_disk() {
    let (runner, root) = sandbox("bounded");
    // 100 KiB of digits: bigger than the 64 KiB result cap, and not line-shaped.
    let result = run_shell(
        &runner,
        "head -c 102400 /dev/zero | tr '\\0' 'x'",
        args(json!({})),
    )
    .unwrap();
    let output = result["output"].as_str().unwrap();
    assert_eq!(result["truncated"], true);
    assert_eq!(output.len(), SHELL_OUTPUT_BYTES);
    assert!(output.chars().all(|c| c == 'x'));
    let log = PathBuf::from(result["outputPath"].as_str().unwrap());
    assert_eq!(std::fs::read(&log).unwrap().len(), 102_400);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_cut_never_splits_a_multibyte_character() {
    // 16 KiB + 48 KiB of a 3-byte character: the head and the tail both land mid-character unless
    // the cut steps to a boundary, and the result has to stay valid UTF-8.
    let (runner, root) = sandbox("utf8");
    let result = run_shell(
        &runner,
        "python3 -c \"import sys; sys.stdout.write('中'*40000)\"",
        args(json!({})),
    )
    .unwrap();
    let output = result["output"].as_str().unwrap();
    assert!(output.chars().all(|c| c == '中'));
    assert!(output.len() <= SHELL_OUTPUT_BYTES);
    // Head 16 KiB is not a multiple of 3; the result is still valid and made of whole characters.
    assert!(output.len() >= SHELL_OUTPUT_BYTES - 3);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn background_true_returns_running_at_once_and_the_job_finishes_behind_it() {
    let (runner, root) = sandbox("background");
    let result = run_shell(
        &runner,
        "sleep 0.2; printf done; exit 7",
        args(json!({"background": true})),
    )
    .unwrap();
    assert_eq!(result["status"], "running");
    let id = result["jobId"].as_str().unwrap().to_owned();
    let finished = wait_done(&runner, &id);
    assert_eq!(finished["running"], false);
    assert_eq!(finished["exitCode"], 7);
    assert!(finished["output"].as_str().unwrap().contains("done"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_foreground_window_hands_a_long_command_to_a_job_instead_of_killing_it() {
    let (runner, root) = sandbox("handoff");
    let started = crate::local_files_text::now_ms();
    let result = run_shell(
        &runner,
        // A second past the window, so the foreground gives up first and the command still ends.
        &format!(
            "sleep {}; printf late",
            (SHELL_FOREGROUND_MS + 1000) as f64 / 1000.0
        ),
        args(json!({})),
    )
    .unwrap();
    let elapsed = crate::local_files_text::now_ms() - started;
    assert_eq!(result["status"], "running");
    assert!(elapsed >= SHELL_FOREGROUND_MS);
    assert!(elapsed < SHELL_FOREGROUND_MS + 3_000);
    let id = result["jobId"].as_str().unwrap().to_owned();
    // The process kept running after the call: the job finishes on its own and records the code.
    let finished = wait_done(&runner, &id);
    assert_eq!(finished["exitCode"], 0);
    assert!(finished["output"].as_str().unwrap().contains("late"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_hard_timeout_kills_the_command_and_reports_timeout() {
    let (runner, root) = sandbox("timeout");
    let result = run_shell(
        &runner,
        "sleep 30; echo never",
        args(json!({"timeoutMs": 150})),
    );
    assert_eq!(result, Err("timeout"));
    // The job record says killed, with no invented exit code.
    let listed = run_job(&runner, "list", args(json!({}))).unwrap();
    let jobs = listed["jobs"].as_array().unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["status"], "killed");
    assert!(jobs[0]["exitCode"].is_null());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_timeout_above_the_cap_is_clamped_not_rejected() {
    let (runner, root) = sandbox("clamp");
    // The clamp only matters for absurd values; the command itself must still start.
    let result = run_shell(
        &runner,
        "printf ok",
        args(json!({"timeoutMs": SHELL_TIMEOUT_MAX_MS * 10})),
    );
    assert_eq!(result.unwrap()["status"], "done");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_result_has_no_separate_stderr_stream_because_both_go_to_the_log() {
    let (runner, root) = sandbox("stderr");
    let result = run_shell(&runner, "printf out; printf err >&2", args(json!({}))).unwrap();
    assert_eq!(result["status"], "done");
    let output = result["output"].as_str().unwrap();
    assert!(output.contains("out") && output.contains("err"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn mismatched_command_argument_is_refused_before_anything_runs() {
    let (_runner, root) = sandbox("refuse");
    // The command comes only from `args.command`; a non-string there is refused before any spawn.
    let (runner, root) = (
        super::Runner::new(root.join("jobs.json"), root.join("jobs")),
        root,
    );
    assert_eq!(
        run_shell(&runner, "printf a", args(json!({"command": 7}))),
        Err("path_invalid")
    );
    assert_eq!(
        run_shell(&runner, "", args(json!({"command": ""}))),
        Err("path_invalid")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_job_id_prefix_selects_one_job_and_an_ambiguous_prefix_is_an_error() {
    let (runner, root) = sandbox("prefix");
    let a = run_shell(&runner, "printf a", args(json!({}))).unwrap();
    assert_eq!(a["status"], "done");
    let b = run_shell(&runner, "printf b", args(json!({}))).unwrap();
    assert_eq!(b["status"], "done");
    let jobs = {
        let state = runner.state.lock().unwrap();
        state
            .jobs
            .items
            .iter()
            .map(|job| job.id.clone())
            .collect::<Vec<_>>()
    };
    // The full id always works; a prefix of it works when only one job starts with it.
    let full = run_job(&runner, "status", args(json!({"jobId": jobs[0]}))).unwrap();
    assert!(full["output"].as_str().unwrap().contains('a'));
    let short = jobs[1][..jobs[1].len() - 2].to_owned();
    assert_eq!(
        run_job(&runner, "status", args(json!({"jobId": short}))).unwrap()["output"],
        "b"
    );
    assert_eq!(
        run_job(&runner, "status", args(json!({"jobId": "job-"}))),
        Err("multiple_matches")
    );
    assert_eq!(
        run_job(&runner, "status", args(json!({"jobId": "job-nothing"}))),
        Err("job_not_found")
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn log_pages_by_absolute_byte_offset() {
    let (runner, root) = sandbox("log");
    let result = run_shell(&runner, "printf 0123456789", args(json!({}))).unwrap();
    assert_eq!(result["status"], "done");
    let id = {
        let state = runner.state.lock().unwrap();
        state.jobs.items[0].id.clone()
    };
    let page = run_job(&runner, "log", args(json!({"jobId": id, "offset": 4}))).unwrap();
    assert_eq!(page["output"], "456789");
    assert_eq!(page["offset"], 4);
    assert_eq!(page["next"], 10);
    assert_eq!(page["truncated"], false);
    let past = run_job(&runner, "log", args(json!({"jobId": id, "offset": 100}))).unwrap();
    assert_eq!(past["output"], "");
    assert_eq!(past["offset"], 10);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn write_reaches_standard_input_only_when_it_was_requested() {
    let (runner, root) = sandbox("stdin");
    let closed = run_shell(&runner, "cat", args(json!({"background": true}))).unwrap();
    let id = closed["jobId"].as_str().unwrap().to_owned();
    // Without `stdin:true` there is no pipe, and the job's own `cat` sees EOF at once.
    let ended = wait_done(&runner, &id);
    assert_eq!(ended["exitCode"], 0);
    assert_eq!(ended["output"], "");

    let opened = run_shell(
        &runner,
        "cat",
        args(json!({"background": true, "stdin": true, "notify": false})),
    )
    .unwrap();
    let id = opened["jobId"].as_str().unwrap().to_owned();
    run_job(
        &runner,
        "write",
        args(json!({"jobId": id, "text": "hello"})),
    )
    .unwrap();
    run_job(
        &runner,
        "write",
        args(json!({"jobId": id, "text": "", "eof": true})),
    )
    .unwrap();
    let ended = wait_done(&runner, &id);
    assert_eq!(ended["output"], "hello");

    // A job without a pipe refuses a write rather than fail silently.
    let bare = run_shell(&runner, "sleep 0.1", args(json!({"background": true}))).unwrap();
    let bare_id = bare["jobId"].as_str().unwrap().to_owned();
    assert_eq!(
        run_job(
            &runner,
            "write",
            args(json!({"jobId": bare_id, "text": "x"}))
        ),
        Err("permission_denied")
    );
    let _ = wait_done(&runner, &bare_id);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_concurrency_cap_refuses_a_fifth_command_instead_of_queueing_it() {
    let (runner, root) = sandbox("concurrency");
    for _ in 0..SHELL_MAX_RUNNING {
        let result = run_shell(&runner, "sleep 5", args(json!({"background": true}))).unwrap();
        assert_eq!(result["status"], "running");
    }
    assert_eq!(
        run_shell(&runner, "sleep 5", args(json!({"background": true}))),
        Err("operation_failed")
    );
    // Ending one frees a slot.
    let id = {
        let state = runner.state.lock().unwrap();
        state.jobs.items[0].id.clone()
    };
    run_job(&runner, "kill", args(json!({"jobId": id}))).unwrap();
    assert!(run_shell(&runner, "printf freed", args(json!({}))).is_ok());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_head_constant_and_the_cap_add_up_to_one_result() {
    assert_eq!(SHELL_OUTPUT_BYTES, 65_536);
    assert_eq!(SHELL_OUTPUT_HEAD_BYTES, 16_384);
    assert_eq!(SHELL_FOREGROUND_MS, 15_000);
}

#[test]
fn another_call_is_not_blocked_while_a_foreground_command_waits() {
    let (runner, root) = sandbox("nonblocking");
    let runner = std::sync::Arc::new(runner);
    // A command that outlasts the foreground window, in its own thread as the IPC handler runs it
    // off the thread anyway.
    let foreground = {
        let runner = runner.clone();
        std::thread::spawn(move || run_shell(&runner, "sleep 30", args(json!({}))))
    };
    // Give it time to spawn and enter its wait loop, then ask the runner something else.
    std::thread::sleep(Duration::from_millis(300));
    let started = std::time::Instant::now();
    let listed = run_job(&runner, "list", args(json!({}))).unwrap();
    assert_eq!(listed["jobs"].as_array().unwrap().len(), 1);
    // Well under the 15 s window: the state lock is released between checks, not held for the wait.
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "list waited behind the foreground command"
    );
    let _ = ops::cancel(&runner, "cmd_1");
    let result = foreground.join().unwrap();
    assert_eq!(result, Err("cancelled"));
    let _ = std::fs::remove_dir_all(root);
}

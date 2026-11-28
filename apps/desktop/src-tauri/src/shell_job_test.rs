//! The job lifecycle after a command starts: kill reaching the whole tree, the restart check's
//! three outcomes, the completion notice's exactly-once rule, retention, and cancellation by the
//! command id. The runner's own spawning and foreground window are in `shell_runner_test.rs`.

use crate::shell_job::{cancel as cancel_command, event, resume, settle_all};
use crate::shell_jobs::{Job, JobStatus, Jobs};
use crate::shell_limits::SHELL_MAX_FINISHED_JOBS;
use crate::shell_runner::{Notify, Runner};
use crate::shell_test_support::{args, run_job, run_shell, sandbox, wait_done};
use serde_json::json;

#[test]
fn kill_ends_the_job_and_its_children() {
    let (runner, root) = sandbox("kill");
    let result = run_shell(
        &runner,
        // A subshell that would outlive its parent: `kill_tree` has to reach the group.
        "sleep 30 & sleep 30; echo never",
        args(json!({"background": true})),
    )
    .unwrap();
    let id = result["jobId"].as_str().unwrap().to_owned();
    // Give the children a moment to exist before the group signal.
    std::thread::sleep(std::time::Duration::from_millis(200));
    let killed = run_job(&runner, "kill", args(json!({"jobId": id}))).unwrap();
    assert_eq!(killed["running"], false);
    assert!(killed["exitCode"].is_null());
    let state = runner.state.lock().unwrap();
    assert_eq!(state.jobs.get(&id).unwrap().status, JobStatus::Killed);
    drop(state);
    let listed = run_job(&runner, "list", args(json!({}))).unwrap();
    assert_eq!(listed["jobs"][0]["status"], "killed");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn restart_marks_a_vanished_process_lost_with_no_exit_code() {
    let (_runner, root) = sandbox("restart-lost");
    // A record written by hand for a pid that no longer exists, as a crashed client would leave it.
    let mut jobs = Jobs::default();
    let dir = root.join("jobs/job-dead");
    std::fs::create_dir_all(&dir).unwrap();
    jobs.items.push(Job {
        id: "job-dead".into(),
        command: "false".into(),
        workdir: root.clone(),
        started_ms: 1,
        pid: 999_999,
        start_token: String::new(),
        log_path: dir.join("output.log"),
        notify: true,
        notified: false,
        status: JobStatus::Running,
        exit_code: None,
        stdin: false,
        connection_id: "con_shell".into(),
        elevated: false,
        justification: None,
    });
    jobs.save(&root.join("jobs.json")).unwrap();
    let restored = Runner::new(root.join("jobs.json"), root.join("jobs"));
    let (adopted, finished, lost) = resume(&restored);
    assert_eq!((adopted, finished, lost), (0, 0, 1));
    let state = restored.state.lock().unwrap();
    let job = state.jobs.get("job-dead").unwrap();
    assert_eq!(job.status, JobStatus::Lost);
    assert_eq!(job.exit_code, None);
    drop(state);
    // The completion event says lost, and does not invent a code.
    let event = event(
        &restored
            .state
            .lock()
            .unwrap()
            .jobs
            .get("job-dead")
            .unwrap()
            .clone(),
    );
    assert_eq!(event["status"], "lost");
    assert!(event["exitCode"].is_null());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn restart_reads_the_exit_file_for_a_job_that_ended_while_the_client_was_away() {
    let (_runner, root) = sandbox("restart-exit");
    let mut jobs = Jobs::default();
    let dir = root.join("jobs/job-ended");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("output.log"), "run").unwrap();
    std::fs::write(dir.join("output.exit"), "42").unwrap();
    jobs.items.push(Job {
        id: "job-ended".into(),
        command: "build".into(),
        workdir: root.clone(),
        started_ms: 1,
        pid: 999_999,
        start_token: String::new(),
        log_path: dir.join("output.log"),
        notify: true,
        notified: false,
        status: JobStatus::Running,
        exit_code: None,
        stdin: false,
        connection_id: "con_shell".into(),
        elevated: false,
        justification: None,
    });
    jobs.save(&root.join("jobs.json")).unwrap();
    let restored = Runner::new(root.join("jobs.json"), root.join("jobs"));
    let (adopted, finished, lost) = resume(&restored);
    assert_eq!((adopted, finished, lost), (0, 1, 0));
    let state = restored.state.lock().unwrap();
    let job = state.jobs.get("job-ended").unwrap();
    assert_eq!(job.status, JobStatus::Done);
    assert_eq!(job.exit_code, Some(42));
    assert!(!job.notified);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn the_watcher_notifies_once_and_records_it() {
    let (runner, root) = sandbox("notify");
    let result = run_shell(&runner, "printf done", args(json!({"background": true}))).unwrap();
    let id = result["jobId"].as_str().unwrap().to_owned();
    let _ = wait_done(&runner, &id);
    let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = seen.clone();
    let notify: Notify = std::sync::Arc::new(move |job: &Job| {
        sink.lock().unwrap().push(job.id.clone());
        true
    });
    settle_all(&runner, &notify);
    settle_all(&runner, &notify);
    assert_eq!(*seen.lock().unwrap(), vec![id.clone()]);
    let state = runner.state.lock().unwrap();
    assert!(state.jobs.get(&id).unwrap().notified);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn retention_keeps_running_jobs_and_drops_the_oldest_finished_ones() {
    let (runner, root) = sandbox("retention");
    {
        let mut state = runner.state.lock().unwrap();
        for index in 0..SHELL_MAX_FINISHED_JOBS + 5 {
            let dir = root.join("jobs").join(format!("job-{index}"));
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("output.log"), "x").unwrap();
            state.jobs.items.push(Job {
                id: format!("job-{index}"),
                command: "echo".into(),
                workdir: root.clone(),
                started_ms: index as u64,
                pid: 0,
                start_token: String::new(),
                log_path: dir.join("output.log"),
                notify: false,
                notified: true,
                status: JobStatus::Done,
                exit_code: Some(0),
                stdin: false,
                connection_id: "con_shell".into(),
                elevated: false,
                justification: None,
            });
        }
        let running = root.join("jobs/job-running");
        std::fs::create_dir_all(&running).unwrap();
        state.jobs.items.push(Job {
            id: "job-running".into(),
            command: "sleep".into(),
            workdir: root.clone(),
            started_ms: 0,
            pid: 0,
            start_token: String::new(),
            log_path: running.join("output.log"),
            notify: false,
            notified: false,
            status: JobStatus::Running,
            exit_code: None,
            stdin: false,
            connection_id: "con_shell".into(),
            elevated: false,
            justification: None,
        });
        let dropped = state
            .jobs
            .prune(SHELL_MAX_FINISHED_JOBS, &root.join("jobs"));
        assert_eq!(dropped.len(), 5);
        assert!(dropped.contains(&"job-0".to_string()));
        assert!(state.jobs.get("job-running").is_some());
        assert_eq!(
            state
                .jobs
                .items
                .iter()
                .filter(|job| job.status == JobStatus::Done)
                .count(),
            SHELL_MAX_FINISHED_JOBS
        );
        assert!(!root.join("jobs/job-0").exists());
    }
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_command_id_maps_to_the_job_so_a_late_cancel_still_reaches_it() {
    let (runner, root) = sandbox("cancel");
    let result = run_shell(
        &runner,
        "sleep 30; echo never",
        args(json!({"background": true})),
    )
    .unwrap();
    assert_eq!(result["status"], "running");
    assert!(cancel_command(&runner, "cmd_1"));
    {
        let state = runner.state.lock().unwrap();
        assert_eq!(state.jobs.items[0].status, JobStatus::Killed);
    }
    assert!(!cancel_command(&runner, "cmd_1"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn restart_adopts_a_live_process_and_notes_its_completion() {
    let (runner, root) = sandbox("restart-adopt");
    let result = run_shell(
        &runner,
        "sleep 5",
        args(json!({"background": true, "notify": false})),
    )
    .unwrap();
    let id = result["jobId"].as_str().unwrap().to_owned();
    // A second runner on the same jobs file is what the next client start builds: it holds no child
    // handle, only the record, and has to decide from pid plus start token.
    let restored = Runner::new(root.join("jobs.json"), root.join("jobs"));
    let (adopted, finished, lost) = resume(&restored);
    assert_eq!((adopted, finished, lost), (1, 0, 0));
    let pid = {
        let state = restored.state.lock().unwrap();
        assert_eq!(state.jobs.get(&id).unwrap().status, JobStatus::Running);
        state.jobs.get(&id).unwrap().pid
    };
    // The adopted record is not waiting on a child, so killing it goes by pid.
    let killed = run_job(&restored, "kill", args(json!({"jobId": id})));
    assert_eq!(killed.unwrap()["running"], false);
    assert_eq!(
        restored.state.lock().unwrap().jobs.get(&id).unwrap().status,
        JobStatus::Killed
    );
    // The original runner still holds the child; reaping it is this test's job, as the client's own
    // live handle would be reaped by `settle` after a normal kill.
    let _ = cancel_command(&runner, "cmd_1");
    for _ in 0..40 {
        if !crate::shell_process::alive(pid, "") {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let _ = std::fs::remove_dir_all(root);
}

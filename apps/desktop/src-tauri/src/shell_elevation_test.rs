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

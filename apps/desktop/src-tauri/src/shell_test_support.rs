//! Shared helpers for the terminal tests: one temp job directory per test, and the two calls the
//! runner exposes under the names the tools use.

use crate::shell_job as ops;
use crate::shell_runner::{start, Runner};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

pub fn sandbox(name: &str) -> (Runner, PathBuf) {
    let root = std::env::temp_dir().join(format!("yonder-shell-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("jobs")).unwrap();
    let runner = Runner::new(root.join("jobs.json"), root.join("jobs"));
    (runner, root)
}

pub fn args(value: Value) -> Value {
    value
}

pub fn run_shell(runner: &Runner, command: &str, args: Value) -> Result<Value, &'static str> {
    let cancel = AtomicBool::new(false);
    let mut args = args;
    if args.get("command").is_none() {
        args["command"] = json!(command);
    }
    start(runner, "con_shell", "cmd_1", &args, &cancel, u64::MAX)
}

pub fn run_job(runner: &Runner, action: &str, args: Value) -> Result<Value, &'static str> {
    let cancel = AtomicBool::new(false);
    ops::job(runner, action, &args, &cancel, u64::MAX)
}

/// Wait for a background job to finish with the runner's own `wait`, then read its state.
pub fn wait_done(runner: &Runner, id: &str) -> Value {
    ops::wait(runner, id, 10_000).expect("job should finish")
}

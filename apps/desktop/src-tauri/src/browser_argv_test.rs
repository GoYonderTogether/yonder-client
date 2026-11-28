//! The exact `bsk` argv each browser operation builds, checked against a supervisor that only records.
//! Kept apart from `browser_test.rs` so each file has one subject and stays under the length limit.

use crate::browser::{execute, Device};
use crate::browser_bsk::{Bsk, Output, Spawn, Supervisor};
use crate::browser_limits as limits;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn now_nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default()
}

/// Every argv of a call, recorded by a supervisor that only records.
fn recorded_all(operation: &str, args: Value) -> Vec<Vec<String>> {
    #[derive(Clone)]
    struct Recorder(std::sync::Arc<Mutex<Vec<Vec<String>>>>);
    impl Supervisor for Recorder {
        fn run(
            &self,
            _command: &str,
            args: &[String],
            _env: &BTreeMap<String, String>,
            _timeout: Duration,
        ) -> Result<Output, Spawn> {
            self.0.lock().unwrap().push(args.to_vec());
            Ok(Output { stdout: "{}".into(), stderr: String::new(), status: 0 })
        }
        fn resolves(&self, _command: &str) -> bool {
            true
        }
    }
    let log = std::sync::Arc::new(Mutex::new(Vec::<Vec<String>>::new()));
    let file = std::env::temp_dir().join(format!("yonder-bsk-argv-{}.json", now_nonce()));
    std::fs::write(&file, r#"{"pid": 42}"#).unwrap();
    let device = Device {
        bsk: Bsk {
            program: "bsk".into(),
            env: BTreeMap::new(),
            supervisor: Box::new(Recorder(log.clone())),
        },
        daemon_file: file.clone(),
        alive: std::sync::Arc::new(|_pid| true),
    };
    // The daemon is already up, so only the operation's own calls are recorded.
    let _ = execute(&device, operation, &args);
    std::fs::remove_file(file).ok();
    let calls = log.lock().unwrap().clone();
    calls
}

/// The argv of a call that makes exactly one bsk invocation.
fn recorded(operation: &str, args: Value) -> Vec<String> {
    recorded_all(operation, args).last().cloned().unwrap_or_default()
}

#[test]
fn navigate_argv_names_the_url_and_wait() {
    // navigate asks bsk to open the URL, then reads the tab's title; the first call is the navigation.
    let calls = recorded_all(
        "browser_navigate",
        json!({"sessionId": "aa11", "url": "https://example.test/x", "waitUntil": "domcontentloaded"}),
    );
    assert_eq!(
        calls[0],
        [
            "--json", "navigate", "--session", "aa11", "--wait-until",
            "domcontentloaded", "--timeout", &limits::NAVIGATE_CLI_SECONDS.to_string(),
            "https://example.test/x",
        ]
    );
    assert_eq!(calls[1], ["--json", "tab", "list", "--session", "aa11", "--scope", "agent"]);
}

#[test]
fn screenshot_argv_adds_full_page_only_when_asked() {
    let argv = recorded("browser_act", json!({"sessionId": "aa11", "action": "screenshot", "fullPage": true}));
    assert_eq!(argv[0], "--json");
    assert_eq!(argv[1], "screenshot");
    assert_eq!(argv[2], "--session");
    assert!(argv.contains(&"--full-page".to_owned()));
    let plain = recorded("browser_act", json!({"sessionId": "aa11", "action": "screenshot"}));
    assert!(!plain.contains(&"--full-page".to_owned()));
}

#[test]
fn status_argv_is_the_browsers_list() {
    let argv = recorded("browser_status", json!({}));
    assert_eq!(argv, ["--json", "browsers"]);
}

#[test]
fn act_argv_shapes() {
    // Screenshot builds `screenshot --session <id> [--full-page] --timeout <n>`.
    let cases: Vec<(Value, Vec<&str>)> = vec![
        (
            json!({"sessionId": "aa11", "action": "fill", "ref": "e2", "value": "hi"}),
            vec!["--json", "fill", "--session", "aa11", "@e2", "--value", "hi"],
        ),
        (
            json!({"sessionId": "aa11", "action": "press", "key": "Enter"}),
            vec!["--json", "press", "--session", "aa11", "Enter"],
        ),
        (
            json!({"sessionId": "aa11", "action": "scroll", "deltaY": -480}),
            vec!["--json", "wheel", "--session", "aa11", "--delta-y", "-480"],
        ),
    ];
    for (args, expected) in cases {
        let recorded = std::sync::Arc::new(Mutex::new(Vec::<Vec<String>>::new()));
        let log = recorded.clone();
        struct Recorder(Arc<Mutex<Vec<Vec<String>>>>);
        impl Supervisor for Recorder {
            fn run(
                &self,
                _command: &str,
                args: &[String],
                _env: &BTreeMap<String, String>,
                _timeout: Duration,
            ) -> Result<Output, Spawn> {
                self.0.lock().unwrap().push(args.to_vec());
                Ok(Output { stdout: "{}".into(), stderr: String::new(), status: 0 })
            }
            fn resolves(&self, _command: &str) -> bool {
                true
            }
        }
        let file = std::env::temp_dir().join(format!("yonder-bsk-argv-{}.json", now_nonce()));
        std::fs::write(&file, r#"{"pid": 42}"#).unwrap();
        let device = Device {
            bsk: Bsk {
                program: "bsk".into(),
                env: BTreeMap::new(),
                supervisor: Box::new(Recorder(log)),
            },
            daemon_file: file.clone(),
            alive: std::sync::Arc::new(|_pid| true),
        };
        execute(&device, "browser_act", &args).unwrap();
        let calls = recorded.lock().unwrap();
        let built: Vec<&str> = calls.last().unwrap().iter().map(String::as_str).collect();
        assert_eq!(built, expected);
        std::fs::remove_file(file).ok();
    }
}

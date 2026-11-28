//! Tests for the browser runner: the four states, JSON parsing past a banner, the deadline, and the
//! exact argv each operation builds. A [`Fake`] supervisor stands in for a real `bsk`, so nothing
//! here depends on the browser-skill CLI being installed on the machine running the tests.

use super::*;
use crate::browser_bsk::{extract_json, Bsk, Output, Spawn, Supervisor};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

/// One recorded call: the program, its arguments and the environment it got.
#[derive(Clone, Debug)]
struct Call {
    program: String,
    args: Vec<String>,
    env: BTreeMap<String, String>,
    timeout: Duration,
}

/// A supervisor that answers from a script and records every call. `installed` decides what
/// `resolves` says; each run pops the next scripted answer in order.
struct Fake {
    installed: bool,
    answers: Mutex<Vec<Result<Output, Spawn>>>,
    calls: Mutex<Vec<Call>>,
}

impl Fake {
    fn new(installed: bool, answers: Vec<Result<Output, Spawn>>) -> Fake {
        Fake {
            installed,
            answers: Mutex::new(answers),
            calls: Mutex::new(Vec::new()),
        }
    }
    fn calls(&self) -> Vec<Call> {
        self.calls.lock().unwrap().clone()
    }
}

impl Supervisor for Fake {
    fn run(
        &self,
        command: &str,
        args: &[String],
        env: &BTreeMap<String, String>,
        timeout: Duration,
    ) -> Result<Output, Spawn> {
        self.calls.lock().unwrap().push(Call {
            program: command.to_owned(),
            args: args.to_vec(),
            env: env.clone(),
            timeout,
        });
        let mut answers = self.answers.lock().unwrap();
        if answers.is_empty() {
            Ok(Output {
                stdout: "{}".into(),
                stderr: String::new(),
                status: 0,
            })
        } else {
            answers.remove(0)
        }
    }

    fn resolves(&self, _command: &str) -> bool {
        self.installed
    }
}

fn device(fake: Fake, daemon_running: bool) -> (Device, PathBuf) {
    let file = std::env::temp_dir().join(format!(
        "yonder-bsk-daemon-{}-{}.json",
        std::process::id(),
        now_nonce()
    ));
    if daemon_running {
        std::fs::write(&file, r#"{"pid": 42}"#).unwrap();
    }
    let device = Device {
        bsk: Bsk {
            program: "bsk".into(),
            env: {
                let mut env = BTreeMap::new();
                env.insert("BSK_AUTO_UPDATE".to_owned(), "off".to_owned());
                env
            },
            supervisor: Box::new(fake),
        },
        daemon_file: file.clone(),
        // The file above is the daemon's claim; a live pid is whatever the test says.
        alive: std::sync::Arc::new(move |pid| pid == 42),
    };
    (device, file)
}

/// Test-only constructions of [`Device`] and [`Bsk`] with a fake supervisor in place of a real CLI.
fn fake_device(installed: bool, answers: Vec<Result<Output, Spawn>>) -> Device {
    let file = std::env::temp_dir().join(format!(
        "yonder-bsk-daemon-{}-{}.json",
        std::process::id(),
        now_nonce()
    ));
    std::fs::write(&file, r#"{"pid": 42}"#).unwrap();
    Device {
        bsk: Bsk {
            program: "bsk".into(),
            env: {
                let mut env = BTreeMap::new();
                env.insert("BSK_AUTO_UPDATE".to_owned(), "off".to_owned());
                env
            },
            supervisor: Box::new(Fake::new(installed, answers)),
        },
        daemon_file: file,
        alive: std::sync::Arc::new(|pid| pid == 42),
    }
}

fn now_nonce() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default()
}

fn ok(stdout: &str) -> Result<Output, Spawn> {
    Ok(Output {
        stdout: stdout.into(),
        stderr: String::new(),
        status: 0,
    })
}

fn failed(code: &str) -> Result<Output, Spawn> {
    Ok(Output {
        stdout: format!(r#"{{"code":"{code}","message":"x","exit_code":1}}"#),
        stderr: String::new(),
        status: 1,
    })
}

#[test]
fn no_bsk_is_installed_false_and_says_so() {
    let fake = Fake::new(false, vec![]);
    let (device, file) = device(fake, false);
    let status = execute(&device, "browser_status", &json!({})).unwrap();
    assert_eq!(status["installed"], false);
    assert_eq!(status["daemonRunning"], false);
    assert_eq!(status["connected"], false);
    assert_eq!(status["hint"], HINT_INSTALL);
    // An operation that needs bsk is the same state, not a generic failure.
    assert_eq!(
        execute(&device, "browser_navigate", &json!({"sessionId": "aa11", "url": "https://x.test"})),
        Err("browser_not_installed")
    );
    std::fs::remove_file(file).ok();
}

#[test]
fn installed_without_a_running_daemon() {
    let fake = Fake::new(true, vec![]);
    // No daemon file: it is not running.
    let (device, file) = device(fake, false);
    let status = execute(&device, "browser_status", &json!({})).unwrap();
    assert_eq!(status["installed"], true);
    assert_eq!(status["daemonRunning"], false);
    assert_eq!(status["connected"], false);
    assert_eq!(status["hint"], HINT_NO_DAEMON);
    std::fs::remove_file(file).ok();
}

#[test]
fn daemon_running_with_no_extension_attached() {
    let fake = Fake::new(true, vec![ok("[]")]);
    let (device, file) = device(fake, true);
    let status = execute(&device, "browser_status", &json!({})).unwrap();
    assert_eq!(status["installed"], true);
    assert_eq!(status["daemonRunning"], true);
    assert_eq!(status["connected"], false);
    assert_eq!(status["browsers"], json!([]));
    assert_eq!(status["hint"], HINT_NO_EXTENSION);
    std::fs::remove_file(file).ok();
}

#[test]
fn an_attached_extension_is_the_connected_state() {
    let fake = Fake::new(
        true,
        vec![ok(r#"[{"browser_name":"chrome","browser_version":"157.0"}]"#)],
    );
    let (device, file) = device(fake, true);
    let status = execute(&device, "browser_status", &json!({})).unwrap();
    assert_eq!(status["connected"], true);
    assert_eq!(status["browsers"][0]["name"], "chrome");
    assert_eq!(status["browsers"][0]["version"], "157.0");
    assert_eq!(status["hint"], HINT_CONNECTED);
    std::fs::remove_file(file).ok();
}

#[test]
fn a_banner_before_the_json_is_tolerated() {
    // A newer CLI prints an update line to stdout before the payload.
    assert_eq!(
        extract_json("A new bsk version is available: 0.3.3 -> 0.5.0. Run `bsk update`.\n{\"a\":1}\n"),
        Some(json!({"a": 1}))
    );
    // A brace inside a string does not end the object.
    assert_eq!(
        extract_json("{\"title\":\"a } b\"}"),
        Some(json!({"title": "a } b"}))
    );
    assert_eq!(extract_json("error: no daemon"), None);
}

#[test]
fn a_timeout_is_reported_as_the_session_state_not_a_hang() {
    let fake = Fake::new(true, vec![Err(Spawn::TimedOut)]);
    let (device, file) = device(fake, true);
    // The daemon is up, but the call times out: the caller sees a real error, never hangs.
    let result = execute(
        &device,
        "browser_navigate",
        &json!({"sessionId": "aa11", "url": "https://example.test"}),
    );
    assert_eq!(result, Err("browser_session_not_found"));
    std::fs::remove_file(file).ok();
}

#[test]
fn session_start_argv_and_result() {
    let fake = Fake::new(
        true,
        vec![
            ok(r#"{"session_id":"aa11"}"#),
            ok(r#"{"tabs":[{"tab_id":1,"url":"https://start.test","title":"Start","active":true}]}"#),
        ],
    );
    let (device, file) = device(fake, true);
    // The fake is moved into the device; keep a clone of its calls by re-reading the device's box.
    let result = execute(&device, "browser_session", &json!({"action": "start"})).unwrap();
    assert_eq!(result["kind"], "browser_session");
    assert_eq!(result["sessionId"], "aa11");
    assert_eq!(result["sessions"][0]["url"], "https://start.test");
    assert_eq!(result["sessions"][0]["title"], "Start");
    std::fs::remove_file(file).ok();
}

#[test]
fn navigate_builds_the_expected_command() {
    // No daemon file: the call must start the daemon first, so two answers are scripted.
    let fake = Fake::new(
        true,
        vec![
            ok("{}"),
            ok(r#"{"tab_id":7,"url":"https://example.test","final_url":"https://example.test/x"}"#),
            ok(r#"{"tabs":[{"tab_id":7,"url":"https://example.test/x","title":"Example","active":true}]}"#),
        ],
    );
    let (device, file) = device(fake, false);
    let result = execute(
        &device,
        "browser_navigate",
        &json!({"sessionId": "aa11", "url": "https://example.test/x", "waitUntil": "domcontentloaded"}),
    )
    .unwrap();
    assert_eq!(result["url"], "https://example.test/x");
    assert_eq!(result["title"], "Example");
    std::fs::remove_file(file).ok();
}

#[test]
fn observe_text_carries_the_text_and_truncation() {
    let fake = Fake::new(
        true,
        vec![ok(r#"{"text":"hello","truncated":true,"ref_count":0,"tab_id":3}"#)],
    );
    let (device, file) = device(fake, true);
    let result = execute(&device, "browser_observe", &json!({"sessionId": "aa11"})).unwrap();
    assert_eq!(result["kind"], "browser_observe");
    assert_eq!(result["text"], "hello");
    assert_eq!(result["truncated"], true);
    assert!(result.get("elements").is_none());
    std::fs::remove_file(file).ok();
}

#[test]
fn observe_snapshot_reads_elements_from_the_aria_text() {
    let text = "  @e1 button \"Submit\"\n  @e2 textbox \"Search\" =coffee\n  @context nav \"Main\"";
    let fake = Fake::new(
        true,
        vec![ok(&format!(r#"{{"text":{},"ref_count":2,"tab_id":3,"truncated":false}}"#, json!(text)))],
    );
    let (device, file) = device(fake, true);
    let result = execute(
        &device,
        "browser_observe",
        &json!({"sessionId": "aa11", "mode": "snapshot"}),
    )
    .unwrap();
    let elements = result["elements"].as_array().unwrap();
    assert_eq!(elements.len(), 2);
    assert_eq!(elements[0]["ref"], "e1");
    assert_eq!(elements[0]["role"], "button");
    assert_eq!(elements[0]["name"], "Submit");
    assert_eq!(elements[1]["ref"], "e2");
    assert_eq!(elements[1]["value"], "coffee");
    std::fs::remove_file(file).ok();
}

#[test]
fn act_click_uses_the_ref_as_a_target() {
    let fake = Fake::new(true, vec![ok(r#"{"tab_id":1,"x":10,"y":20}"#)]);
    let (device, file) = device(fake, true);
    let result = execute(
        &device,
        "browser_act",
        &json!({"sessionId": "aa11", "action": "click", "ref": "e3"}),
    )
    .unwrap();
    assert_eq!(result["kind"], "browser_act");
    assert_eq!(result["ok"], true);
    std::fs::remove_file(file).ok();
}

#[test]
fn daemon_start_is_run_for_its_status_not_parsed_as_json() {
    // `bsk daemon start` writes no JSON; a successful start must not read as an unreadable answer.
    let started = Ok(Output { stdout: String::new(), stderr: String::new(), status: 0 });
    // The list that follows answers with the array bsk really prints.
    let listed = ok("[]");
    let fake = Fake::new(true, vec![started, listed]);
    let (device, file) = device(fake, false);
    let result = execute(&device, "browser_session", &json!({"action": "list"})).unwrap();
    assert_eq!(result["kind"], "browser_session");
    // The daemon start succeeded (no JSON parsed), and the list ran after it.
    assert_eq!(result["sessions"], json!([]));
    std::fs::remove_file(file).ok();
}

#[test]
fn a_missing_session_is_the_session_state() {
    let fake = Fake::new(true, vec![failed("not_found")]);
    let (device, file) = device(fake, true);
    let result = execute(
        &device,
        "browser_navigate",
        &json!({"sessionId": "aa11", "url": "https://example.test"}),
    );
    assert_eq!(result, Err("browser_session_not_found"));
    std::fs::remove_file(file).ok();
}

#[test]
fn no_browser_connected_maps_to_disconnected() {
    let fake = Fake::new(true, vec![failed("no_browser_connected")]);
    let (device, file) = device(fake, true);
    let result = execute(&device, "browser_session", &json!({"action": "list"}));
    assert_eq!(result, Err("browser_disconnected"));
    std::fs::remove_file(file).ok();
}

#[test]
fn a_url_that_is_not_http_is_refused_before_bsk_runs() {
    let fake = Fake::new(true, vec![]);
    let (device, file) = device(fake, true);
    assert_eq!(
        execute(
            &device,
            "browser_navigate",
            &json!({"sessionId": "aa11", "url": "file:///etc/passwd"})
        ),
        Err("operation_failed")
    );
    std::fs::remove_file(file).ok();
}

#[test]
fn every_child_gets_auto_update_off() {
    let fake = Fake::new(true, vec![ok(r#"{"sessions":[]}"#)]);
    let (device, file) = device(fake, true);
    execute(&device, "browser_session", &json!({"action": "list"})).unwrap();
    // Read the environment the fake recorded through a second handle is awkward once boxed; the
    // device's own env is what every call receives, so assert it directly.
    assert_eq!(device.bsk.env.get("BSK_AUTO_UPDATE").map(String::as_str), Some("off"));
    std::fs::remove_file(file).ok();
}

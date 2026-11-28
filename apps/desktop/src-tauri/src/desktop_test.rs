//! Unit tests for desktop control's device side: argument validation, the ref contract, coordinate
//! maths, the missing-permission mapping, and background-before-foreground delivery. A fake backend
//! stands in for the screen, so none of this needs a real window or system permission.

use super::*;
use serde_json::json;
use std::sync::Mutex;

/// A backend that answers from fixed data and records which delivery path it was asked for. A `ref`
/// not in `valid_refs` is `element_not_found`, reproducing the real backends' ref-scope rule.
struct Fake {
    windows: Vec<Window>,
    nodes: Vec<AxNode>,
    truncated: bool,
    valid_refs: Vec<String>,
    /// What a background delivery reports: `Some(true)` changed, `Some(false)` did not, `None` unknown.
    background_changed: Option<bool>,
    /// Set when a call should fail with a missing permission.
    deny: Option<Failure>,
    calls: Mutex<Vec<&'static str>>,
}

impl Fake {
    fn new() -> Self {
        Self {
            windows: vec![Window {
                id: "w1".into(),
                app: "Notes".into(),
                title: "Untitled".into(),
                pid: 4242,
                bounds: Bounds { x: 10.0, y: 20.0, width: 800.0, height: 600.0 },
                focused: true,
            }],
            nodes: vec![AxNode {
                reference: "n0".into(),
                role: "AXButton".into(),
                title: Some("Save".into()),
                value: None,
                bounds: Some(Bounds { x: 5.0, y: 5.0, width: 40.0, height: 20.0 }),
                actions: vec!["AXPress".into()],
            }],
            truncated: false,
            valid_refs: vec!["n0".into()],
            background_changed: Some(true),
            deny: None,
            calls: Mutex::new(Vec::new()),
        }
    }
    fn record(&self, name: &'static str) {
        self.calls.lock().unwrap().push(name);
    }
    fn called(&self) -> Vec<&'static str> {
        self.calls.lock().unwrap().clone()
    }
    fn check_ref(&self, input: &Input) -> Result<(), Failure> {
        let reference = match &input.action {
            InputAction::Click(Target::Element { reference })
            | InputAction::Drag(Target::Element { reference }, _) => Some(reference),
            _ => None,
        };
        if let Some(reference) = reference {
            if !self.valid_refs.contains(reference) {
                return Err(Failure::new("element_not_found"));
            }
        }
        Ok(())
    }
}

impl Backend for Fake {
    fn list_windows(&self) -> Result<Vec<Window>, Failure> {
        self.record("list_windows");
        if let Some(deny) = &self.deny {
            return Err(deny.clone());
        }
        Ok(self.windows.clone())
    }
    fn read_ax(&self, _window_id: &str, _depth: u32, _max_nodes: u32) -> Result<AxRead, Failure> {
        self.record("read_ax");
        if let Some(deny) = &self.deny {
            return Err(deny.clone());
        }
        Ok(AxRead { nodes: self.nodes.clone(), truncated: self.truncated })
    }
    fn screenshot(&self, _window_id: Option<&str>) -> Result<Shot, Failure> {
        self.record("screenshot");
        if let Some(deny) = &self.deny {
            return Err(deny.clone());
        }
        Ok(Shot { base64: "AAAA".into(), mime_type: "image/png".into(), width: 1600, height: 1200 })
    }
    fn input_background(&self, input: &Input) -> Result<Step, Failure> {
        self.record("input_background");
        if let Some(deny) = &self.deny {
            return Err(deny.clone());
        }
        self.check_ref(input)?;
        Ok(Step { changed: self.background_changed })
    }
    fn input_foreground(&self, input: &Input) -> Result<Step, Failure> {
        self.record("input_foreground");
        if let Some(deny) = &self.deny {
            return Err(deny.clone());
        }
        self.check_ref(input)?;
        Ok(Step { changed: Some(true) })
    }
}

// ---------------------------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------------------------

#[test]
fn desktop_ax_applies_default_depth_and_node_cap() {
    struct Probe(Mutex<(u32, u32)>);
    impl Backend for Probe {
        fn list_windows(&self) -> Result<Vec<Window>, Failure> { Ok(vec![]) }
        fn read_ax(&self, _w: &str, depth: u32, max: u32) -> Result<AxRead, Failure> {
            *self.0.lock().unwrap() = (depth, max);
            Ok(AxRead { nodes: vec![], truncated: false })
        }
        fn screenshot(&self, _w: Option<&str>) -> Result<Shot, Failure> { unreachable!() }
        fn input_background(&self, _i: &Input) -> Result<Step, Failure> { unreachable!() }
        fn input_foreground(&self, _i: &Input) -> Result<Step, Failure> { unreachable!() }
    }
    let probe = Probe(Mutex::new((0, 0)));
    execute("desktop_ax", &json!({"windowId": "w1"}), &probe).unwrap();
    assert_eq!(
        *probe.0.lock().unwrap(),
        (AX_DEFAULT_DEPTH as u32, AX_DEFAULT_NODES as u32)
    );
}

#[test]
fn desktop_ax_rejects_out_of_range_depth_and_nodes() {
    let fake = Fake::new();
    assert_eq!(
        execute("desktop_ax", &json!({"windowId": "w1", "depth": 13}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    assert_eq!(
        execute("desktop_ax", &json!({"windowId": "w1", "maxNodes": 2001}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    assert_eq!(
        execute("desktop_ax", &json!({"windowId": "w1", "depth": 0}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // A window id is required.
    assert_eq!(
        execute("desktop_ax", &json!({}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
}

#[test]
fn desktop_input_requires_its_own_fields() {
    let fake = Fake::new();
    // click without a ref or a point.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "click"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // type without text.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "type"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // key without a key.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "key"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // scroll without deltaY.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "scroll"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // drag without a target end point.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "drag", "x": 1, "y": 2}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // unknown action.
    assert_eq!(
        execute("desktop_input", &json!({"windowId": "w1", "action": "wiggle"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
    // windowId is required.
    assert_eq!(
        execute("desktop_input", &json!({"action": "type", "text": "hi"}), &fake).unwrap_err(),
        Failure::new("path_invalid")
    );
}

#[test]
fn desktop_input_accepts_a_point_click_and_a_ref_click() {
    let fake = Fake::new();
    let by_point = execute("desktop_input", &json!({"windowId": "w1", "action": "click", "x": 4, "y": 8}), &fake);
    assert!(by_point.is_ok());
    let by_ref = execute("desktop_input", &json!({"windowId": "w1", "action": "click", "ref": "n0"}), &fake);
    assert!(by_ref.is_ok());
}

// ---------------------------------------------------------------------------------------------
// The ref contract
// ---------------------------------------------------------------------------------------------

#[test]
fn an_unknown_ref_is_element_not_found() {
    let fake = Fake::new();
    let failure = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "click", "ref": "stale"}),
        &fake,
    )
    .unwrap_err();
    assert_eq!(failure, Failure::new("element_not_found"));
}

#[test]
fn a_ref_from_the_read_is_accepted() {
    let fake = Fake::new();
    let read = execute("desktop_ax", &json!({"windowId": "w1"}), &fake).unwrap();
    let node_ref = read["nodes"][0]["ref"].as_str().unwrap().to_owned();
    assert_eq!(node_ref, "n0");
    let click = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "click", "ref": node_ref}),
        &fake,
    )
    .unwrap();
    assert_eq!(click["delivered"], "background");
}

// ---------------------------------------------------------------------------------------------
// Coordinate maths (Retina and window-relative → screen)
// ---------------------------------------------------------------------------------------------

#[test]
fn a_window_relative_point_maps_to_screen_by_adding_the_origin() {
    assert_eq!(to_screen((10.0, 20.0), (5.0, 7.0)), (15.0, 27.0));
}

#[test]
fn a_retina_window_reports_pixel_dimensions() {
    // An 800×600-point window at 2× is 1600×1200 pixels.
    assert_eq!(pixel_size((800.0, 600.0), 2.0), (1600, 1200));
    // A 1.5× display rounds to whole pixels.
    assert_eq!(pixel_size((100.0, 50.0), 1.5), (150, 75));
    // A nonsense scale is clamped to 1×, never a zero-size image.
    assert_eq!(pixel_size((100.0, 50.0), 0.0), (100, 50));
}

#[test]
fn an_image_pixel_maps_back_to_a_window_point() {
    assert_eq!(pixel_to_point((1600.0, 1200.0), 2.0), (800.0, 600.0));
    assert_eq!(pixel_to_point((150.0, 75.0), 1.5), (100.0, 50.0));
    // A bad scale falls back to 1× so the mapping is never a division by zero.
    assert_eq!(pixel_to_point((100.0, 50.0), 0.0), (100.0, 50.0));
}

// ---------------------------------------------------------------------------------------------
// Missing system permission
// ---------------------------------------------------------------------------------------------

#[test]
fn a_missing_permission_maps_to_desktop_permission_required_with_its_name() {
    let mut fake = Fake::new();
    fake.deny = Some(Failure::permission("screen_recording"));
    let failure = execute("desktop_shot", &json!({}), &fake).unwrap_err();
    assert_eq!(failure.code, "desktop_permission_required");
    assert_eq!(failure.permission, Some("screen_recording"));
    let body = failure.body();
    assert_eq!(body["error"], "desktop_permission_required");
    assert_eq!(body["permission"], "screen_recording");
}

#[test]
fn a_missing_accessibility_permission_is_named() {
    let mut fake = Fake::new();
    fake.deny = Some(Failure::permission("accessibility"));
    let failure = execute("desktop_windows", &json!({}), &fake).unwrap_err();
    assert_eq!(failure.permission, Some("accessibility"));
}

// ---------------------------------------------------------------------------------------------
// Background before foreground
// ---------------------------------------------------------------------------------------------

#[test]
fn background_is_used_when_it_changes_the_target() {
    let mut fake = Fake::new();
    fake.background_changed = Some(true);
    let result = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "type", "text": "hello"}),
        &fake,
    )
    .unwrap();
    assert_eq!(result["delivered"], "background");
    assert_eq!(result["changed"], true);
    assert_eq!(fake.called(), vec!["input_background"]);
}

#[test]
fn foreground_is_used_when_the_caller_asks_for_it() {
    let fake = Fake::new();
    let result = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "type", "text": "hello", "delivery": "foreground"}),
        &fake,
    )
    .unwrap();
    assert_eq!(result["delivered"], "foreground");
    assert_eq!(fake.called(), vec!["input_foreground"]);
}

#[test]
fn a_background_delivery_that_changed_nothing_escalates_to_foreground() {
    let mut fake = Fake::new();
    fake.background_changed = Some(false);
    let result = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "click", "ref": "n0"}),
        &fake,
    )
    .unwrap();
    assert_eq!(result["delivered"], "foreground");
    assert_eq!(fake.called(), vec!["input_background", "input_foreground"]);
}

#[test]
fn an_unobservable_change_does_not_escalate() {
    // A background attempt that could not tell whether it worked stays background: grabbing focus on
    // a guess is exactly what the design forbids.
    let mut fake = Fake::new();
    fake.background_changed = None;
    let result = execute(
        "desktop_input",
        &json!({"windowId": "w1", "action": "type", "text": "hi"}),
        &fake,
    )
    .unwrap();
    assert_eq!(result["delivered"], "background");
    assert!(result.get("changed").is_none());
    assert_eq!(fake.called(), vec!["input_background"]);
}

#[test]
fn should_escalate_only_on_an_observed_no_change_in_background() {
    assert!(should_escalate(Delivery::Background, Step { changed: Some(false) }));
    assert!(!should_escalate(Delivery::Background, Step { changed: Some(true) }));
    assert!(!should_escalate(Delivery::Background, Step { changed: None }));
    assert!(!should_escalate(Delivery::Foreground, Step { changed: Some(false) }));
}

// ---------------------------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------------------------

#[test]
fn desktop_windows_reports_each_window_with_its_bounds() {
    let fake = Fake::new();
    let result = execute("desktop_windows", &json!({}), &fake).unwrap();
    assert_eq!(result["kind"], "desktop_windows");
    let window = &result["windows"][0];
    assert_eq!(window["id"], "w1");
    assert_eq!(window["app"], "Notes");
    assert_eq!(window["title"], "Untitled");
    assert_eq!(window["pid"], 4242);
    assert_eq!(window["focused"], true);
    assert_eq!(window["bounds"]["width"], 800.0);
    assert_eq!(window["bounds"]["height"], 600.0);
}

#[test]
fn desktop_ax_omits_absent_fields_and_carries_actions() {
    let mut fake = Fake::new();
    fake.nodes.push(AxNode {
        reference: "n1".into(),
        role: "AXStaticText".into(),
        title: None,
        value: Some("hello".into()),
        bounds: None,
        actions: vec![],
    });
    let result = execute("desktop_ax", &json!({"windowId": "w1"}), &fake).unwrap();
    assert_eq!(result["kind"], "desktop_ax");
    assert_eq!(result["truncated"], false);
    let button = &result["nodes"][0];
    assert_eq!(button["role"], "AXButton");
    assert_eq!(button["title"], "Save");
    assert_eq!(button["actions"][0], "AXPress");
    let text = &result["nodes"][1];
    assert_eq!(text["value"], "hello");
    assert!(text.get("title").is_none());
    assert!(text.get("bounds").is_none());
}

#[test]
fn desktop_shot_carries_pixels_and_a_timestamp() {
    let fake = Fake::new();
    let result = execute("desktop_shot", &json!({}), &fake).unwrap();
    assert_eq!(result["kind"], "desktop_shot");
    assert_eq!(result["image"]["mimeType"], "image/png");
    assert_eq!(result["image"]["width"], 1600);
    assert_eq!(result["image"]["height"], 1200);
    assert!(result["capturedAt"].as_str().unwrap().ends_with('Z'));
}

#[test]
fn only_a_desktop_operation_reaches_the_backend() {
    let fake = Fake::new();
    assert_eq!(execute("shell", &json!({}), &fake).unwrap_err(), Failure::new("permission_denied"));
    assert!(fake.called().is_empty());
}

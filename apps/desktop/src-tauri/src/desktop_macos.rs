//! The macOS desktop backend: AXUIElement for reading and acting on controls, CoreGraphics for
//! window listing, screenshots and synthesized input.
//!
//! Every native call is in `apple/DesktopControl.mm` behind a small C ABI (JSON in, JSON out), so
//! this file stays ordinary Rust and the Objective-C++ gets the platform structs. Two system
//! permissions gate it, checked once per call (never proactively prompted): **Accessibility** for
//! reading and input, **Screen Recording** for screenshots. A missing one is reported as
//! `desktop_permission_required` naming which, never a fake success.
//!
//! Input defaults to `CGEventPostToPid` (background, no focus change); foreground is `CGEventPost`
//! after raising the app. An accessibility element is acted on with `AXUIElementPerformAction`, which
//! never moves the cursor or steals focus.

use crate::desktop::{AxNode, AxRead, Backend, Bounds, Failure, Input, InputAction, Platform, Shot, Step, Target, Window};
use serde_json::Value;
use std::ffi::{c_char, c_uint, c_void, CStr, CString};

extern "C" {
    fn yonder_desktop_accessibility_trusted() -> bool;
    fn yonder_desktop_screen_capture_allowed() -> bool;
    fn yonder_desktop_list_windows() -> *mut c_char;
    fn yonder_desktop_read_ax(window_id: *const c_char, depth: c_uint, max_nodes: c_uint) -> *mut c_char;
    fn yonder_desktop_screenshot(window_id: *const c_char) -> *mut c_char;
    fn yonder_desktop_input(json: *const c_char, foreground: bool) -> *mut c_char;
    fn yonder_desktop_free(ptr: *mut c_void);
}

/// Take ownership of a native UTF-8 string, copy it out, and free the native allocation.
fn take(ptr: *mut c_char) -> Result<String, Failure> {
    if ptr.is_null() {
        return Err(Failure::new("operation_failed"));
    }
    let text = unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned();
    unsafe { yonder_desktop_free(ptr.cast()) };
    Ok(text)
}

/// Native code answers with a JSON object; an `error` key is a failure code the caller maps. A
/// missing `permission` is filled by the caller (the C ABI never decides which permission).
fn parse(text: String) -> Result<Value, Failure> {
    let value: Value = serde_json::from_str(&text).map_err(|_| Failure::new("operation_failed"))?;
    if let Some(code) = value.get("error").and_then(Value::as_str) {
        let static_code = match code {
            "window_not_found" => "window_not_found",
            "element_not_found" => "element_not_found",
            "desktop_permission_required" => "desktop_permission_required",
            _ => "operation_failed",
        };
        return Err(Failure::new(static_code));
    }
    Ok(value)
}

fn bounds(value: &Value) -> Option<Bounds> {
    Some(Bounds {
        x: value.get("x")?.as_f64()?,
        y: value.get("y")?.as_f64()?,
        width: value.get("width")?.as_f64()?,
        height: value.get("height")?.as_f64()?,
    })
}

fn cstring(text: &str) -> Result<CString, Failure> {
    CString::new(text).map_err(|_| Failure::new("path_invalid"))
}

fn require_accessibility() -> Result<(), Failure> {
    if unsafe { yonder_desktop_accessibility_trusted() } {
        Ok(())
    } else {
        Err(Failure::permission("accessibility"))
    }
}

fn require_screen_recording() -> Result<(), Failure> {
    if unsafe { yonder_desktop_screen_capture_allowed() } {
        Ok(())
    } else {
        Err(Failure::permission("screen_recording"))
    }
}

/// The macOS `Backend`.
pub struct MacBackend;

impl Backend for MacBackend {
    fn list_windows(&self) -> Result<Vec<Window>, Failure> {
        require_accessibility()?;
        let value = parse(take(unsafe { yonder_desktop_list_windows() })?)?;
        let items = value
            .get("windows")
            .and_then(Value::as_array)
            .ok_or_else(|| Failure::new("operation_failed"))?;
        Ok(items
            .iter()
            .filter_map(|item| {
                Some(Window {
                    id: item.get("id")?.as_str()?.to_owned(),
                    app: item.get("app").and_then(Value::as_str).unwrap_or_default().to_owned(),
                    title: item.get("title").and_then(Value::as_str).unwrap_or_default().to_owned(),
                    pid: item.get("pid").and_then(Value::as_i64).unwrap_or(0) as i32,
                    bounds: bounds(item.get("bounds")?)?,
                    focused: item.get("focused").and_then(Value::as_bool).unwrap_or(false),
                })
            })
            .collect())
    }

    fn read_ax(&self, window_id: &str, depth: u32, max_nodes: u32) -> Result<AxRead, Failure> {
        require_accessibility()?;
        let value = parse(take(unsafe {
            yonder_desktop_read_ax(cstring(window_id)?.as_ptr(), depth, max_nodes)
        })?)?;
        let nodes = value
            .get("nodes")
            .and_then(Value::as_array)
            .ok_or_else(|| Failure::new("operation_failed"))?
            .iter()
            .map(|node| AxNode {
                reference: node.get("ref").and_then(Value::as_str).unwrap_or_default().to_owned(),
                role: node.get("role").and_then(Value::as_str).unwrap_or_default().to_owned(),
                title: node.get("title").and_then(Value::as_str).map(str::to_owned),
                value: node.get("value").and_then(Value::as_str).map(str::to_owned),
                bounds: node.get("bounds").and_then(bounds),
                actions: node
                    .get("actions")
                    .and_then(Value::as_array)
                    .map(|actions| {
                        actions
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::to_owned)
                            .collect()
                    })
                    .unwrap_or_default(),
            })
            .collect();
        Ok(AxRead {
            nodes,
            truncated: value.get("truncated").and_then(Value::as_bool).unwrap_or(false),
        })
    }

    fn screenshot(&self, window_id: Option<&str>) -> Result<Shot, Failure> {
        require_screen_recording()?;
        let id = match window_id {
            Some(id) => cstring(id)?,
            None => CString::new("").map_err(|_| Failure::new("path_invalid"))?,
        };
        let pointer = if window_id.is_some() { id.as_ptr() } else { std::ptr::null() };
        let value = parse(take(unsafe { yonder_desktop_screenshot(pointer) })?)?;
        let image = value.get("image").ok_or_else(|| Failure::new("operation_failed"))?;
        Ok(Shot {
            base64: image.get("base64").and_then(Value::as_str).unwrap_or_default().to_owned(),
            mime_type: image.get("mimeType").and_then(Value::as_str).unwrap_or("image/png").to_owned(),
            width: image.get("width").and_then(Value::as_u64).unwrap_or(0) as u32,
            height: image.get("height").and_then(Value::as_u64).unwrap_or(0) as u32,
        })
    }

    fn input_background(&self, input: &Input) -> Result<Step, Failure> {
        deliver(input, false)
    }

    fn input_foreground(&self, input: &Input) -> Result<Step, Failure> {
        deliver(input, true)
    }
}

/// Serialize the validated input for the native layer and run it. A point click and synthesized
/// keys need Accessibility; an element action does too. `changed` is carried when the native layer
/// could observe it, else absent (never a change it cannot see).
fn deliver(input: &Input, foreground: bool) -> Result<Step, Failure> {
    require_accessibility()?;
    let (action, extra) = match &input.action {
        InputAction::Click(Target::Element { reference }) => ("click", serde_json::json!({"ref": reference})),
        InputAction::Click(Target::Point { x, y }) => ("click", serde_json::json!({"x": x, "y": y})),
        InputAction::Type => ("type", serde_json::json!({"text": input.text.clone().unwrap_or_default()})),
        InputAction::Key => ("key", serde_json::json!({"key": input.key.clone().unwrap_or_default()})),
        InputAction::Scroll => ("scroll", serde_json::json!({"deltaY": input.delta_y.unwrap_or(0.0)})),
        InputAction::Drag(Target::Element { reference }, (to_x, to_y)) => {
            ("drag", serde_json::json!({"ref": reference, "toX": to_x, "toY": to_y}))
        }
        InputAction::Drag(Target::Point { x, y }, (to_x, to_y)) => {
            ("drag", serde_json::json!({"x": x, "y": y, "toX": to_x, "toY": to_y}))
        }
    };
    let mut payload = serde_json::Map::new();
    payload.insert("windowId".into(), Value::String(input.window_id.clone()));
    payload.insert("action".into(), Value::String(action.into()));
    if let Value::Object(map) = extra {
        payload.extend(map);
    }
    let json = serde_json::to_string(&Value::Object(payload)).map_err(|_| Failure::new("operation_failed"))?;
    let value = parse(take(unsafe { yonder_desktop_input(cstring(&json)?.as_ptr(), foreground) })?)?;
    Ok(Step {
        changed: value.get("changed").and_then(Value::as_bool),
    })
}

/// The process-wide backend for this platform, or `None` where desktop control is not offered.
pub fn backend() -> Option<Box<dyn Backend>> {
    if Platform::current().supports_desktop() {
        Some(Box::new(MacBackend))
    } else {
        None
    }
}

//! Desktop control (computer use), the device side (desktop control design, 2026-11-28).
//!
//! Four operations on `computer-control` with `capabilities.desktop`: `desktop_windows` lists
//! on-screen windows, `desktop_ax` reads a window's accessibility tree, `desktop_shot` captures a
//! window (or the whole screen), and `desktop_input` delivers a click, typing, a key, a scroll or a
//! drag — by default *without* taking focus (`delivery: "background"`).
//!
//! Two native channels, chosen per the design: accessibility (macOS AXUIElement, Windows UI
//! Automation), which does not move the cursor or take focus and is the main channel; and image +
//! synthesized input, for surfaces accessibility cannot see. Every operation prefers the background
//! path and only falls back to foreground synthesis when the caller asked for it, or when a
//! background delivery was observed to change nothing.
//!
//! The platform work lives behind [`Backend`]: macOS in `desktop_macos.rs` (Objective-C++ in
//! `apple/DesktopControl.mm`), Windows in `desktop_windows.rs` (UI Automation). Tests use a fake
//! backend, so argument validation, the ref cache, coordinate maths and the delivery choice are all
//! exercised without a real screen.
//!
//! Each call returns the JSON a connector result carries, or a [`Failure`] that becomes the
//! command's `error` (with `permission`, for a missing system permission).

use crate::desktop_time::now_rfc3339;
use serde_json::{json, Value};

/// Default and maximum tree depth for `desktop_ax` (design §5): deep enough for most app windows,
/// bounded so a pathological tree cannot stall the read.
pub const AX_DEFAULT_DEPTH: u64 = 6;
pub const AX_MAX_DEPTH: u64 = 12;
/// Default and maximum node count for `desktop_ax`: a model reads a few hundred nodes, not a whole app.
pub const AX_DEFAULT_NODES: u64 = 400;
pub const AX_MAX_NODES: u64 = 2000;

/// A command's failure, as the connector result reports it. `permission` is set only for
/// `desktop_permission_required`, naming which macOS permission is missing (never fake success).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Failure {
    pub code: &'static str,
    pub permission: Option<&'static str>,
}

impl Failure {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            permission: None,
        }
    }
    pub fn permission(which: &'static str) -> Self {
        Self {
            code: "desktop_permission_required",
            permission: Some(which),
        }
    }
    /// The JSON body the runtime turns into `{ok:false, error, permission?}`.
    #[allow(dead_code)]
    pub fn body(&self) -> Value {
        match self.permission {
            Some(permission) => json!({"error": self.code, "permission": permission}),
            None => json!({"error": self.code}),
        }
    }
}

/// A window-relative point or a size in screen points (before Retina scaling).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Bounds {
    pub fn json(&self) -> Value {
        json!({"x": self.x, "y": self.y, "width": self.width, "height": self.height})
    }
}

/// One top-level window.
#[derive(Debug, Clone, PartialEq)]
pub struct Window {
    pub id: String,
    pub app: String,
    pub title: String,
    pub pid: i32,
    pub bounds: Bounds,
    pub focused: bool,
}

/// One accessibility node.
#[derive(Debug, Clone, PartialEq)]
pub struct AxNode {
    pub reference: String,
    pub role: String,
    pub title: Option<String>,
    pub value: Option<String>,
    pub bounds: Option<Bounds>,
    pub actions: Vec<String>,
}

/// A finished `desktop_ax` read.
#[derive(Debug, Clone, PartialEq)]
pub struct AxRead {
    pub nodes: Vec<AxNode>,
    pub truncated: bool,
}

/// A captured image: base64 bytes, mime type, and pixel dimensions (Retina-aware).
#[derive(Debug, Clone, PartialEq)]
pub struct Shot {
    pub base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

/// What one delivery attempt observed.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Step {
    /// `Some(true/false)` only when the device could actually tell whether the target changed;
    /// `None` when it could not observe it (never reported as a change it cannot see).
    pub changed: Option<bool>,
}

/// What a point action addresses: an accessibility element, or a window-relative point.
#[derive(Debug, Clone, PartialEq)]
pub enum Target {
    Element { reference: String },
    Point { x: f64, y: f64 },
}

/// A validated `desktop_input` request handed to the backend.
#[derive(Debug, Clone, PartialEq)]
pub struct Input {
    pub window_id: String,
    pub action: InputAction,
    pub text: Option<String>,
    pub key: Option<String>,
    pub delta_y: Option<f64>,
}
#[derive(Debug, Clone, PartialEq)]
pub enum InputAction {
    Click(Target),
    Type,
    Key,
    Scroll,
    Drag(Target, (f64, f64)),
}

/// `delivery` as the caller asked for it; the effective delivery is decided by [`plan`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Background,
    Foreground,
}

/// Which platform surface this build runs on. A phone or web build has none; desktop control is
/// offered only on macOS and Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum Platform {
    Macos,
    Windows,
    Other,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "macos")]
        {
            return Platform::Macos;
        }
        #[cfg(windows)]
        {
            return Platform::Windows;
        }
        #[allow(unreachable_code)]
        Platform::Other
    }
    /// Desktop control is only meaningful where a native backend exists (design §5).
    pub fn supports_desktop(self) -> bool {
        matches!(self, Platform::Macos | Platform::Windows)
    }
}

/// The native surface, one implementation per platform and a fake in tests. Every method returns
/// the raw data or a [`Failure`]; argument validation happens before a method is ever called.
pub trait Backend: Send + Sync {
    fn list_windows(&self) -> Result<Vec<Window>, Failure>;
    fn read_ax(&self, window_id: &str, depth: u32, max_nodes: u32) -> Result<AxRead, Failure>;
    fn screenshot(&self, window_id: Option<&str>) -> Result<Shot, Failure>;
    /// Deliver without taking focus. The default path.
    fn input_background(&self, input: &Input) -> Result<Step, Failure>;
    /// Deliver by moving the real cursor / synthesizing at the front. Only on request or escalation.
    fn input_foreground(&self, input: &Input) -> Result<Step, Failure>;
}

// ---------------------------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------------------------

fn require_window_id(args: &Value) -> Result<String, Failure> {
    args.get("windowId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty() && id.len() <= 64)
        .map(str::to_owned)
        .ok_or_else(|| Failure::new("path_invalid"))
}

fn bounded_u64(args: &Value, key: &str, default: u64, max: u64) -> Result<u32, Failure> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(default as u32),
        Some(value) => {
            let n = value.as_u64().ok_or_else(|| Failure::new("path_invalid"))?;
            if n == 0 || n > max {
                return Err(Failure::new("path_invalid"));
            }
            Ok(n as u32)
        }
    }
}

fn coord(args: &Value, key: &str) -> Result<f64, Failure> {
    args.get(key)
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite())
        .ok_or_else(|| Failure::new("path_invalid"))
}

fn delivery(args: &Value) -> Result<Delivery, Failure> {
    match args.get("delivery") {
        None | Some(Value::Null) => Ok(Delivery::Background),
        Some(Value::String(value)) if value == "background" => Ok(Delivery::Background),
        Some(Value::String(value)) if value == "foreground" => Ok(Delivery::Foreground),
        Some(_) => Err(Failure::new("path_invalid")),
    }
}

/// Validate a `desktop_input` call and build the backend request. Every field rule mirrors what the
/// tool schema promises: `click` needs a ref or an x/y pair, `type` needs text, `key` needs a key,
/// `scroll` needs `deltaY`, `drag` needs a start and an end, and `delivery` is `background` unless
/// the caller named `foreground`.
pub fn parse_input(args: &Value) -> Result<(Input, Delivery), Failure> {
    let window_id = require_window_id(args)?;
    let valid_ref = |v: Option<&Value>| v.and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_owned);
    let action = args
        .get("action")
        .and_then(Value::as_str)
        .ok_or_else(|| Failure::new("path_invalid"))?;
    let target = || match valid_ref(args.get("ref")) {
        Some(reference) => Ok(Target::Element { reference }),
        None => Ok(Target::Point {
            x: coord(args, "x")?,
            y: coord(args, "y")?,
        }),
    };
    let input = match action {
        "click" => Input {
            window_id: window_id.clone(),
            action: InputAction::Click(target()?),
            text: None,
            key: None,
            delta_y: None,
        },
        "type" => Input {
            window_id: window_id.clone(),
            action: InputAction::Type,
            text: Some(
                args.get("text")
                    .and_then(Value::as_str)
                    .filter(|t| !t.is_empty())
                    .ok_or_else(|| Failure::new("path_invalid"))?
                    .to_owned(),
            ),
            key: None,
            delta_y: None,
        },
        "key" => Input {
            window_id: window_id.clone(),
            action: InputAction::Key,
            text: None,
            key: Some(
                args.get("key")
                    .and_then(Value::as_str)
                    .filter(|k| !k.is_empty())
                    .ok_or_else(|| Failure::new("path_invalid"))?
                    .to_owned(),
            ),
            delta_y: None,
        },
        "scroll" => Input {
            window_id: window_id.clone(),
            action: InputAction::Scroll,
            text: None,
            key: None,
            delta_y: Some(coord(args, "deltaY")?),
        },
        "drag" => {
            let to = (coord(args, "toX")?, coord(args, "toY")?);
            Input {
                window_id: window_id.clone(),
                action: InputAction::Drag(target()?, to),
                text: None,
                key: None,
                delta_y: None,
            }
        }
        _ => return Err(Failure::new("path_invalid")),
    };
    Ok((input, delivery(args)?))
}

// ---------------------------------------------------------------------------------------------
// Coordinate maths (Retina and window-relative → screen)
// ---------------------------------------------------------------------------------------------

/// A window-relative point (as `desktop_windows`/`desktop_shot` present the window) → a global
/// screen point, by adding the window's origin. AX bounds and synthesized events both use the same
/// top-left-origin screen space, so no flip is needed; only the origin offset.
#[allow(dead_code)]
pub fn to_screen(origin: (f64, f64), local: (f64, f64)) -> (f64, f64) {
    (origin.0 + local.0, origin.1 + local.1)
}

/// A screenshot's pixel size for a window measured in points, at a Retina backing scale. A 2×
/// display makes an 800×600-point window an 1600×1200-pixel image; the result carries these pixel
/// dimensions so a model that reasons in image pixels can map back. `scale` is clamped to >= 1 so a
/// bad read never reports a zero-size image.
#[allow(dead_code)]
pub fn pixel_size(points: (f64, f64), scale: f64) -> (u32, u32) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    (
        (points.0 * scale).round().max(0.0) as u32,
        (points.1 * scale).round().max(0.0) as u32,
    )
}

/// An image pixel → a window-relative point, dividing by the backing scale. Used when a model hands
/// back a coordinate measured on the screenshot rather than one from an AX node.
#[allow(dead_code)]
pub fn pixel_to_point(pixel: (f64, f64), scale: f64) -> (f64, f64) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    (pixel.0 / scale, pixel.1 / scale)
}

// ---------------------------------------------------------------------------------------------
// Delivery choice
// ---------------------------------------------------------------------------------------------

/// Whether a background delivery that observed no change should be retried at the front. The design
/// keeps the background path the default and only escalates when the caller asked for the front
/// (handled by `plan`) or when a background attempt genuinely changed nothing — a `None` observation
/// is "could not tell", which never escalates (design §3.4: report honestly, do not silently grab
/// focus on a guess).
pub fn should_escalate(requested: Delivery, observed: Step) -> bool {
    requested == Delivery::Background && observed.changed == Some(false)
}

/// The first delivery to attempt for a request: the caller's own choice.
pub fn plan(requested: Delivery) -> Delivery {
    requested
}

// ---------------------------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------------------------

/// Run one desktop operation against `backend`. Validation happens here so the backend only ever
/// sees well-formed requests; a `ref` that no read produced becomes `element_not_found` from the
/// backend, never a panic.
pub fn execute(operation: &str, args: &Value, backend: &dyn Backend) -> Result<Value, Failure> {
    match operation {
        "desktop_windows" => {
            let windows = backend.list_windows()?;
            let items: Vec<Value> = windows
                .iter()
                .map(|w| {
                    json!({
                        "id": w.id,
                        "app": w.app,
                        "title": w.title,
                        "pid": w.pid,
                        "bounds": w.bounds.json(),
                        "focused": w.focused,
                    })
                })
                .collect();
            Ok(json!({"kind": "desktop_windows", "windows": items}))
        }
        "desktop_ax" => {
            let window_id = require_window_id(args)?;
            let depth = bounded_u64(args, "depth", AX_DEFAULT_DEPTH, AX_MAX_DEPTH)?;
            let max_nodes = bounded_u64(args, "maxNodes", AX_DEFAULT_NODES, AX_MAX_NODES)?;
            let read = backend.read_ax(&window_id, depth, max_nodes)?;
            let nodes: Vec<Value> = read
                .nodes
                .iter()
                .map(|n| {
                    let mut obj = serde_json::Map::new();
                    obj.insert("ref".into(), json!(n.reference));
                    obj.insert("role".into(), json!(n.role));
                    if let Some(title) = &n.title {
                        obj.insert("title".into(), json!(title));
                    }
                    if let Some(value) = &n.value {
                        obj.insert("value".into(), json!(value));
                    }
                    if let Some(bounds) = &n.bounds {
                        obj.insert("bounds".into(), bounds.json());
                    }
                    obj.insert("actions".into(), json!(n.actions));
                    Value::Object(obj)
                })
                .collect();
            Ok(json!({"kind": "desktop_ax", "nodes": nodes, "truncated": read.truncated}))
        }
        "desktop_shot" => {
            let window_id = args
                .get("windowId")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty());
            let shot = backend.screenshot(window_id)?;
            Ok(json!({
                "kind": "desktop_shot",
                "image": {
                    "base64": shot.base64,
                    "mimeType": shot.mime_type,
                    "width": shot.width,
                    "height": shot.height,
                },
                "capturedAt": now_rfc3339(),
            }))
        }
        "desktop_input" => {
            let (input, requested) = parse_input(args)?;
            let delivered = match plan(requested) {
                Delivery::Foreground => {
                    let step = backend.input_foreground(&input)?;
                    (Delivery::Foreground, step.changed)
                }
                Delivery::Background => {
                    let step = backend.input_background(&input)?;
                    if should_escalate(requested, step) {
                        let front = backend.input_foreground(&input)?;
                        (Delivery::Foreground, front.changed)
                    } else {
                        (Delivery::Background, step.changed)
                    }
                }
            };
            let mut obj = serde_json::Map::new();
            obj.insert("kind".into(), json!("desktop_input"));
            obj.insert("ok".into(), json!(true));
            obj.insert(
                "delivered".into(),
                json!(match delivered.0 {
                    Delivery::Background => "background",
                    Delivery::Foreground => "foreground",
                }),
            );
            if let Some(changed) = delivered.1 {
                obj.insert("changed".into(), json!(changed));
            }
            Ok(Value::Object(obj))
        }
        _ => Err(Failure::new("permission_denied")),
    }
}

#[cfg(test)]
#[path = "desktop_test.rs"]
mod tests;

//! The Windows `SendInput` path and its primitives: the foreground delivery (real cursor move +
//! click, unicode typing, key down/up) and the small Win32 input helpers the background path also
//! reuses (client-coordinate packing, screen-absolute coordinates, key-name → virtual-key). Split out
//! of `desktop_windows.rs` so each file stays one responsibility (and under the file-length limit).
//!
//! The design keeps this path last (§3.4): `deliver` in the parent tries the UI Automation pattern
//! and `PostMessageW` first, and only reaches here when the caller asked for the foreground.

use super::window_bounds;
use crate::desktop::{Failure, Input, InputAction, Step, Target};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS,
    VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

/// `SendInput` path: real cursor move + click, unicode typing, key down/up. Only when asked.
pub(super) fn foreground_input(input: &Input, hwnd: HWND) -> Result<Step, Failure> {
    let bounds = window_bounds(hwnd);
    match &input.action {
        InputAction::Click(target) | InputAction::Drag(target, _) => {
            let (x, y) = match target {
                Target::Point { x, y } => (*x + bounds.x, *y + bounds.y),
                Target::Element { .. } => return Err(Failure::new("element_not_found")),
            };
            let (sx, sy) = screen_absolute(x, y);
            send_mouse(&[mouse_move(sx, sy), mouse(MOUSEEVENTF_LEFTDOWN), mouse(MOUSEEVENTF_LEFTUP)]);
            if let InputAction::Drag(_, to) = &input.action {
                let (sx2, sy2) = screen_absolute(to.0 + bounds.x, to.1 + bounds.y);
                send_mouse(&[mouse_move(sx2, sy2), mouse(MOUSEEVENTF_LEFTUP)]);
            }
            Ok(Step { changed: None })
        }
        InputAction::Type => {
            let text = input.text.clone().unwrap_or_default();
            let mut inputs = Vec::new();
            for unit in text.encode_utf16() {
                inputs.push(keyboard_key(0, unit, KEYEVENTF_UNICODE));
                inputs.push(keyboard_key(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
            send(&inputs);
            Ok(Step { changed: None })
        }
        InputAction::Key => {
            let vk = key_code(input.key.as_deref().unwrap_or("")).ok_or_else(|| Failure::new("path_invalid"))?;
            send(&[keyboard_key(vk, 0, KEYBD_EVENT_FLAGS(0)), keyboard_key(vk, 0, KEYEVENTF_KEYUP)]);
            Ok(Step { changed: None })
        }
        InputAction::Scroll => {
            let delta = -(input.delta_y.unwrap_or(0.0) as i32) * 120;
            let mut wheel = mouse(MOUSEEVENTF_WHEEL);
            wheel.Anonymous.mi.mouseData = delta as u32;
            send(&[wheel]);
            Ok(Step { changed: None })
        }
    }
}

/// A window-relative point → client coordinates. `GetWindowRect` and the client area share an origin
/// for the common case; the point rounds to whole pixels.
pub(super) fn client_point(_hwnd: HWND, x: f64, y: f64) -> (i32, i32) {
    (x.round() as i32, y.round() as i32)
}

/// Two signed 16-bit halves in one `LPARAM`, the form `WM_LBUTTONDOWN`/`UP` read a client point from.
pub(super) fn pack(x: i32, y: i32) -> LPARAM {
    LPARAM((((y as u32) << 16) | (x as u32 & 0xffff)) as isize)
}

/// Screen pixels → the 0..65535 absolute space `MOUSEEVENTF_ABSOLUTE` expects.
fn screen_absolute(x: f64, y: f64) -> (i32, i32) {
    const W: f64 = 65535.0;
    let cx = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let cy = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    ((x / cx as f64 * W).round() as i32, (y / cy as f64 * W).round() as i32)
}

fn mouse(flags: MOUSE_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        },
    }
}

fn mouse_move(x: i32, y: i32) -> INPUT {
    let mut input = mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE);
    input.Anonymous.mi.dx = x;
    input.Anonymous.mi.dy = y;
    input
}

fn keyboard_key(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        },
    }
}

fn send_mouse(inputs: &[INPUT]) {
    send(inputs);
}

fn send(inputs: &[INPUT]) {
    if !inputs.is_empty() {
        unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
    }
}

/// A key/chord name → virtual-key code. A single character uses `VkKeyScanW`; named keys map directly.
pub(super) fn key_code(key: &str) -> Option<u16> {
    let lower = key.to_lowercase();
    let base = lower.rsplit('+').next().unwrap_or(&lower);
    let named = match base {
        "return" | "enter" => Some(0x0D),
        "tab" => Some(0x09),
        "space" => Some(0x20),
        "escape" | "esc" => Some(0x1B),
        "backspace" | "delete" => Some(0x08),
        "up" => Some(0x26),
        "down" => Some(0x28),
        "left" => Some(0x25),
        "right" => Some(0x27),
        "home" => Some(0x24),
        "end" => Some(0x23),
        "pageup" => Some(0x21),
        "pagedown" => Some(0x22),
        _ => None,
    };
    if named.is_some() {
        return named;
    }
    let mut chars = base.chars();
    let c = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    let encoded = unsafe { windows::Win32::UI::Input::KeyboardAndMouse::VkKeyScanW(c as u16) };
    if encoded == -1 {
        return None;
    }
    Some((encoded & 0xff) as u16)
}

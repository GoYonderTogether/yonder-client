//! The Windows desktop backend: UI Automation for the control tree and patterns, Win32 messaging and
//! SendInput for input, and GDI + PrintWindow for window capture.
//!
//! Same contract as the macOS backend ([`crate::desktop::Backend`]). Input order follows the design
//! (§3.4): UI Automation pattern (Invoke / ValuePattern / SetValue) first, then `PostMessageW` to the
//! target window, and only `SendInput` when the caller asked for the front (`delivery: foreground`).
//! A window id is its `HWND`, so it survives across the separate `desktop_ax` / `desktop_input` calls
//! without a cached registry; UIA elements are cached per read by ref, under a process-wide COM MTA.
//!
//! This module stays self-contained (only `crate::desktop`'s plain types), so it can be compiled on
//! its own against `x86_64-pc-windows-msvc` with a small stub crate — see `windows-check/` and
//! `docs/specs/connectors/desktop.md`.

use crate::desktop::{
    AxNode, AxRead, Backend, Bounds, Failure, Input, InputAction, Shot, Step, Target, Window,
};
use std::cell::RefCell;
use windows::core::BSTR;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
    IUIAutomationTreeWalker, IUIAutomationValuePattern, UIA_InvokePatternId, UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, PostMessageW, GWL_EXSTYLE, GW_OWNER,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, WM_CHAR, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MOUSEWHEEL, WS_EX_TOOLWINDOW,
};

// The foreground `SendInput` path and its input primitives live in their own file.
#[path = "desktop_windows_input.rs"]
mod input;
use input::{client_point, foreground_input, key_code, pack};

thread_local! {
    /// UIA elements cached by ref for the current read. COM objects are apartment-bound (not `Send`),
    /// so this is thread-local: a read and a later input on the same desktop worker thread share the
    /// refs; another thread starts empty, where a stale ref is `element_not_found`.
    static REFS: RefCell<Vec<IUIAutomationElement>> = const { RefCell::new(Vec::new()) };
}

fn uia() -> Result<IUIAutomation, Failure> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).map_err(|_| Failure::new("operation_failed"))
    }
}

fn hwnd_of(window_id: &str) -> Result<HWND, Failure> {
    let raw: u32 = window_id.parse().map_err(|_| Failure::new("window_not_found"))?;
    if raw == 0 {
        return Err(Failure::new("window_not_found"));
    }
    Ok(HWND(raw as *mut core::ffi::c_void))
}

/// A window's id as `desktop_windows` prints it (the HWND value), for the focused comparison.
fn hwnd_id(hwnd: HWND) -> String {
    (hwnd.0 as usize as u32).to_string()
}

fn front_id(hwnd: HWND) -> Option<String> {
    (!hwnd.0.is_null()).then(|| hwnd_id(hwnd))
}

fn bstr(text: &BSTR) -> String {
    text.to_string()
}

fn exe_name(pid: u32) -> String {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, Default::default(), windows::core::PWSTR(buffer.as_mut_ptr()), &mut size);
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        if ok.is_err() {
            return String::new();
        }
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        path.rsplit(['\\', '/']).next().unwrap_or(&path).trim_end_matches(".exe").to_string()
    }
}

fn window_title(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..len.max(0) as usize])
}

fn window_bounds(hwnd: HWND) -> Bounds {
    let mut rect = windows::Win32::Foundation::RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return Bounds { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
    }
    Bounds {
        x: rect.left as f64,
        y: rect.top as f64,
        width: (rect.right - rect.left) as f64,
        height: (rect.bottom - rect.top) as f64,
    }
}

/// The Windows `Backend`.
pub struct WindowsBackend;

impl Backend for WindowsBackend {
    fn list_windows(&self) -> Result<Vec<Window>, Failure> {
        let mut found: Vec<Window> = Vec::new();
        let front = unsafe { GetForegroundWindow() };
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut found as *mut Vec<Window> as isize));
        }
        for window in &mut found {
            window.focused = Some(&window.id) == front_id(front).as_ref();
        }
        Ok(found)
    }

    fn read_ax(&self, window_id: &str, depth: u32, max_nodes: u32) -> Result<AxRead, Failure> {
        let hwnd = hwnd_of(window_id)?;
        let automation = uia()?;
        let root = unsafe { automation.ElementFromHandle(hwnd) }.map_err(|_| Failure::new("window_not_found"))?;
        let walker = unsafe { automation.ControlViewWalker() }.map_err(|_| Failure::new("operation_failed"))?;
        let mut nodes = Vec::new();
        let mut truncated = false;
        REFS.with(|cache| {
            let mut cache = cache.borrow_mut();
            cache.clear();
            walk(&walker, &root, 0, depth, max_nodes, &mut nodes, &mut truncated, &mut cache);
        });
        Ok(AxRead { nodes, truncated })
    }

    fn screenshot(&self, window_id: Option<&str>) -> Result<Shot, Failure> {
        let hwnd = match window_id {
            Some(id) => Some(hwnd_of(id)?),
            None => None,
        };
        capture(hwnd)
    }

    fn input_background(&self, input: &Input) -> Result<Step, Failure> {
        deliver(input, false)
    }

    fn input_foreground(&self, input: &Input) -> Result<Step, Failure> {
        deliver(input, true)
    }
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let found = &mut *(lparam.0 as *mut Vec<Window>);
    if !window_eligible(hwnd) {
        return true.into();
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    found.push(Window {
        id: hwnd_id(hwnd),
        app: exe_name(pid),
        title: window_title(hwnd),
        pid: pid as i32,
        bounds: window_bounds(hwnd),
        focused: false,
    });
    true.into()
}

/// A top-level window worth listing: visible, titled (or an app window), no owner, not a tool window.
fn window_eligible(hwnd: HWND) -> bool {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let owner = GetWindow(hwnd, GW_OWNER);
        if !owner.map(|o| o.0.is_null()).unwrap_or(false) {
            return false;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW.0 != 0 {
            return false;
        }
        // UIA can reach an untitled window too; `IsWindowVisible` already dropped hidden ones.
        true
    }
}

#[allow(clippy::too_many_arguments)]
fn walk(
    walker: &IUIAutomationTreeWalker,
    element: &IUIAutomationElement,
    depth: u32,
    max_depth: u32,
    max_nodes: u32,
    nodes: &mut Vec<AxNode>,
    truncated: &mut bool,
    cache: &mut Vec<IUIAutomationElement>,
) {
    if nodes.len() as u32 >= max_nodes {
        *truncated = true;
        return;
    }
    nodes.push(node_of(element, &format!("n{}", cache.len())));
    cache.push(element.clone());
    if depth >= max_depth {
        return;
    }
    let mut child = unsafe { walker.GetFirstChildElement(element) }.ok();
    while let Some(current) = child {
        if nodes.len() as u32 >= max_nodes {
            *truncated = true;
            break;
        }
        walk(walker, &current, depth + 1, max_depth, max_nodes, nodes, truncated, cache);
        child = unsafe { walker.GetNextSiblingElement(&current) }.ok();
    }
}

fn node_of(element: &IUIAutomationElement, reference: &str) -> AxNode {
    let role = unsafe { element.CurrentControlType() }
        .map(|id| control_role(id.0))
        .unwrap_or("unknown")
        .to_string();
    let title = unsafe { element.CurrentName() }.ok().map(|n| bstr(&n)).filter(|s| !s.is_empty());
    let value = unsafe {
        element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            .ok()
            .and_then(|p| p.CurrentValue().ok())
            .map(|v| bstr(&v))
    }
    .filter(|s| !s.is_empty());
    let bounds = unsafe { element.CurrentBoundingRectangle() }.ok().map(|r| Bounds {
        x: r.left as f64,
        y: r.top as f64,
        width: (r.right - r.left) as f64,
        height: (r.bottom - r.top) as f64,
    });
    let mut actions = Vec::new();
    if unsafe { element.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId) }.is_ok() {
        actions.push("invoke".to_string());
    }
    if value.is_some() {
        actions.push("set_value".to_string());
    }
    AxNode { reference: reference.to_string(), role, title, value, bounds, actions }
}

fn control_role(id: i32) -> &'static str {
    use windows::Win32::UI::Accessibility::*;
    match id {
        x if x == UIA_ButtonControlTypeId.0 => "button",
        x if x == UIA_EditControlTypeId.0 => "edit",
        x if x == UIA_TextControlTypeId.0 => "text",
        x if x == UIA_WindowControlTypeId.0 => "window",
        x if x == UIA_PaneControlTypeId.0 => "pane",
        x if x == UIA_DocumentControlTypeId.0 => "document",
        x if x == UIA_ListItemControlTypeId.0 => "list_item",
        x if x == UIA_CheckBoxControlTypeId.0 => "check_box",
        x if x == UIA_ComboBoxControlTypeId.0 => "combo_box",
        _ => "control",
    }
}

/// Capture one window (or the whole screen) as PNG bytes.
fn capture(hwnd: Option<HWND>) -> Result<Shot, Failure> {
    unsafe {
        let (source, bounds) = match hwnd {
            Some(window) => (GetDC(Some(window)), window_bounds(window)),
            None => (
                GetDC(None),
                Bounds {
                    x: 0.0,
                    y: 0.0,
                    width: windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(SM_CXVIRTUALSCREEN) as f64,
                    height: windows::Win32::UI::WindowsAndMessaging::GetSystemMetrics(SM_CYVIRTUALSCREEN) as f64,
                },
            ),
        };
        if source.is_invalid() {
            return Err(Failure::permission("screen_recording"));
        }
        let width = bounds.width.max(1.0) as i32;
        let height = bounds.height.max(1.0) as i32;
        let memory = CreateCompatibleDC(Some(source));
        let bitmap = CreateCompatibleBitmap(source, width, height);
        let previous = SelectObject(memory, bitmap.into());
        // BitBlt copies the window's pixels for a full-screen grab; PrintWindow is preferred for a
        // single window so an occluded window still renders itself.
        if let Some(window) = hwnd {
            let _ = windows::Win32::Storage::Xps::PrintWindow(window, memory, Default::default());
        } else {
            let _ = BitBlt(memory, 0, 0, width, height, Some(source), 0, 0, SRCCOPY);
        }
        let mut info = BITMAPINFO::default();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height; // top-down
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB.0;
        let mut buffer = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(memory, bitmap, 0, height as u32, Some(buffer.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
        SelectObject(memory, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(hwnd.or(None), source);
        if lines == 0 {
            return Err(Failure::new("operation_failed"));
        }
        let base64 = encode_png_base64(&buffer, width as u32, height as u32)?;
        Ok(Shot { base64, mime_type: "image/png".into(), width: width as u32, height: height as u32 })
    }
}

/// BGRA frame → PNG → base64, via the `png` crate already in the dependency tree.
fn encode_png_base64(bgra: &[u8], width: u32, height: u32) -> Result<String, Failure> {
    let mut pixels = Vec::with_capacity(bgra.len());
    for chunk in bgra.chunks_exact(4) {
        let alpha = chunk[3];
        // PrintWindow leaves alpha at 0 for opaque content; treat a zero alpha as opaque.
        let a = if alpha == 0 { 255 } else { alpha };
        pixels.extend_from_slice(&[chunk[2], chunk[1], chunk[0], a]);
    }
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|_| Failure::new("operation_failed"))?;
        writer.write_image_data(&pixels).map_err(|_| Failure::new("operation_failed"))?;
    }
    Ok(base64(&out))
}

/// Standard base64, no padding-free variants needed.
fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        out.push(TABLE[(b[0] >> 2) as usize] as char);
        out.push(TABLE[(((b[0] & 0x03) << 4) | (b[1] >> 4)) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[(((b[1] & 0x0f) << 2) | (b[2] >> 6)) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(b[2] & 0x3f) as usize] as char } else { '=' });
    }
    out
}

/// Deliver input. Background: a UIA pattern, else `PostMessageW`. Foreground: `SendInput`.
fn deliver(input: &Input, foreground: bool) -> Result<Step, Failure> {
    let hwnd = hwnd_of(&input.window_id)?;
    if foreground {
        return foreground_input(input, hwnd);
    }
    match &input.action {
        InputAction::Click(Target::Element { reference }) => {
            let element = cached_element(reference)?;
            invoke(&element)?;
            Ok(Step { changed: Some(true) })
        }
        InputAction::Click(Target::Point { x, y }) => {
            let (cx, cy) = client_point(hwnd, *x, *y);
            let lparam = pack(cx, cy);
            unsafe {
                let _ = PostMessageW(Some(hwnd), WM_LBUTTONDOWN, Default::default(), lparam);
                let _ = PostMessageW(Some(hwnd), WM_LBUTTONUP, Default::default(), lparam);
            }
            Ok(Step { changed: None })
        }
        InputAction::Type => {
            let text = input.text.clone().unwrap_or_default();
            for unit in text.encode_utf16() {
                unsafe {
                    let _ = PostMessageW(Some(hwnd), WM_CHAR, windows::Win32::Foundation::WPARAM(unit as usize), Default::default());
                }
            }
            Ok(Step { changed: None })
        }
        InputAction::Key => {
            let vk = key_code(input.key.as_deref().unwrap_or("")).ok_or_else(|| Failure::new("path_invalid"))?;
            unsafe {
                let _ = PostMessageW(Some(hwnd), WM_KEYDOWN, windows::Win32::Foundation::WPARAM(vk as usize), Default::default());
                let _ = PostMessageW(Some(hwnd), WM_KEYUP, windows::Win32::Foundation::WPARAM(vk as usize), Default::default());
            }
            Ok(Step { changed: None })
        }
        InputAction::Scroll => {
            let delta = -(input.delta_y.unwrap_or(0.0) as i32) * 120;
            let wparam = ((delta as u32) << 16) as usize;
            unsafe {
                let _ = PostMessageW(Some(hwnd), WM_MOUSEWHEEL, windows::Win32::Foundation::WPARAM(wparam), Default::default());
            }
            Ok(Step { changed: None })
        }
        InputAction::Drag(Target::Point { x, y }, to) => {
            let (sx, sy) = client_point(hwnd, *x, *y);
            let (ex, ey) = client_point(hwnd, to.0, to.1);
            unsafe {
                let _ = PostMessageW(Some(hwnd), WM_LBUTTONDOWN, Default::default(), pack(sx, sy));
                let _ = PostMessageW(Some(hwnd), WM_LBUTTONUP, Default::default(), pack(ex, ey));
            }
            Ok(Step { changed: None })
        }
        InputAction::Drag(Target::Element { .. }, _) => Err(Failure::new("element_not_found")),
    }
}

fn cached_element(reference: &str) -> Result<IUIAutomationElement, Failure> {
    let index: usize = reference
        .strip_prefix('n')
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| Failure::new("element_not_found"))?;
    REFS.with(|cache| cache.borrow().get(index).cloned().ok_or_else(|| Failure::new("element_not_found")))
}

fn invoke(element: &IUIAutomationElement) -> Result<(), Failure> {
    unsafe {
        let pattern: IUIAutomationInvokePattern = element
            .GetCurrentPatternAs(UIA_InvokePatternId)
            .map_err(|_| Failure::new("element_not_found"))?;
        pattern.Invoke().map_err(|_| Failure::new("operation_failed"))
    }
}

impl std::fmt::Debug for WindowsBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("WindowsBackend")
    }
}

/// The unused import guard for the trait path in stub builds.
#[allow(dead_code)]
fn _touch(_: &dyn Backend) {}

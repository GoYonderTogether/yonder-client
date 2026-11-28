//! The Windows-specific parts of browser control: where `bsk` is installed by default, how a child is
//! ended, and whether a program resolves.
//!
//! This module stays free of `crate::` types on purpose: it is the half that cannot be compiled on a
//! Mac, so it doubles as the input to a standalone `cargo check --target x86_64-pc-windows-msvc` that
//! pulls only `windows-sys` (no C build, no SDK headers). Keep it self-contained.
//!
//! Two Windows facts it encodes:
//!
//! * The official installer (`install.ps1`) puts `bsk.exe` in `$HOME\.local\bin`, which is not on
//!   PATH on a fresh machine; a running app also keeps whatever PATH it started with. So the device
//!   checks that well-known directory even when PATH does not have it.
//! * `bsk` is a console subsystem program. Started from a GUI app it would flash a console window
//!   unless it is created with `CREATE_NO_WINDOW`.

use std::path::{Path, PathBuf};

/// The creation flag that keeps a console child from opening a window when the app spawns it.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The executable name the installer writes.
pub const PROGRAM: &str = "bsk.exe";

/// The directory `install.ps1` writes to by default, when `$HOME` is known.
pub fn install_dir(home: Option<&Path>) -> Option<PathBuf> {
    home.map(|home| home.join(".local").join("bin"))
}

/// The first `bsk.exe` this device has: `$YONDER_BSK` when set, the well-known install directory, or
/// a bare `bsk.exe` left to PATH resolution.
pub fn program(configured: Option<&str>, home: Option<&Path>) -> String {
    if let Some(value) = configured.filter(|value| !value.trim().is_empty()) {
        return value.to_owned();
    }
    if let Some(candidate) = install_dir(home).map(|dir| dir.join(PROGRAM)) {
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    PROGRAM.to_owned()
}

/// End a child and everything it left running, by pid. `bsk` itself opens no children of its own —
/// the daemon is detached and must survive — but `/T` makes that explicit.
pub fn kill(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Whether a process id is alive right now. `OpenProcess` with the query-only right succeeds for a
/// running process and fails once it is gone; a denied open (a process this user may not touch) is
/// still evidence the pid names something, so it counts as alive.
pub fn alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    if pid == 0 {
        return false;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code: u32 = 0;
        let queried = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        queried != 0 && code == STILL_ACTIVE as u32
    }
}
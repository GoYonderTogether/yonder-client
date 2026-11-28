//! The Windows half of administrator execution: `ShellExecuteExW` with the `runas` verb, so the
//! system raises UAC and the owner approves at this computer (supplement §2, the Windows bullet).
//!
//! An elevated process cannot inherit the client's pipes, so — exactly like the ordinary runner —
//! the command is written to a file and its output and exit code go to files next to it. The command
//! never enters a command line: PowerShell runs `command.ps1` by path (`-File`), so nothing the model
//! wrote is re-quoted by the Windows command-line router. `elevated.cmd` writes `elevated.marker` as its
//! first action (proof the owner approved UAC), records its own pid in `elevated.pid`, runs the command
//! with both streams to the log, records `%ERRORLEVEL%` in the `.exit` file, and always exits 0 so the
//! elevated console closes cleanly.
//!
//! `ShellExecuteExW` blocks until the owner answers UAC and returns 0 with `ERROR_CANCELLED` when they
//! decline, so its return value is the whole approval answer: a pid means started, `ERROR_CANCELLED`
//! means the owner refused, anything else means this device could not raise the prompt.
//!
//! This module stays free of `crate::` types on purpose: it is the part that cannot be compiled on a
//! Mac, so it doubles as the input to a standalone `cargo check --target x86_64-pc-windows-msvc` that
//! pulls only `windows-sys` (no C build, no SDK headers). Keep it self-contained.

use std::path::Path;

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_CANCELLED};
use windows_sys::Win32::System::Threading::GetProcessId;
use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

/// Why an elevated command did not start. The caller maps these onto the terminal's error codes.
pub enum Failure {
    /// The owner declined the UAC prompt (`ERROR_CANCELLED`) → `elevation_denied`.
    Denied,
    /// No interactive session, files could not be written, or any other launch failure →
    /// `elevation_unavailable`.
    Unavailable,
}

/// Write the command wrapper into the job directory: `command.ps1` (the raw command, byte-for-byte
/// after a UTF-8 BOM, which is what PowerShell reads as UTF-8) and `elevated.cmd`. `elevated.cmd` is
/// generated with the job's absolute paths baked in, so the elevated console needs no arguments.
///
/// The process `ShellExecuteExW` returns is this `cmd.exe`, and `taskkill /T /PID <pid>` ends the
/// wrapper and its PowerShell child together, so no separate pid file is needed on Windows.
fn write_wrapper(
    job_dir: &Path,
    command: &str,
    log: &Path,
    exit: &Path,
    cwd: &Path,
) -> std::io::Result<()> {
    let script = job_dir.join("command.ps1");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(command.as_bytes());
    std::fs::write(&script, bytes)?;

    let marker = job_dir.join("elevated.marker");
    let wrapper = job_dir.join("elevated.cmd");
    let body = format!(
        "@echo off\r\n\
         > \"{marker}\" echo elevated\r\n\
         cd /d \"{cwd}\"\r\n\
         powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{script}\" > \"{log}\" 2>&1\r\n\
         > \"{exit}\" echo %ERRORLEVEL%\r\n\
         exit /b 0\r\n",
        marker = marker.display(),
        cwd = cwd.display(),
        script = script.display(),
        log = log.display(),
        exit = exit.display(),
    );
    std::fs::write(&wrapper, body)?;
    Ok(())
}

/// A null-terminated UTF-16 buffer for a `windows-sys` wide-string argument.
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Start `elevated.cmd` with the `runas` verb and return the elevated process's pid. `ShellExecuteExW`
/// shows the UAC prompt; it returns 0 with `ERROR_CANCELLED` when the owner declines, and any other
/// failure (no interactive desktop, missing file) is `Unavailable`.
pub fn start(
    job_dir: &Path,
    command: &str,
    log: &Path,
    exit: &Path,
    cwd: &Path,
) -> Result<u32, Failure> {
    write_wrapper(job_dir, command, log, exit, cwd).map_err(|_| Failure::Unavailable)?;
    let wrapper = job_dir.join("elevated.cmd");

    let verb = wide("runas");
    let file = wide("cmd.exe");
    // `cmd /S /C "…"` takes the rest as one command line; the doubled quotes wrap the quoted program.
    let parameters = wide(&format!("/D /S /C \"\"{}\"\"", wrapper.display()));

    unsafe {
        let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        // Ask only for the process handle: the elevated console must not ride on ours.
        info.fMask = SEE_MASK_NOCLOSEPROCESS;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file.as_ptr();
        info.lpParameters = parameters.as_ptr();
        info.nShow = SW_HIDE;

        if ShellExecuteExW(&mut info) == 0 {
            // `ShellExecuteExW` returns a BOOL; 0 is failure. Declining UAC is the one failure that is
            // the owner's own answer, everything else means this device cannot raise the prompt.
            return Err(if GetLastError() == ERROR_CANCELLED {
                Failure::Denied
            } else {
                Failure::Unavailable
            });
        }

        // A NULL handle means no process was started even though the call reported success.
        if info.hProcess.is_null() {
            return Err(Failure::Unavailable);
        }
        let pid = GetProcessId(info.hProcess);
        // The pid is all the runner needs; the handle is the only owning reference we hold.
        CloseHandle(info.hProcess);
        if pid == 0 {
            return Err(Failure::Unavailable);
        }
        Ok(pid)
    }
}

//! Starting, identifying and stopping a command's process tree, for the terminal runner.
//!
//! Two platform rules decide this module (TOOLS-V3 §4):
//!
//! * A command runs in its **own process group** (Unix) or **job object** (Windows), so `kill`
//!   reaches its children too. Killing only the outer shell leaves a build's compiler running.
//! * The exit code is written to a `.exit` file by a wrapper, not captured through a pipe. The
//!   client can exit or crash and the code still survives; a restart reads the file instead of
//!   guessing. Only when the process is alive but the job object is gone (a restart on Windows)
//!   does a kill fall back to `taskkill /T`, because the tree handle died with the old process.

use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// Where the command's own shell and exit wrapper are laid out for one spawn.
pub struct Launch {
    /// The program the spawned child is: the wrapper shell (or `cmd.exe` on Windows).
    pub program: PathBuf,
    pub args: Vec<String>,
}

/// The program to hand `script` to: the owner's default shell, `$SHELL` on Unix, PowerShell on
/// Windows. A missing `$SHELL` falls back to `/bin/sh`, which every Unix has.
pub fn default_shell() -> String {
    if cfg!(windows) {
        return "powershell.exe".into();
    }
    std::env::var("SHELL")
        .ok()
        .filter(|shell| !shell.is_empty())
        .unwrap_or_else(|| "/bin/sh".into())
}

/// The wrapper that runs the command and records its exit code beside the log.
///
/// Unix passes the command, the `.exit` path and the user's shell as positional parameters, so no
/// part of the command is ever re-quoted into a script. Windows writes the command to a `.ps1`
/// file instead: `powershell -Command` would re-join arguments the command line router split, and
/// the file keeps the command byte-for-byte.
pub fn launch(job_dir: &Path, command: &str, shell: &str, exit_path: &Path) -> io::Result<Launch> {
    #[cfg(windows)]
    {
        use std::io::Write;
        let script = job_dir.join("command.ps1");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(command.as_bytes());
        std::fs::write(&script, bytes)?;
        let runner = job_dir.join("runner.cmd");
        std::fs::write(
            &runner,
            "@echo off\r\npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"%~1\"\r\n> \"%~2\" echo %ERRORLEVEL%\r\nexit /b 0\r\n",
        )?;
        let _ = Write::flush;
        let line = format!(
            "\"{}\" \"{}\" \"{}\"",
            runner.display(),
            script.display(),
            exit_path.display()
        );
        return Ok(Launch {
            program: PathBuf::from("cmd.exe"),
            args: vec!["/D".into(), "/S".into(), "/C".into(), line],
        });
    }
    #[cfg(not(windows))]
    {
        let _ = job_dir;
        let _ = shell;
        let wrapper = "\"$3\" -c \"$1\"\ncode=$?\nprintf '%s' \"$code\" > \"$2\"\nexit \"$code\"";
        Ok(Launch {
            program: PathBuf::from("/bin/sh"),
            args: vec![
                "-c".into(),
                wrapper.into(),
                "yonder-shell".into(),
                command.into(),
                exit_path.to_string_lossy().into_owned(),
                default_shell(),
            ],
        })
    }
}

/// Spawn the wrapper with its output already going straight to the log file.
///
/// No pipe sits between the process and its log, so the output is on disk the moment the process
/// writes it, even if the client dies in between. `stdin` is `null` unless the caller asked for a
/// pipe: a command that wants a terminal fails, which the tool description says.
pub fn spawn(launch: &Launch, workdir: &Path, log: &Path, stdin: bool) -> io::Result<Child> {
    let output = std::fs::OpenOptions::new().create(true).append(true).open(log)?;
    let errors = output.try_clone()?;
    let mut command = Command::new(&launch.program);
    command
        .args(&launch.args)
        .current_dir(workdir)
        .stdin(if stdin { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(errors));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // A new group whose id is the child's own pid: `kill(-pid)` then reaches every descendant.
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NEW_PROCESS_GROUP, and no console window for a background command.
        command.creation_flags(0x0000_0200);
    }
    let child = command.spawn()?;
    #[cfg(windows)]
    if let Err(error) = crate::shell_process_windows::assign(child.id()) {
        // The tree bound is a kill guarantee, not a start requirement: without it `kill` still
        // uses `taskkill /T`, so the command keeps running rather than failing to start.
        let _ = error;
    }
    Ok(child)
}

/// End the whole tree. Unix kills the process group; Windows terminates the job object, or, for a
/// job this process does not own (taken over after a restart), `taskkill /T`.
pub fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        if pid > 1 {
            unsafe {
                libc::kill(-pid, libc::SIGKILL);
            }
        }
        let _ = child.kill();
    }
    #[cfg(windows)]
    {
        if !crate::shell_process_windows::terminate(child.id()) {
            use std::process::Command as Process;
            let _ = Process::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        let _ = child.kill();
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = child.kill();
    }
}

/// End a tree this process did not spawn: after a restart the child handle is gone and only the
/// recorded pid remains.
pub fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        if pid > 1 {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }
    #[cfg(windows)]
    {
        use std::process::Command as Process;
        let _ = Process::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(any(unix, windows)))]
    let _ = pid;
}

/// A token that changes when the OS reuses a pid: the process's own start time.
///
/// Across a restart this is what tells "the same process is still running" from "the pid belongs to
/// something else now". Where the platform cannot report it, the token is empty and the restart
/// check falls back to mere liveness.
pub fn start_token(pid: u32) -> String {
    #[cfg(target_os = "linux")]
    {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
        // Field 22 is the process start time in clock ticks; fields 1-2 may contain spaces, so
        // count from the closing parenthesis of the command name instead.
        let tail = stat.rsplit_once(')').map(|(_, tail)| tail).unwrap_or("");
        return tail.split_whitespace().nth(19).unwrap_or("").to_owned();
    }
    #[cfg(target_os = "macos")]
    {
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
        let read = unsafe {
            libc::proc_pidinfo(
                pid as libc::c_int,
                libc::PROC_PIDTBSDINFO,
                0,
                &mut info as *mut _ as *mut libc::c_void,
                size,
            )
        };
        if read != size {
            return String::new();
        }
        format!("{}.{}", info.pbi_start_tvsec, info.pbi_start_tvusec)
    }
    #[cfg(windows)]
    {
        return crate::shell_process_windows::start_token(pid).unwrap_or_default();
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        let _ = pid;
        String::new()
    }
}

/// Whether the recorded process (pid and, when known, that exact start time) still exists.
///
/// A zombie has a pid and a start time but is not running: its exit code is already the parent's to
/// collect, so treating it as alive would keep a dead job "running" forever once nothing reaps it.
pub fn alive(pid: u32, token: &str) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(unix)]
    let exists = unsafe { libc::kill(pid as i32, 0) == 0 };
    #[cfg(windows)]
    let exists = crate::shell_process_windows::alive(pid);
    #[cfg(not(any(unix, windows)))]
    let exists = false;
    if !exists || zombie(pid) {
        return false;
    }
    if token.is_empty() {
        return true;
    }
    start_token(pid) == token
}

/// Whether the process is a zombie: reaped but not yet collected by its parent.
fn zombie(pid: u32) -> bool {
    #[cfg(target_os = "linux")]
    {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
        let state = stat.rsplit_once(')').and_then(|(_, tail)| {
            tail.split_whitespace().next().map(str::to_owned)
        });
        return state.as_deref() == Some("Z");
    }
    #[cfg(target_os = "macos")]
    {
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
        let read = unsafe {
            libc::proc_pidinfo(
                pid as libc::c_int,
                libc::PROC_PIDTBSDINFO,
                0,
                &mut info as *mut _ as *mut libc::c_void,
                size,
            )
        };
        read == size && info.pbi_status == libc::SZOMB
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = pid;
        false
    }
}
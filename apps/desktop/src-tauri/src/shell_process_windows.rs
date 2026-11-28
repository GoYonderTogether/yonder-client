//! Windows job objects, so a command's descendants end with it (TOOLS-V3 §4: "Windows 用任务对象").
//!
//! One job per command, created without `JOB_OBJECT_LIMIT_BREAKAWAY_OK`, is assigned right after
//! spawn. Killing the job kills every process in it, including grandchildren that would outlive a
//! `Child::kill`. The job handle lives in a side table for the client's lifetime; a job taken over
//! after a restart has no handle, and [`terminate`] then says so, so the caller falls back to
//! `taskkill /T`. Pid reuse is guarded by the process's start time, the same token the restart
//! check uses.
//!
//! Nothing here runs on other platforms; the module is declared under `#[cfg(windows)]` only.

use std::collections::HashMap;
use std::sync::Mutex;

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, FILETIME, HANDLE, STILL_ACTIVE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

/// Job handles by the root pid. A `HANDLE` is a raw pointer; the mutex is what makes sharing safe.
struct Job(HANDLE);
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

static JOBS: Mutex<Option<HashMap<u32, Job>>> = Mutex::new(None);

fn jobs() -> std::sync::MutexGuard<'static, Option<HashMap<u32, Job>>> {
    JOBS.lock().unwrap_or_else(|poison| poison.into_inner())
}

/// Put `pid` in a fresh job object. Any failure leaves the command running without a tree handle;
/// `kill` then uses `taskkill /T`, so this is best-effort by design.
///
/// No `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: the client exiting must leave a job running, because the
/// restart check re-adopts it. Only an explicit `kill` terminates the job.
pub fn assign(pid: u32) -> Result<(), ()> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job.is_null() {
            return Err(());
        }
        let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if process.is_null() || AssignProcessToJobObject(job, process) == 0 {
            if !process.is_null() {
                CloseHandle(process);
            }
            CloseHandle(job);
            return Err(());
        }
        CloseHandle(process);
        jobs()
            .get_or_insert_with(HashMap::new)
            .insert(pid, Job(job));
        Ok(())
    }
}

/// End every process in the job, if this client owns it.
pub fn terminate(pid: u32) -> bool {
    let Some(job) = jobs().as_mut().and_then(|map| map.remove(&pid)) else {
        return false;
    };
    unsafe {
        let killed = TerminateJobObject(job.0, 1) != 0;
        CloseHandle(job.0);
        killed
    }
}

/// Whether a process exists.
///
/// `ACCESS_DENIED` from `OpenProcess` is a **yes**: the process exists and has a higher integrity
/// level than this client, which is exactly an elevated command the terminal started. Reporting it
/// gone would make the runner settle an elevated job the moment it starts, with no exit code. Only
/// an invalid pid or a process that has already exited is gone.
pub fn alive(pid: u32) -> bool {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return GetLastError() == ERROR_ACCESS_DENIED;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(process, &mut code);
        CloseHandle(process);
        ok != 0 && code == STILL_ACTIVE as u32
    }
}

/// `ERROR_ACCESS_DENIED`: the process exists but this client may not inspect it.
const ERROR_ACCESS_DENIED: u32 = 5;

/// `creation.100ns` for the process start time, the pid-reuse guard. Windows reports both the
/// creation and exit times in one call; only creation is wanted.
pub fn start_token(pid: u32) -> Option<String> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let mut creation: FILETIME = std::mem::zeroed();
        let mut exit: FILETIME = std::mem::zeroed();
        let mut kernel: FILETIME = std::mem::zeroed();
        let mut user: FILETIME = std::mem::zeroed();
        let ok = GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user);
        CloseHandle(process);
        if ok == 0 {
            return None;
        }
        Some(format!(
            "{:08x}{:08x}",
            creation.dwHighDateTime, creation.dwLowDateTime
        ))
    }
}

/// Release every job handle at shutdown, which also terminates their processes. Kept for a future
/// explicit quit; the client normally exits with processes running and jobs recorded on disk, and
/// a restart takes them over rather than killing them.
#[allow(dead_code)]
pub fn terminate_all() {
    let taken = jobs().take().unwrap_or_default();
    for (_, job) in taken {
        unsafe {
            CloseHandle(job.0);
        }
    }
}

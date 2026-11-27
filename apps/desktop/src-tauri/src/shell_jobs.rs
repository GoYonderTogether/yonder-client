//! The terminal jobs a device owns, written to `jobs.json` in the app's local data directory.
//!
//! A job outlives the command that started it: the process keeps running after the foreground
//! window, and the record is what a later `shell_job` call — or the next client start — reads
//! (TOOLS-V3 §4). The record holds exactly the fields the restart check needs: the command, the
//! working directory, the start time, the process and its start token, the log, whether the
//! completion was reported, and the state.
//!
//! The store does not write itself on every mutation: the runner owns the file and persists after
//! each change. That keeps the window between "process started" and "record on disk" as small as
//! one call, which is what a restart has to survive.

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub command: String,
    pub workdir: PathBuf,
    /// Unix milliseconds when the process was spawned.
    pub started_ms: u64,
    pub pid: u32,
    /// The process's own start time; guards against the OS handing its pid to another process.
    pub start_token: String,
    pub log_path: PathBuf,
    /// Passed by the caller; the completion event is sent once, then this is true.
    pub notify: bool,
    pub notified: bool,
    pub status: JobStatus,
    /// Read from the `.exit` file once the process is gone; `None` when it ended by a signal or
    /// the file is missing (`lost`). Never invented.
    pub exit_code: Option<i64>,
    pub stdin: bool,
    /// The connection the command ran under; the completion event goes to that connection.
    pub connection_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Running,
    Done,
    Killed,
    /// The process disappeared with no `.exit` record across a restart: the exit code is unknown.
    Lost,
}

impl JobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            JobStatus::Running => "running",
            JobStatus::Done => "done",
            JobStatus::Killed => "killed",
            JobStatus::Lost => "lost",
        }
    }
    pub fn finished(self) -> bool {
        self != JobStatus::Running
    }
}

impl Job {
    /// The first few words, for a list line: enough to recognise the command, never the whole of it.
    pub fn name(&self) -> String {
        let words: Vec<&str> = self.command.split_whitespace().take(6).collect();
        let mut name = words.join(" ");
        if name.chars().count() > 80 {
            name = name.chars().take(80).collect();
        }
        if self.command.split_whitespace().count() > 6 {
            name.push('…');
        }
        name
    }
    pub fn elapsed_ms(&self, now: u64) -> u64 {
        now.saturating_sub(self.started_ms)
    }
}

/// Every record on this device plus the operations the runner needs. In-memory; [`load`] and
/// [`save`] are the only disk contact.
#[derive(Default)]
pub struct Jobs {
    pub items: Vec<Job>,
}

fn parse(bytes: &[u8]) -> Vec<Job> {
    serde_json::from_slice::<Vec<Job>>(bytes).unwrap_or_default()
}

impl Jobs {
    /// Read `jobs.json`. A missing file is an empty list; a corrupt one is too: the records protect
    /// running work, and a failed parse must not stop the client from starting.
    pub fn load(file: &Path) -> Jobs {
        let items = fs::read(file).map(|bytes| parse(&bytes)).unwrap_or_default();
        Jobs { items }
    }

    pub fn save(&self, file: &Path) -> Result<(), String> {
        let parent = file.parent().ok_or("read_failed")?;
        fs::create_dir_all(parent).map_err(|_| "read_failed".to_string())?;
        let temp = file.with_extension(format!("{}.tmp", std::process::id()));
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut output = options
                .open(&temp)
                .map_err(|_| "read_failed".to_string())?;
            let bytes = serde_json::to_vec(&self.items).map_err(|_| "read_failed".to_string())?;
            output
                .write_all(&bytes)
                .and_then(|_| output.sync_all())
                .map_err(|_| "read_failed".to_string())?;
            fs::rename(&temp, file).map_err(|_| "read_failed".to_string())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        result
    }

    /// Full id, or an unambiguous prefix of one.
    pub fn find(&self, wanted: &str) -> Result<&Job, &'static str> {
        if let Some(job) = self.items.iter().find(|job| job.id == wanted) {
            return Ok(job);
        }
        let matches: Vec<&Job> = self
            .items
            .iter()
            .filter(|job| job.id.starts_with(wanted))
            .collect();
        match matches.len() {
            1 => Ok(matches[0]),
            0 => Err("job_not_found"),
            // A prefix that names two jobs is a question the caller has to answer, not a guess.
            _ => Err("multiple_matches"),
        }
    }

    pub fn get(&self, id: &str) -> Option<&Job> {
        self.items.iter().find(|job| job.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Job> {
        self.items.iter_mut().find(|job| job.id == id)
    }

    pub fn running(&self) -> usize {
        self.items
            .iter()
            .filter(|job| job.status == JobStatus::Running)
            .count()
    }

    /// Drop the oldest finished records beyond `keep`, with their job directories (the log included).
    ///
    /// Finished jobs are kept in memory for `shell_job` to answer about until the window rolls over;
    /// there is no separate truncation step, so this also takes the log files. A running job is never
    /// pruned, whatever its age: its record is the only handle on a live process.
    pub fn prune(&mut self, keep: usize, jobs_root: &Path) -> Vec<String> {
        let mut finished: Vec<(String, u64, PathBuf)> = self
            .items
            .iter()
            .filter(|job| job.status.finished())
            .map(|job| (job.id.clone(), job.started_ms, job.log_path.clone()))
            .collect();
        if finished.len() <= keep {
            return Vec::new();
        }
        finished.sort_by_key(|(_, started, _)| *started);
        let remove = finished.len() - keep;
        let mut drop_ids = std::collections::HashSet::new();
        for (id, _, log) in finished.into_iter().take(remove) {
            if let Some(dir) = log.parent() {
                let _ = fs::remove_dir_all(dir);
            }
            drop_ids.insert(id);
        }
        self.items.retain(|job| !drop_ids.contains(&job.id));
        // Directories an interrupted run left behind are not records any more.
        if let Ok(entries) = fs::read_dir(jobs_root) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !self.items.iter().any(|job| job.id == name) {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
        drop_ids.into_iter().collect()
    }
}
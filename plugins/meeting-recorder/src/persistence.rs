use crate::model::{now_ms, valid_key, Recording, Segment};
use crate::wav;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ID: AtomicU64 = AtomicU64::new(0);

pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        wav::private_directory(&root)?;
        Ok(Self { root })
    }

    fn owner_path(&self, owner: &str) -> Result<PathBuf, String> {
        valid_key(owner)?;
        Ok(self.root.join(owner))
    }

    fn recording_path(&self, owner: &str, id: &str) -> Result<PathBuf, String> {
        valid_key(id)?;
        Ok(self.owner_path(owner)?.join(id))
    }

    pub fn create(
        &self,
        owner: &str,
        title: &str,
        sample_rate: u32,
        channels: u16,
    ) -> Result<Recording, String> {
        self.create_bound(owner, title, sample_rate, channels, None, false)
    }

    pub(crate) fn create_bound(
        &self,
        owner: &str,
        title: &str,
        sample_rate: u32,
        channels: u16,
        conversation_id: Option<String>,
        separate_speakers: bool,
    ) -> Result<Recording, String> {
        if title.chars().count() > 200 || sample_rate == 0 || channels == 0 {
            return Err("meeting_invalid_recording".into());
        }
        let owner_path = self.owner_path(owner)?;
        wav::private_directory(&owner_path)?;
        let started_at = now_ms();
        let id = format!("r_{started_at}_{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
        let path = self.recording_path(owner, &id)?;
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        wav::private_directory(&path)?;
        wav::sync_directory(&owner_path)?;
        let recording = Recording {
            id,
            owner_id: owner.into(),
            title: title.trim().into(),
            conversation_id,
            separate_speakers,
            state: "recording".into(),
            started_at,
            ended_at: None,
            duration_ms: 0,
            saved_duration_ms: 0,
            sample_rate,
            channels,
            segments: Vec::new(),
            error: None,
        };
        if let Err(error) = self.save(&recording) {
            let _ = fs::remove_dir(&path);
            return Err(error);
        }
        Ok(recording)
    }

    pub fn save(&self, recording: &Recording) -> Result<(), String> {
        let path = self
            .recording_path(&recording.owner_id, &recording.id)?
            .join("recording.json");
        wav::atomic_write(
            &path,
            &serde_json::to_vec(recording).map_err(|e| e.to_string())?,
        )
    }

    pub fn append(&self, recording: &mut Recording, samples: &[i16]) -> Result<(), String> {
        if recording.state != "recording"
            || samples.is_empty()
            || samples.len() % recording.channels as usize != 0
        {
            return Err("meeting_invalid_segment".into());
        }
        let index = recording.segments.len();
        let bytes = wav::encode(samples, recording.sample_rate, recording.channels);
        let path = self
            .recording_path(&recording.owner_id, &recording.id)?
            .join(format!("{index:08}.wav"));
        if path.exists() {
            // A previous rename may have succeeded before directory sync or indexing failed.
            // Preserve that committed file for recovery instead of overwriting it with a tail.
            return Err("meeting_segment_already_saved".into());
        }
        wav::atomic_write(&path, &bytes)?;
        recording.segments.push(Segment {
            index,
            duration_ms: samples.len() as u64 * 1000
                / recording.channels as u64
                / recording.sample_rate as u64,
            byte_length: bytes.len() as u64,
        });
        recording.saved_duration_ms = recording.segments.iter().map(|s| s.duration_ms).sum();
        recording.duration_ms = recording.saved_duration_ms;
        self.save(recording)
    }

    pub fn finish(&self, recording: &mut Recording, error: Option<String>) -> Result<(), String> {
        self.finish_at(recording, error, None)
    }

    fn finish_at(
        &self,
        recording: &mut Recording,
        error: Option<String>,
        ended_at: Option<u64>,
    ) -> Result<(), String> {
        recording.state = if error.is_some() {
            "interrupted"
        } else {
            "ended"
        }
        .into();
        recording.ended_at = Some(ended_at.unwrap_or_else(now_ms));
        recording.duration_ms = recording.saved_duration_ms;
        recording.error = error;
        self.save(recording)
    }

    /// The interrupted recording that can still be continued, without changing it.
    pub fn resumable(&self, owner: &str, id: &str) -> Result<Recording, String> {
        let recording = self
            .list(owner, None)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or("meeting_audio_not_found")?;
        let deadline = crate::model::resume_deadline(&recording).ok_or("meeting_not_resumable")?;
        if now_ms() >= deadline {
            return Err("meeting_resume_expired".into());
        }
        Ok(recording)
    }

    /// Reopens it for appending. Audio already saved is kept; a failure leaves the record as it was.
    pub fn reopen(&self, owner: &str, id: &str) -> Result<Recording, String> {
        let mut recording = self.resumable(owner, id)?;
        recording.state = "recording".into();
        recording.ended_at = None;
        recording.error = None;
        self.save(&recording)?;
        Ok(recording)
    }

    /// Ending an interrupted recording is the user saying it is over; it can then be processed.
    pub fn conclude(&self, owner: &str, id: &str) -> Result<(), String> {
        let mut recording = self
            .list(owner, None)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or("meeting_audio_not_found")?;
        if recording.state != "interrupted" || recording.segments.is_empty() {
            return Ok(());
        }
        recording.state = "ended".into();
        recording.error = None;
        self.save(&recording)
    }

    pub fn read_audio(&self, owner: &str, id: &str, index: usize) -> Result<Vec<u8>, String> {
        let path = self.recording_path(owner, id)?;
        let recording: Recording = serde_json::from_slice(
            &fs::read(path.join("recording.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if recording.owner_id != owner || recording.id != id {
            return Err("meeting_audio_not_found".into());
        }
        let bytes = fs::read(path.join(format!("{index:08}.wav"))).map_err(|e| e.to_string())?;
        wav::samples(&bytes, recording.sample_rate, recording.channels)?;
        Ok(bytes)
    }

    pub fn list(&self, owner: &str, active_id: Option<&str>) -> Result<Vec<Recording>, String> {
        let path = self.owner_path(owner)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        let mut items = Vec::new();
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().into_owned();
            valid_key(&id)?;
            let manifest = entry.path().join("recording.json");
            if !manifest.exists() {
                continue;
            }
            let bytes = fs::read(manifest).map_err(|e| e.to_string())?;
            let mut item: Recording = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if item.owner_id != owner || item.id != id {
                return Err("meeting_owner_mismatch".into());
            }
            if active_id != Some(id.as_str()) && item.state == "recording" {
                self.recover(&entry.path(), &mut item)?;
            }
            items.push(item);
        }
        items.sort_by_key(|item| std::cmp::Reverse(item.started_at));
        Ok(items)
    }

    fn recover(&self, path: &Path, item: &mut Recording) -> Result<(), String> {
        // A complete WAV may have reached disk just before the manifest update was interrupted.
        let mut segments = Vec::new();
        let mut error = "meeting_recording_interrupted";
        for index in 0.. {
            let file = path.join(format!("{index:08}.wav"));
            if !file.exists() {
                break;
            }
            let bytes = fs::read(file).map_err(|e| e.to_string())?;
            match wav::samples(&bytes, item.sample_rate, item.channels) {
                Ok(samples) => segments.push(Segment {
                    index,
                    duration_ms: samples as u64 * 1000
                        / item.sample_rate as u64
                        / item.channels as u64,
                    byte_length: bytes.len() as u64,
                }),
                Err(_) => {
                    error = "meeting_audio_corrupt";
                    break;
                }
            }
        }
        item.segments = segments;
        item.saved_duration_ms = item.segments.iter().map(|s| s.duration_ms).sum();
        // The window counts from the last durable write, not from whenever the app was reopened.
        let last_write = fs::metadata(path.join("recording.json"))
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|elapsed| elapsed.as_millis() as u64);
        if let Err(failure) = self.finish_at(item, Some(error.into()), last_write) {
            // Stopped state and playable audio remain readable even while disk writes fail.
            item.error = Some(format!("{error}; meeting_storage_unavailable: {failure}"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

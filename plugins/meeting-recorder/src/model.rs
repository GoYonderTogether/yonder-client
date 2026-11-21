use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub index: usize,
    pub duration_ms: u64,
    pub byte_length: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub owner_id: String,
    pub title: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub separate_speakers: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport_mode: Option<String>,
    pub state: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_ms: u64,
    pub saved_duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub segments: Vec<Segment>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderState {
    pub supported: bool,
    pub active_id: Option<String>,
    pub audio_level: f32,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub pause_supported: bool,
    pub recordings: Vec<Recording>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn valid_key(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("meeting_invalid_identifier".into());
    }
    Ok(())
}

/// An interrupted recording can be continued for this long; afterwards it is processed as saved.
pub const RESUME_WINDOW_MS: u64 = 10 * 60 * 1000;

/// Storage and ownership failures leave nothing safe to append to.
fn unrecoverable(error: &str) -> bool {
    ["storage", "damaged", "corrupt", "owner_changed", "capture_start_failed"]
        .iter()
        .any(|word| error.contains(word))
}

/// When continuing stops being possible; `None` when the recording can never be continued.
pub fn resume_deadline(recording: &Recording) -> Option<u64> {
    if recording.state != "interrupted" || recording.segments.is_empty() {
        return None;
    }
    if recording.error.as_deref().is_some_and(unrecoverable) {
        return None;
    }
    recording.ended_at.map(|ended| ended + RESUME_WINDOW_MS)
}

/// Transcription starts once the recording is really over: ended by the user, or past the window.
pub fn upload_ready(recording: &Recording, now: u64) -> bool {
    if recording.segments.is_empty() {
        return false;
    }
    match recording.state.as_str() {
        "ended" => true,
        "interrupted" if recording.ended_at.is_some() => {
            resume_deadline(recording).map_or(true, |deadline| now >= deadline)
        }
        _ => false,
    }
}

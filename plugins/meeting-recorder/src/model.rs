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

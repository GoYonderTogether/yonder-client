use crate::{
    desktop::DesktopRecorder,
    model::{now_ms, upload_ready, valid_key},
    persistence::Store,
    wav,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadJob {
    pub recording_id: String,
    pub conversation_id: String,
    pub meeting_id: Option<String>,
    pub state: String,
    pub error_code: Option<String>,
    pub attempts: u32,
    pub retry_at: u64,
}

#[derive(Clone)]
pub(crate) struct Session {
    pub owner: String,
    pub base: String,
    pub token: String,
    generation: u64,
}
struct State {
    session: Option<Session>,
    generation: u64,
}
#[derive(Clone)]
pub struct UploadQueue {
    root: PathBuf,
    recorder: DesktopRecorder,
    state: Arc<Mutex<State>>,
    io: Arc<Mutex<()>>,
    on_change: Arc<dyn Fn() + Send + Sync>,
}

impl UploadQueue {
    pub fn new(
        root: PathBuf,
        recorder: DesktopRecorder,
        listener: impl Fn() + Send + Sync + 'static,
    ) -> Result<Self, String> {
        let queue = Self {
            root,
            recorder,
            state: Arc::new(Mutex::new(State {
                session: None,
                generation: 0,
            })),
            io: Arc::new(Mutex::new(())),
            on_change: Arc::new(listener),
        };
        let background = queue.clone();
        std::thread::Builder::new()
            .name("meeting-upload".into())
            .spawn(move || {
                let _ = rustls::crypto::ring::default_provider().install_default();
                let Ok(client) = reqwest::blocking::Client::builder()
                    .timeout(Duration::from_secs(30))
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                else {
                    return;
                };
                loop {
                    let session = background
                        .state
                        .lock()
                        .ok()
                        .and_then(|state| state.session.clone());
                    if let Some(session) = session {
                        let _ = background.tick(&client, &session);
                    }
                    std::thread::sleep(Duration::from_secs(2));
                }
            })
            .map_err(|_| "meeting_upload_unavailable")?;
        Ok(queue)
    }

    pub fn configure(&self, owner: String, base: String, token: String) -> Result<(), String> {
        let records = self.recorder.get_state(owner.clone())?.recordings;
        let url = reqwest::Url::parse(&base).map_err(|_| "meeting_upload_invalid_origin")?;
        let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if (url.scheme() != "https" && !(url.scheme() == "http" && loopback))
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || token.is_empty()
        {
            return Err("meeting_upload_invalid_origin".into());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "meeting_upload_unavailable")?;
        if state
            .session
            .as_ref()
            .is_some_and(|s| s.owner == owner && s.base == base && s.token == token)
        {
            return Ok(());
        }
        state.generation += 1;
        state.session = Some(Session {
            owner: owner.clone(),
            base: base.trim_end_matches('/').into(),
            token,
            generation: state.generation,
        });
        drop(state);
        // A fresh session resumes paused credentials, including jobs from a previous process.
        for record in records {
            if let Some(mut job) = self.load(&owner, &record.id)? {
                if job.state == "authentication_required" {
                    job.state = "queued".into();
                    job.retry_at = 0;
                    self.save(&owner, &job)?;
                }
            }
        }
        Ok(())
    }

    pub fn clear(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.generation += 1;
            state.session = None;
        }
    }
    pub fn retain_owner(&self, owner: Option<&str>) {
        let changed = self.state.lock().is_ok_and(|state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| Some(session.owner.as_str()) != owner)
        });
        if changed {
            self.clear();
        }
    }
    pub(crate) fn current(&self, session: &Session) -> bool {
        self.state
            .lock()
            .is_ok_and(|state| state.generation == session.generation && state.session.is_some())
    }
    fn path(&self, owner: &str, id: &str) -> Result<PathBuf, String> {
        valid_key(owner)?;
        valid_key(id)?;
        Ok(self.root.join(owner).join(id).join("upload.json"))
    }
    fn load(&self, owner: &str, id: &str) -> Result<Option<UploadJob>, String> {
        let _guard = self.io.lock().map_err(|_| "meeting_upload_unavailable")?;
        let path = self.path(owner, id)?;
        if !path.exists() {
            return Ok(None);
        }
        serde_json::from_slice(&fs::read(path).map_err(|_| "meeting_upload_storage_failed")?)
            .map(Some)
            .map_err(|_| "meeting_upload_storage_failed".into())
    }
    pub(crate) fn save(&self, owner: &str, job: &UploadJob) -> Result<(), String> {
        let _guard = self.io.lock().map_err(|_| "meeting_upload_unavailable")?;
        wav::atomic_write(
            &self.path(owner, &job.recording_id)?,
            &serde_json::to_vec(job).map_err(|_| "meeting_upload_storage_failed")?,
        )?;
        drop(_guard);
        (self.on_change)();
        Ok(())
    }
    pub fn has_pending(&self) -> bool {
        let owner = self
            .state
            .lock()
            .ok()
            .and_then(|state| state.session.as_ref().map(|session| session.owner.clone()));
        let Some(owner) = owner else {
            return false;
        };
        let Ok(state) = self.recorder.get_state(owner.clone()) else {
            return false;
        };
        state
            .recordings
            .iter()
            .any(|record| match self.load(&owner, &record.id) {
                Ok(Some(job)) => matches!(job.state.as_str(), "queued" | "uploading"),
                Ok(None) => {
                    record.conversation_id.is_some() && upload_ready(record, now_ms())
                }
                Err(_) => true,
            })
    }
    pub fn jobs(&self, owner: String) -> Result<Vec<UploadJob>, String> {
        let records = self.recorder.get_state(owner.clone())?.recordings;
        records
            .iter()
            .filter_map(|record| self.load(&owner, &record.id).transpose())
            .collect()
    }
    pub fn enqueue(&self, owner: String, id: String, conversation: String) -> Result<(), String> {
        valid_key(&conversation)?;
        let mut recording = self
            .recorder
            .get_state(owner.clone())?
            .recordings
            .into_iter()
            .find(|r| r.id == id)
            .ok_or("meeting_audio_not_found")?;
        if recording.state == "recording" || recording.segments.is_empty() {
            return Err("meeting_upload_not_ready".into());
        }
        if recording
            .conversation_id
            .as_ref()
            .is_some_and(|bound| bound != &conversation)
        {
            return Err("meeting_conversation_mismatch".into());
        }
        recording.conversation_id = Some(conversation.clone());
        Store::new(self.root.clone())?.save(&recording)?;
        let mut job = self.load(&owner, &id)?.unwrap_or(UploadJob {
            recording_id: id,
            conversation_id: conversation,
            meeting_id: None,
            state: "queued".into(),
            error_code: None,
            attempts: 0,
            retry_at: 0,
        });
        job.state = "queued".into();
        job.error_code = None;
        job.retry_at = 0;
        self.save(&owner, &job)
    }
    fn tick(&self, client: &reqwest::blocking::Client, session: &Session) -> Result<(), String> {
        let records = self.recorder.get_state(session.owner.clone())?.recordings;
        for recording in records {
            if !self.current(session) {
                break;
            }
            let Some(conversation) = recording.conversation_id.clone() else {
                continue;
            };
            let mut job = match self.load(&session.owner, &recording.id)? {
                Some(job) => job,
                None if upload_ready(&recording, now_ms()) => UploadJob {
                    recording_id: recording.id.clone(),
                    conversation_id: conversation,
                    meeting_id: None,
                    state: "queued".into(),
                    error_code: None,
                    attempts: 0,
                    retry_at: 0,
                },
                None => continue,
            };
            if !matches!(job.state.as_str(), "queued" | "uploading") || job.retry_at > now_ms() {
                continue;
            }
            job.state = "uploading".into();
            self.save(&session.owner, &job)?;
            let result = crate::upload_http::transmit(
                client,
                self,
                session,
                &mut job,
                &recording,
                &self.recorder,
            );
            if !self.current(session) {
                continue;
            }
            match result {
                Ok(()) => {
                    job.state = "submitted".into();
                    job.error_code = None;
                }
                Err((code, retryable)) => {
                    job.attempts = job.attempts.saturating_add(1);
                    job.state = if code == "authentication_required" {
                        "authentication_required"
                    } else if retryable {
                        "queued"
                    } else {
                        "failed"
                    }
                    .into();
                    job.retry_at = now_ms() + 30_000;
                    job.error_code = Some(code);
                }
            }
            self.save(&session.owner, &job)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

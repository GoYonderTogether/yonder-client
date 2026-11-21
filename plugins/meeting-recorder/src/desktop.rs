use crate::{
    capture::Capture,
    model::{valid_key, RecorderState, Recording},
    persistence::Store,
};
use std::path::PathBuf;
use std::sync::{atomic::Ordering, mpsc};
use std::time::Duration;

enum Action {
    Owner(Option<String>),
    State(String),
    Start(String, String, Option<String>, bool, Option<String>),
    Stop(String, String),
    Pause(String, String),
    Resume(String, String),
    Audio(String, String, usize),
    Finish,
    Interrupt(String),
    Active,
}
enum Reply {
    State(RecorderState),
    Audio(Vec<u8>),
    Active(bool),
}
struct Request {
    action: Action,
    reply: mpsc::Sender<Result<Reply, String>>,
}

#[derive(Clone)]
pub struct DesktopRecorder {
    sender: mpsc::Sender<Request>,
}

struct Active {
    capture: Capture,
    recording: Recording,
    pending: Vec<i16>,
    last_audio: Duration,
    audio_level: f32,
    paused: bool,
}
struct Worker {
    store: Store,
    owner: Option<String>,
    active: Option<Active>,
    on_active: Box<dyn Fn(bool) + Send>,
}

fn flush_pending(
    store: &Store,
    recording: &mut Recording,
    pending: &mut Vec<i16>,
    partial: bool,
) -> Result<(), String> {
    let size = recording.sample_rate as usize * recording.channels as usize * 4;
    while pending.len() >= size || (partial && !pending.is_empty()) {
        let rest = pending.split_off(size.min(pending.len()));
        // Consume before writing: WAV rename may succeed even if its manifest update fails.
        let samples = std::mem::replace(pending, rest);
        store.append(recording, &samples)?;
    }
    Ok(())
}

impl DesktopRecorder {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        Self::with_state_listener(root, |_| {})
    }

    pub fn with_state_listener(
        root: PathBuf,
        listener: impl Fn(bool) + Send + 'static,
    ) -> Result<Self, String> {
        let store = Store::new(root)?;
        let (sender, receiver) = mpsc::channel::<Request>();
        std::thread::Builder::new()
            .name("meeting-recorder".into())
            .spawn(move || {
                let mut worker = Worker {
                    store,
                    owner: None,
                    active: None,
                    on_active: Box::new(listener),
                };
                loop {
                    if let Err(error) = worker.drain() {
                        let _ = worker.finish(Some(error));
                    }
                    match receiver.recv_timeout(Duration::from_millis(20)) {
                        Ok(request) => {
                            let _ = request.reply.send(worker.handle(request.action));
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => (),
                        Err(_) => {
                            let _ = worker.finish(None);
                            break;
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self { sender })
    }

    fn request(&self, action: Action) -> Result<Reply, String> {
        let (reply, result) = mpsc::channel();
        self.sender
            .send(Request { action, reply })
            .map_err(|_| "meeting_recorder_unavailable")?;
        result.recv().map_err(|_| "meeting_recorder_unavailable")?
    }

    fn state_request(&self, action: Action) -> Result<RecorderState, String> {
        match self.request(action)? {
            Reply::State(state) => Ok(state),
            _ => unreachable!(),
        }
    }
    pub fn set_owner(&self, owner: Option<String>) -> Result<RecorderState, String> {
        self.state_request(Action::Owner(owner))
    }
    pub fn get_state(&self, owner: String) -> Result<RecorderState, String> {
        self.state_request(Action::State(owner))
    }
    pub fn start(&self, owner: String, title: String) -> Result<RecorderState, String> {
        self.start_for_conversation(owner, title, None, false, None)
    }
    pub fn start_for_conversation(
        &self,
        owner: String,
        title: String,
        conversation: Option<String>,
        separate_speakers: bool,
        transport_mode: Option<String>,
    ) -> Result<RecorderState, String> {
        if let Some(id) = &conversation {
            valid_key(id)?;
        }
        self.state_request(Action::Start(owner, title, conversation, separate_speakers, transport_mode))
    }
    pub fn stop(&self, owner: String, id: String) -> Result<RecorderState, String> {
        self.state_request(Action::Stop(owner, id))
    }
    pub fn pause(&self, owner: String, id: String) -> Result<RecorderState, String> {
        self.state_request(Action::Pause(owner, id))
    }
    pub fn resume(&self, owner: String, id: String) -> Result<RecorderState, String> {
        self.state_request(Action::Resume(owner, id))
    }
    pub fn finish(&self) {
        let _ = self.request(Action::Finish);
    }
    /// The app is about to restart: keep the audio and mark it continuable instead of ended.
    pub fn interrupt(&self, reason: &str) {
        let _ = self.request(Action::Interrupt(reason.into()));
    }
    pub fn is_recording(&self) -> bool {
        matches!(self.request(Action::Active), Ok(Reply::Active(true)))
    }
    pub fn read_audio(&self, owner: String, id: String, index: usize) -> Result<Vec<u8>, String> {
        match self.request(Action::Audio(owner, id, index))? {
            Reply::Audio(bytes) => Ok(bytes),
            _ => unreachable!(),
        }
    }
}

impl Worker {
    fn authorize(&self, owner: &str) -> Result<(), String> {
        valid_key(owner)?;
        if self.owner.as_deref() != Some(owner) {
            return Err("meeting_owner_mismatch".into());
        }
        Ok(())
    }

    fn state(&self) -> Result<RecorderState, String> {
        let active_id = self
            .active
            .as_ref()
            .map(|active| active.recording.id.clone());
        let mut recordings = self
            .owner
            .as_deref()
            .map(|owner| self.store.list(owner, active_id.as_deref()))
            .transpose()?
            .unwrap_or_default();
        if let Some(active) = &self.active {
            if let Some(item) = recordings
                .iter_mut()
                .find(|item| item.id == active.recording.id)
            {
                *item = active.recording.clone();
                item.duration_ms += active.pending.len() as u64 * 1000
                    / item.sample_rate as u64
                    / item.channels as u64;
            }
        }
        Ok(RecorderState {
            supported: true,
            active_id,
            paused: self.active.as_ref().is_some_and(|active| active.paused),
            pause_supported: true,
            audio_level: self
                .active
                .as_ref()
                .map_or(0.0, |active| active.audio_level),
            recordings,
        })
    }

    fn handle(&mut self, action: Action) -> Result<Reply, String> {
        match action {
            Action::Owner(owner) => {
                if let Some(owner) = &owner {
                    valid_key(owner)?;
                }
                if self.owner != owner {
                    self.finish(None)?;
                    self.owner = owner;
                }
            }
            Action::State(owner) => self.authorize(&owner)?,
            Action::Start(owner, title, conversation, separate_speakers, transport_mode) => {
                self.authorize(&owner)?;
                if self.active.is_some() {
                    return Err("meeting_already_recording".into());
                }
                let capture = Capture::new()?;
                let mut recording = self.store.create_bound(
                    &owner,
                    &title,
                    capture.sample_rate,
                    capture.channels,
                    conversation,
                    separate_speakers,
                    transport_mode,
                )?;
                if let Err(error) = capture.play() {
                    self.store.finish(&mut recording, Some(error.clone()))?;
                    return Err(error);
                }
                self.active = Some(Active {
                    capture,
                    recording,
                    pending: Vec::new(),
                    last_audio: crate::capture_clock::now(),
                    audio_level: 0.0,
                    paused: false,
                });
                (self.on_active)(true);
            }
            Action::Stop(owner, id) => {
                self.authorize(&owner)?;
                if self
                    .active
                    .as_ref()
                    .map(|active| active.recording.id.as_str())
                    != Some(id.as_str())
                {
                    if self.active.is_none() {
                        self.store.conclude(&owner, &id)?;
                        return self.state().map(Reply::State);
                    }
                    return Err("meeting_not_recording".into());
                }
                self.finish(None)?;
            }
            Action::Pause(owner, id) => {
                self.authorize(&owner)?;
                let active = self
                    .active
                    .as_mut()
                    .filter(|active| active.recording.id == id && !active.paused)
                    .ok_or("meeting_not_recording")?;
                active.capture.pause()?;
                while let Ok((samples, _)) = active.capture.receiver.try_recv() {
                    active.pending.extend(samples);
                }
                flush_pending(
                    &self.store,
                    &mut active.recording,
                    &mut active.pending,
                    true,
                )?;
                active.paused = true;
                active.audio_level = 0.0;
            }
            Action::Resume(owner, id) if self.active.is_none() => {
                self.authorize(&owner)?;
                // Nothing is written until the microphone is really running: a failed attempt
                // must not move the end time and quietly extend the resume window.
                let recorded = self.store.resumable(&owner, &id)?;
                let capture = Capture::new()?;
                if capture.sample_rate != recorded.sample_rate || capture.channels != recorded.channels {
                    // The device changed: appended audio would play at the wrong speed.
                    return Err("meeting_audio_format_changed".into());
                }
                capture.play()?;
                let recording = self.store.reopen(&owner, &id)?;
                self.active = Some(Active {
                    capture,
                    recording,
                    pending: Vec::new(),
                    last_audio: crate::capture_clock::now(),
                    audio_level: 0.0,
                    paused: false,
                });
                (self.on_active)(true);
            }
            Action::Resume(owner, id) => {
                self.authorize(&owner)?;
                let active = self
                    .active
                    .as_mut()
                    .filter(|active| active.recording.id == id && active.paused)
                    .ok_or("meeting_not_recording")?;
                active.capture.play()?;
                active.last_audio = crate::capture_clock::now();
                active.paused = false;
            }
            Action::Audio(owner, id, index) => {
                self.authorize(&owner)?;
                return self.store.read_audio(&owner, &id, index).map(Reply::Audio);
            }
            Action::Finish => self.finish(None)?,
            Action::Interrupt(reason) => self.finish(Some(reason))?,
            Action::Active => return Ok(Reply::Active(self.active.is_some())),
        }
        self.state().map(Reply::State)
    }

    fn drain(&mut self) -> Result<(), String> {
        let Some(active) = self.active.as_mut() else {
            return Ok(());
        };
        if active.paused {
            return Ok(());
        }
        if active.capture.failed.load(Ordering::Acquire) {
            return Err("meeting_audio_capture_interrupted".into());
        }
        while let Ok((samples, received_at)) = active.capture.receiver.try_recv() {
            if received_at.saturating_sub(active.last_audio) > Duration::from_secs(5) {
                return Err("meeting_audio_capture_interrupted".into());
            }
            active.audio_level = samples
                .iter()
                .map(|sample| sample.unsigned_abs())
                .max()
                .unwrap_or(0) as f32
                / 32768.0;
            active.pending.extend(samples);
            active.last_audio = received_at;
        }
        if crate::capture_clock::now().saturating_sub(active.last_audio) > Duration::from_secs(5) {
            return Err("meeting_audio_capture_interrupted".into());
        }
        flush_pending(
            &self.store,
            &mut active.recording,
            &mut active.pending,
            false,
        )
    }

    fn finish(&mut self, error: Option<String>) -> Result<(), String> {
        let Some(mut active) = self.active.take() else {
            return Ok(());
        };
        let Capture {
            stream, receiver, ..
        } = active.capture;
        drop(stream);
        (self.on_active)(false);
        if error.as_deref() != Some("meeting_audio_capture_interrupted") {
            while let Ok((samples, _)) = receiver.try_recv() {
                active.pending.extend(samples);
            }
        }
        if !active.pending.is_empty() {
            if let Err(failure) = flush_pending(
                &self.store,
                &mut active.recording,
                &mut active.pending,
                true,
            ) {
                let _ = self
                    .store
                    .finish(&mut active.recording, Some(failure.clone()));
                return Err(failure);
            }
        }
        self.store.finish(&mut active.recording, error)
    }
}

#[cfg(test)]
mod tests;

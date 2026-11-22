//! The SSE parser behind one device-local chat call: it collects a provider's answer into whole
//! events, bounds it, and refuses anything a credential could be reflected through. The webview
//! relays what it emits; the server decides which frame ends the answer.

use crate::device_model_http::{contains_credential, Wire};
use serde_json::Value;

pub type Error = &'static str;
const MAX_FRAME: usize = 64 * 1024;
const MAX_STREAM: usize = 2 * 1024 * 1024;

/// Collects a provider's SSE answer and hands the webview only the frames it may relay: whole
/// events, never a credential the endpoint reflected back.
pub struct SseFrames {
    line: Vec<u8>,
    event: Option<String>,
    data: Option<String>,
    terminal: bool,
    total: usize,
}

impl SseFrames {
    pub fn new(wire: Wire) -> Self {
        Self { line: Vec::new(), event: None, data: None, terminal: wire == Wire::OpenAi, total: 0 }
    }

    /// One complete event, ready to be relayed. An Anthropic frame keeps its `event:` line.
    fn frame(&self) -> String {
        match &self.event {
            Some(event) => format!("event: {event}\ndata: {}\n\n", self.data.as_deref().unwrap_or_default()),
            None => format!("data: {}\n\n", self.data.as_deref().unwrap_or_default()),
        }
    }

    pub fn push(&mut self, chunk: &[u8], key: Option<&str>, emit: &mut impl FnMut(String) -> Result<(), Error>) -> Result<bool, Error> {
        self.total += chunk.len();
        if self.total > MAX_STREAM { return Err("invalid_response"); }
        for byte in chunk {
            if *byte != b'\n' {
                if self.line.len() >= MAX_FRAME - 3 { return Err("invalid_response"); }
                self.line.push(*byte);
                continue;
            }
            let line = std::str::from_utf8(&self.line).map_err(|_| "invalid_response")?.trim_end_matches('\r').to_owned();
            self.line.clear();
            if line.is_empty() {
                if self.event.is_some() || self.data.is_some() {
                    let frame = self.frame();
                    let done = self.data.as_deref() == Some("[DONE]");
                    // An Anthropic answer ends at `message_stop`; it is still an ordinary frame,
                    // because the server reads it as this call's terminal frame.
                    let stop = !self.terminal && self.event.as_deref() == Some("message_stop");
                    self.event = None;
                    self.data = None;
                    // An OpenAI answer ends at `[DONE]`; the webview sends that one with its end.
                    if done && self.terminal { return Ok(true); }
                    emit(frame)?;
                    if stop { return Ok(true); }
                }
                continue;
            }
            if let Some(event) = line.strip_prefix("event:") {
                if self.event.is_some() || self.data.is_some() { return Err("invalid_response"); }
                self.event = Some(event.trim().to_owned());
            } else if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data != "[DONE]" {
                    let parsed: Value = serde_json::from_str(data).map_err(|_| "invalid_response")?;
                    if !parsed.is_object() || key.is_some_and(|key| contains_credential(&parsed, key)) {
                        return Err("invalid_response");
                    }
                }
                self.data = Some(data.to_owned());
            } else if !line.starts_with(':') {
                return Err("invalid_response");
            }
        }
        Ok(false)
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_are_bounded_and_split_chunks_wait_for_a_complete_event() {
        let mut parser = SseFrames::new(Wire::OpenAi);
        let mut frames = Vec::new();
        let mut emit = |frame| { frames.push(frame); Ok(()) };
        assert!(!parser.push(b"data: {\"choices\":[]}", None, &mut emit).unwrap());
        assert!(parser.push(b"\r\n\r\ndata: [DONE]\n\n", None, &mut emit).unwrap());
        assert_eq!(frames, vec!["data: {\"choices\":[]}\n\n"]);
        assert!(SseFrames::new(Wire::OpenAi).push(&vec![b'a'; MAX_FRAME + 5], None, &mut |_| Ok(())).is_err());
        assert!(SseFrames::new(Wire::OpenAi).push(b"data: not-json\n\n", None, &mut |_| Ok(())).is_err());
    }

    /// Anthropic frames keep their `event:` line, and `message_stop` ends the call: it is the last
    /// frame the server expects, and the one it holds back until it reads our end.
    #[test]
    fn anthropic_frames_keep_their_event_name_and_send_message_stop() {
        let mut parser = SseFrames::new(Wire::Anthropic);
        let mut frames = Vec::new();
        let mut emit = |frame| { frames.push(frame); Ok(()) };
        let text = concat!(
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
        );
        assert!(parser.push(text.as_bytes(), None, &mut emit).unwrap());
        assert_eq!(frames, vec![
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ]);
    }

    #[test]
    fn a_reflected_credential_is_never_emitted() {
        let mut frames = SseFrames::new(Wire::OpenAi);
        let reflection = concat!(r#"data: {"choices":[{"delta":{"content":"Bearer synthetic-test-\u006bey"}}]}"#, "\n\n");
        assert_eq!(
            frames.push(reflection.as_bytes(), Some("synthetic-test-key"), &mut |_| {
                panic!("credential must not be emitted")
            }),
            Err("invalid_response"),
        );
    }
}

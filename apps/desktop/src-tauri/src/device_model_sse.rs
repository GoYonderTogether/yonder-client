//! The SSE parser behind one device-local chat call: it collects a provider's answer into whole
//! events, bounds it, and refuses anything a credential could be reflected through. The webview
//! relays what it emits; the server decides which frame ends the answer.
//!
//! An OpenAI answer ends at `[DONE]`, which the webview sends together with its end. An Anthropic
//! answer ends at `message_stop`, which must be a real frame whose `event:` name matches its body;
//! only then does the parser report the terminal.

use crate::device_model_http::{Wire, contains_credential};
use serde_json::Value;

pub type Error = &'static str;
const MAX_FRAME: usize = 64 * 1024;
const MAX_STREAM: usize = 2 * 1024 * 1024;

/// Collects a provider's SSE answer and hands the webview only the frames it may relay: whole
/// events, never a credential the endpoint reflected back.
pub struct SseFrames {
    wire: Wire,
    line: Vec<u8>,
    event: Option<(String, Option<String>)>,
    event_name: Option<String>,
    total: usize,
}

impl SseFrames {
    pub fn new(wire: Wire) -> Self {
        Self { wire, line: Vec::new(), event: None, event_name: None, total: 0 }
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
            let line = std::str::from_utf8(&self.line).map_err(|_| "invalid_response")?.trim_end_matches('\r');
            if line.is_empty() {
                let event_name = self.event_name.take();
                if let Some((event, kind)) = self.event.take() {
                    if self.wire == Wire::OpenAi {
                        if event == "[DONE]" { return Ok(true); }
                        emit(format!("data: {event}\n\n"))?;
                    } else {
                        let kind = kind.as_deref().ok_or("invalid_response")?;
                        if event_name.as_deref().is_some_and(|name| name != kind) { return Err("invalid_response"); }
                        // Only a real message_stop signals success; the bridge emits its canonical frame in the terminal batch.
                        if kind == "message_stop" { return Ok(true); }
                        let frame = format!("event: {kind}\ndata: {event}\n\n");
                        if frame.len() > MAX_FRAME { return Err("invalid_response"); }
                        emit(frame)?;
                    }
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if self.event.is_some() { return Err("invalid_response"); }
                let mut kind = None;
                if self.wire != Wire::OpenAi || data != "[DONE]" {
                    let parsed: Value = serde_json::from_str(data).map_err(|_| "invalid_response")?;
                    if !parsed.is_object() || key.is_some_and(|key| contains_credential(&parsed, key)) {
                        return Err("invalid_response");
                    }
                    if self.wire == Wire::Anthropic {
                        let name = parsed.get("type").and_then(Value::as_str).ok_or("invalid_response")?;
                        if name.is_empty() || name.len() > 64 || !name.bytes().all(|c| c.is_ascii_lowercase() || c == b'_') {
                            return Err("invalid_response");
                        }
                        kind = Some(name.to_owned());
                    }
                }
                self.event = Some((data.to_owned(), kind));
            } else if let Some(name) = line.strip_prefix("event:").filter(|_| self.wire == Wire::Anthropic) {
                if self.event_name.is_some() || name.len() > 65 { return Err("invalid_response"); }
                self.event_name = Some(name.trim().to_owned());
            } else if !line.starts_with(':') {
                return Err("invalid_response");
            }
            self.line.clear();
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
        ]);
    }

    #[test]
    fn anthropic_terminal_must_be_real_and_match_its_event() {
        let frame = |data: &str| SseFrames::new(Wire::Anthropic).push(data.as_bytes(), None, &mut |_| Ok(()));
        assert_eq!(frame("data: [DONE]\n\n"), Err("invalid_response"));
        assert_eq!(frame("event: message_stop\ndata: {\"type\":\"ping\"}\n\n"), Err("invalid_response"));
        assert_eq!(frame("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"), Ok(true));
    }

    #[test]
    fn a_reflected_credential_is_never_emitted() {
        let mut frames = SseFrames::new(Wire::OpenAi);
        let reflection = concat!(r#"data: {"choices":[{"delta":{"content":"Bearer synthetic-test-key"}}]}"#, "\n\n");
        assert_eq!(
            frames.push(reflection.as_bytes(), Some("synthetic-test-key"), &mut |_| {
                panic!("credential must not be emitted")
            }),
            Err("invalid_response"),
        );
    }
}
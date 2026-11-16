use crate::{
    desktop::DesktopRecorder,
    model::{valid_key, Recording},
    upload::{Session, UploadJob, UploadQueue},
};
use reqwest::blocking::{Client, Response};
use serde_json::{json, Value};

type Failure = (String, bool);
fn response(result: Result<Response, reqwest::Error>) -> Result<Value, Failure> {
    let response = result.map_err(|_| ("network_unavailable".into(), true))?;
    let code = response.status().as_u16();
    if code == 401 {
        return Err(("authentication_required".into(), false));
    }
    if !(200..300).contains(&code) {
        return Err((format!("http_{code}"), code == 429 || code >= 500));
    }
    response
        .json()
        .map_err(|_| ("invalid_response".into(), false))
}
fn still_current(queue: &UploadQueue, session: &Session) -> Result<(), Failure> {
    if queue.current(session) {
        Ok(())
    } else {
        Err(("owner_changed".into(), false))
    }
}

pub(crate) fn transmit(
    client: &Client,
    queue: &UploadQueue,
    session: &Session,
    job: &mut UploadJob,
    recording: &Recording,
    recorder: &DesktopRecorder,
) -> Result<(), Failure> {
    still_current(queue, session)?;
    let body = json!({"clientRecordingId": recording.id, "conversationId": job.conversation_id, "title": recording.title, "startedAt": recording.started_at, "endedAt": recording.ended_at, "state": recording.state, "segments": recording.segments});
    let meeting = response(
        client
            .post(format!("{}/v1/meetings", session.base))
            .bearer_auth(&session.token)
            .json(&body)
            .send(),
    )?;
    let id = meeting["id"]
        .as_str()
        .ok_or(("invalid_response".into(), false))?;
    valid_key(id).map_err(|_| ("invalid_response".into(), false))?;
    job.meeting_id = Some(id.into());
    still_current(queue, session)?;
    queue
        .save(&session.owner, job)
        .map_err(|_| ("storage_failed".into(), false))?;
    for segment in &recording.segments {
        still_current(queue, session)?;
        if meeting["segments"].as_array().is_some_and(|items| {
            items.iter().any(|s| {
                s["index"].as_u64() == Some(segment.index as u64)
                    && s["uploaded"].as_bool() == Some(true)
            })
        }) {
            continue;
        }
        let bytes = recorder
            .read_audio(session.owner.clone(), recording.id.clone(), segment.index)
            .map_err(|_| ("audio_unavailable".into(), false))?;
        response(
            client
                .post(format!(
                    "{}/v1/meetings/{id}/segments/{}",
                    session.base, segment.index
                ))
                .bearer_auth(&session.token)
                .header("Content-Type", "audio/wav")
                .body(bytes)
                .send(),
        )?;
    }
    still_current(queue, session)?;
    response(
        client
            .post(format!("{}/v1/meetings/{id}/process", session.base))
            .bearer_auth(&session.token)
            .json(&json!({}))
            .send(),
    )?;
    Ok(())
}

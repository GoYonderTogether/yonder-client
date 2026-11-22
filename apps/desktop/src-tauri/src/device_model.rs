use crate::{desktop_credentials as credentials, device_model_http::{self as http, Error}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    future::{poll_fn, Future},
    io::ErrorKind,
    path::PathBuf,
    pin::pin,
    sync::Mutex,
    task::Poll,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::Channel, AppHandle, Manager, State, WebviewWindow};
use tokio::sync::oneshot;

const MAX_ENDPOINTS: usize = 8;
const MAX_PENDING: usize = 4;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    owner_id: String,
    device_id: String,
    session_id: String,
}

/// `openai` speaks `/chat/completions`; `anthropic` speaks `/messages`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol { Openai, Anthropic }

impl Protocol {
    fn wire(self) -> http::Wire {
        match self {
            Protocol::Openai => http::Wire::OpenAi,
            Protocol::Anthropic => http::Wire::Anthropic,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    owner_id: String,
    device_id: String,
    endpoint_id: String,
    revision: u32,
    label: String,
    base_url: String,
    /// Absent in files written before local profiles carried a protocol; those were OpenAI.
    #[serde(default = "openai")]
    protocol: Protocol,
    #[serde(default)]
    uses_api_key: bool,
}

fn openai() -> Protocol { Protocol::Openai }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
    endpoint_id: String,
    revision: u32,
    label: String,
    protocol: Protocol,
}

impl Profile {
    fn owned(&self, context: &Context) -> bool {
        self.owner_id == context.owner_id && self.device_id == context.device_id
    }

    fn ready(self) -> Ready {
        Ready {
            endpoint_id: self.endpoint_id,
            revision: self.revision,
            label: self.label,
            protocol: self.protocol,
        }
    }
}

#[derive(Default)]
pub struct DeviceModelState(Mutex<Active>);

#[derive(Default)]
struct Active {
    context: Option<Context>,
    pending: HashMap<String, Option<oneshot::Sender<()>>>,
    generation: u64,
}

fn safe_id(id: &str) -> bool {
    (1..=100).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn endpoint_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    bytes.len() == 36 && bytes.iter().enumerate().all(|(i, c)| {
        match i {
            8 | 13 | 18 | 23 => *c == b'-',
            14 => *c == b'4',
            19 => matches!(*c, b'8' | b'9' | b'a' | b'b'),
            _ => c.is_ascii_digit() || (b'a'..=b'f').contains(c),
        }
    })
}

fn main_window(window: &WebviewWindow) -> Result<(), Error> {
    if window.label() != "main" { return Err("endpoint_unavailable"); }
    Ok(())
}

fn scope(active: &Active, context: &Context) -> Result<(), Error> {
    if active.context.as_ref() != Some(context) { return Err("endpoint_unavailable"); }
    Ok(())
}

fn path(app: &AppHandle) -> Result<PathBuf, Error> {
    app.path().app_local_data_dir().map(|base| base.join("device-model-endpoints-v1.json"))
        .map_err(|_| "endpoint_unavailable")
}

fn profiles(app: &AppHandle) -> Result<Vec<Profile>, Error> {
    let path = path(app)?;
    match fs::metadata(&path) {
        Ok(meta) if meta.len() > 256 * 1024 => return Err("endpoint_unavailable"),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("endpoint_unavailable"),
        _ => {}
    }
    let bytes = fs::read(path).map_err(|_| "endpoint_unavailable")?;
    serde_json::from_slice(&bytes).map_err(|_| "endpoint_unavailable")
}

fn save_profiles(app: &AppHandle, profiles: &[Profile]) -> Result<(), Error> {
    let path = path(app)?;
    let parent = path.parent().ok_or("endpoint_unavailable")?;
    fs::create_dir_all(parent).map_err(|_| "endpoint_unavailable")?;
    let tmp = path.with_extension("tmp");
    let bytes = serde_json::to_vec(profiles).map_err(|_| "endpoint_unavailable")?;
    fs::write(&tmp, bytes).map_err(|_| "endpoint_unavailable")?;
    fs::rename(tmp, path).map_err(|_| "endpoint_unavailable")
}

fn save_profile_key(app: &AppHandle, profiles: &mut [Profile], index: usize, key: &str) -> Result<(), Error> {
    let profile = &mut profiles[index];
    credentials::store_model_key(&profile.owner_id, &profile.device_id, &profile.endpoint_id, key)?;
    if profile.uses_api_key { return Ok(()); }
    profile.uses_api_key = true;
    if let Err(error) = save_profiles(app, profiles) {
        let profile = &profiles[index];
        credentials::remove_model_key(&profile.owner_id, &profile.device_id, &profile.endpoint_id);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn device_model_activate(window: WebviewWindow, state: State<'_, DeviceModelState>, context: Context) -> Result<(), Error> {
    main_window(&window)?;
    if [&context.owner_id, &context.device_id, &context.session_id].iter().any(|v| !safe_id(v)) {
        return Err("endpoint_unavailable");
    }
    let mut active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    if active.context.as_ref() != Some(&context) {
        active.pending.clear();
        active.generation = active.generation.wrapping_add(1);
        active.context = Some(context);
    }
    Ok(())
}

#[tauri::command]
pub fn device_model_reset(window: WebviewWindow, state: State<'_, DeviceModelState>, context: Context) -> Result<(), Error> {
    main_window(&window)?;
    let mut active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    if active.context.as_ref() == Some(&context) {
        active.pending.clear();
        active.generation = active.generation.wrapping_add(1);
        active.context = None;
    }
    Ok(())
}

#[tauri::command]
pub fn device_model_ready(
    window: WebviewWindow, app: AppHandle, state: State<'_, DeviceModelState>, context: Context,
) -> Result<Vec<Ready>, Error> {
    main_window(&window)?;
    let active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    scope(&active, &context)?;
    Ok(profiles(&app)?.into_iter().filter(|p| p.owned(&context)).map(Profile::ready).collect())
}

#[tauri::command]
pub fn device_model_register(
    window: WebviewWindow, app: AppHandle, state: State<'_, DeviceModelState>, context: Context,
    id: String, base_url: String, label: String, protocol: Protocol, api_key: Option<String>,
) -> Result<Ready, Error> {
    main_window(&window)?;
    let active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    scope(&active, &context)?;
    let base_url = http::local_base(&base_url)?.to_string();
    let label = label.trim();
    if !endpoint_id(&id) || label.is_empty() || label.chars().count() > 60
        || label.contains("://") || label.chars().any(char::is_control)
    {
        return Err("endpoint_unavailable");
    }
    let mut profiles = profiles(&app)?;
    if let Some(index) = profiles.iter().position(|p| p.owned(&context) && p.base_url == base_url) {
        // The address is what the profile is: re-registering it replaces its protocol and label.
        profiles[index].protocol = protocol;
        profiles[index].label = label.to_owned();
        if let Some(key) = api_key.as_deref() {
            save_profile_key(&app, &mut profiles, index, key)?;
        } else {
            save_profiles(&app, &profiles)?;
        }
        return Ok(profiles.swap_remove(index).ready());
    }
    if profiles.iter().any(|p| p.endpoint_id == id)
        || profiles.iter().filter(|p| p.owned(&context)).count() >= MAX_ENDPOINTS
        || profiles.len() >= 128
    {
        return Err("endpoint_unavailable");
    }
    let index = profiles.len();
    profiles.push(Profile {
        owner_id: context.owner_id, device_id: context.device_id,
        endpoint_id: id, revision: 1, label: label.to_owned(), base_url, protocol, uses_api_key: false,
    });
    if let Some(key) = api_key.as_deref() {
        save_profile_key(&app, &mut profiles, index, key)?;
    } else {
        save_profiles(&app, &profiles)?;
    }
    Ok(profiles.swap_remove(index).ready())
}

#[tauri::command]
pub fn device_model_set_key(
    window: WebviewWindow, app: AppHandle, state: State<'_, DeviceModelState>, context: Context,
    endpoint_id: String, api_key: String,
) -> Result<Ready, Error> {
    main_window(&window)?;
    let active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    scope(&active, &context)?;
    let mut profiles = profiles(&app)?;
    let index = profiles.iter().position(|p| p.owned(&context) && p.endpoint_id == endpoint_id)
        .ok_or("endpoint_unavailable")?;
    save_profile_key(&app, &mut profiles, index, &api_key)?;
    Ok(profiles.swap_remove(index).ready())
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Operation { Discover, Chat }

/// One device-local relay call, as the webview narrowed it from the server's request.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    relay_id: String,
    endpoint_id: String,
    revision: u32,
    expires_at_ms: u64,
    operation: Operation,
    protocol: Protocol,
    body: Option<Value>,
}

#[derive(Serialize)]
pub struct ResultData {
    #[serde(skip_serializing_if = "Option::is_none")]
    models: Option<Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum NativeFrame {
    Data { data: String },
    Done,
}

#[tauri::command]
pub async fn device_model_execute(
    window: WebviewWindow, app: AppHandle, state: State<'_, DeviceModelState>, context: Context,
    request: Request, channel: Channel<NativeFrame>,
) -> Result<ResultData, Error> {
    main_window(&window)?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_| "timeout")?.as_millis() as u64;
    let remaining = request.expires_at_ms.checked_sub(now).ok_or("timeout")?;
    if !safe_id(&request.relay_id) || !endpoint_id(&request.endpoint_id)
        || remaining == 0 || remaining > 125_000
    {
        return Err("endpoint_unavailable");
    }
    let (base, key, protocol, cancel, generation) = {
        let mut active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
        scope(&active, &context)?;
        if active.pending.len() >= MAX_PENDING || active.pending.contains_key(&request.relay_id) {
            return Err("endpoint_unavailable");
        }
        let profile = profiles(&app)?.into_iter().find(|p|
            p.owned(&context) && p.endpoint_id == request.endpoint_id && p.revision == request.revision
        ).ok_or("endpoint_unavailable")?;
        // The server picked this endpoint because of the protocol it announced; never answer with another.
        if profile.protocol != request.protocol { return Err("endpoint_unavailable"); }
        let base = http::local_base(&profile.base_url)?;
        let key = if profile.uses_api_key {
            Some(credentials::read_model_key(&profile.owner_id, &profile.device_id, &profile.endpoint_id)?
                .ok_or("endpoint_unavailable")?)
        } else {
            None
        };
        let (sender, receiver) = oneshot::channel();
        active.pending.insert(request.relay_id.clone(), Some(sender));
        (base, key, profile.protocol, receiver, active.generation)
    };
    let deadline = Duration::from_millis(remaining);
    let result = {
        let mut cancel = pin!(cancel);
        let mut work = pin!(async {
            match request.operation {
                Operation::Discover if request.body.is_none() => {
                    let models = http::discover(base, deadline.min(Duration::from_secs(30)), key.as_deref()).await?;
                    Ok(ResultData { models: Some(models) })
                }
                Operation::Chat => {
                    http::chat(base, deadline.min(Duration::from_secs(120)), key.as_deref(), protocol.wire(),
                        request.body.ok_or("upstream_rejected")?,
                        |data| channel.send(NativeFrame::Data { data }).map_err(|_| "cancelled")
                    ).await?;
                    channel.send(NativeFrame::Done).map_err(|_| "cancelled")?;
                    Ok(ResultData { models: None })
                }
                _ => Err("upstream_rejected"),
            }
        });
        poll_fn(|cx| {
            if cancel.as_mut().poll(cx).is_ready() { return Poll::Ready(Err("cancelled")); }
            work.as_mut().poll(cx)
        }).await
    };
    let mut active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    if active.generation != generation {
        return Err("cancelled");
    }
    active.pending.remove(&request.relay_id);
    result
}

#[tauri::command]
pub fn device_model_cancel(
    window: WebviewWindow, state: State<'_, DeviceModelState>, context: Context, relay_id: String,
) -> Result<(), Error> {
    main_window(&window)?;
    let mut active = state.0.lock().map_err(|_| "endpoint_unavailable")?;
    scope(&active, &context)?;
    if let Some(sender) = active.pending.get_mut(&relay_id).and_then(Option::take) {
        let _ = sender.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_explicit_v4_endpoint_ids() {
        assert!(endpoint_id("abcdefab-0123-4456-8abc-012345abcdef"));
        for invalid in ["../../data", "abcdefab-0123-4456-7abc-012345abcdef", "abcdefab-0123-5456-8abc-012345abcdef"] {
            assert!(!endpoint_id(invalid));
        }
    }
}

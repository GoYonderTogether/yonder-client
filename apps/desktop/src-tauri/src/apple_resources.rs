use crate::local_files_store::{Context, Grant, Store};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    ffi::c_void,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{async_runtime, plugin::TauriPlugin, AppHandle, Manager, Runtime};

mod commands;

#[derive(Default)]
struct AppleResources {
    store: Mutex<Store>,
    ready_epoch: AtomicU64,
}

impl AppleResources {
    fn invalidate_ready(&self) -> u64 {
        self.ready_epoch.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn complete_ready(
        &self,
        context: &Context,
        epoch: u64,
        allowed_sources: &[&str],
        connections: &[Revision],
    ) -> Result<Vec<Value>, String> {
        let mut store = self.store.lock().map_err(|_| "read_failed")?;
        store.require(context)?;
        if self.ready_epoch.load(Ordering::Relaxed) != epoch {
            return Err("cancelled".into());
        }
        let ready: Vec<_> = store
            .grants
            .iter()
            .filter(|grant| {
                grant.matches(context)
                    && allowed_sources.contains(&grant.connector_id.as_str())
                    && connections.iter().any(|entry| {
                        entry.id == grant.connection_id && entry.revision == grant.revision
                    })
            })
            .collect();
        let current = ready
            .iter()
            .map(|grant| json!({"id": grant.connection_id, "revision": grant.revision}))
            .collect();
        let allowed = ready
            .iter()
            .map(|grant| grant.connection_id.clone())
            .collect();
        for inactive in store.allowed.difference(&allowed) {
            store.cancel_connection(Some(inactive));
        }
        store.allowed = allowed;
        Ok(current)
    }
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum Source {
    AppleCalendar,
    ApplePhotos,
    AppleNotes,
}

impl Source {
    fn id(self) -> &'static str {
        match self {
            Self::AppleCalendar => "apple-calendar",
            Self::ApplePhotos => "apple-photos",
            Self::AppleNotes => "apple-notes",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Revision {
    id: String,
    revision: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppleGrant {
    #[serde(flatten)]
    connection: Revision,
    connector_id: Source,
}

type PermissionReply = extern "C" fn(*mut c_void, i32);

extern "C" {
    fn yonder_apple_calendar_status() -> i32;
    fn yonder_apple_photos_status() -> i32;
    fn yonder_apple_calendar_request(context: *mut c_void, reply: PermissionReply);
    fn yonder_apple_photos_request(context: *mut c_void, reply: PermissionReply);
    #[cfg(target_os = "ios")]
    fn yonder_ios_open_apple_resource_settings(context: *mut c_void, reply: PermissionReply);
    #[cfg(target_os = "macos")]
    fn yonder_apple_open_resource_settings(resource: i32) -> bool;
}

fn permission_name(status: i32) -> &'static str {
    match status {
        0 => "undetermined",
        1 => "granted",
        2 => "limited",
        3 => "denied",
        4 => "restricted",
        _ => "unsupported",
    }
}

fn permission_status(source: Source) -> &'static str {
    match source {
        Source::AppleCalendar => permission_name(unsafe { yonder_apple_calendar_status() }),
        Source::ApplePhotos => permission_name(unsafe { yonder_apple_photos_status() }),
        #[cfg(target_os = "macos")]
        Source::AppleNotes => crate::selected_note::status(false),
        #[cfg(not(target_os = "macos"))]
        Source::AppleNotes => "unsupported",
    }
}

fn grant_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("apple-resource-grants.json"))
        .map_err(|_| "read_failed".into())
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "operation_failed".to_string())?
}

#[tauri::command]
async fn statuses() -> Result<Value, String> {
    blocking(|| {
        let mut statuses = serde_json::Map::new();
        for source in [
            Source::AppleCalendar,
            Source::ApplePhotos,
            Source::AppleNotes,
        ] {
            statuses.insert(
                source.id().into(),
                Value::String(permission_status(source).into()),
            );
        }
        Ok(Value::Object(statuses))
    })
    .await
}

extern "C" fn permission_reply(context: *mut c_void, status: i32) {
    let sender = unsafe { Box::from_raw(context.cast::<async_runtime::Sender<i32>>()) };
    let _ = sender.try_send(status);
}

#[tauri::command]
async fn request_permission(connector_id: Source) -> Result<&'static str, String> {
    if connector_id == Source::AppleNotes {
        #[cfg(target_os = "macos")]
        return blocking(|| Ok(crate::selected_note::status(true))).await;
        #[cfg(not(target_os = "macos"))]
        return Ok("unsupported");
    }
    let (sender, mut receiver) = async_runtime::channel(1);
    let context = Box::into_raw(Box::new(sender)).cast();
    unsafe {
        match connector_id {
            Source::AppleCalendar => yonder_apple_calendar_request(context, permission_reply),
            Source::ApplePhotos => yonder_apple_photos_request(context, permission_reply),
            Source::AppleNotes => unreachable!(),
        }
    }
    Ok(permission_name(
        receiver.recv().await.ok_or("operation_failed")?,
    ))
}

#[tauri::command]
async fn open_settings(connector_id: Source) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let opened = blocking(move || {
        let resource = match connector_id {
            Source::AppleCalendar => 0,
            Source::ApplePhotos => 1,
            Source::AppleNotes => 2,
        };
        Ok(unsafe { yonder_apple_open_resource_settings(resource) })
    })
    .await?;
    #[cfg(target_os = "ios")]
    let opened = {
        if connector_id == Source::AppleNotes {
            return Err("unsupported".into());
        }
        let (sender, mut receiver) = async_runtime::channel(1);
        let context = Box::into_raw(Box::new(sender)).cast();
        unsafe { yonder_ios_open_apple_resource_settings(context, permission_reply) };
        receiver.recv().await == Some(1)
    };
    opened
        .then_some(())
        .ok_or_else(|| "open_settings_failed".into())
}

#[tauri::command]
async fn activate<R: Runtime>(app: AppHandle<R>, context: Context) -> Result<(), String> {
    blocking(move || {
        let file = grant_file(&app)?;
        let state = app.state::<AppleResources>();
        let mut store = state.store.lock().map_err(|_| "read_failed")?;
        let changed = store.context.as_ref() != Some(&context);
        store.activate(&file, context)?;
        if changed {
            state.invalidate_ready();
        }
        Ok(())
    })
    .await
}

#[tauri::command]
async fn reset<R: Runtime>(app: AppHandle<R>, context: Context) -> Result<(), String> {
    blocking(move || {
        let state = app.state::<AppleResources>();
        let mut store = state.store.lock().map_err(|_| "read_failed")?;
        if store.context.as_ref() == Some(&context) {
            store.reset();
            state.invalidate_ready();
        }
        Ok(())
    })
    .await
}

fn can_read(source: Source) -> bool {
    matches!(permission_status(source), "granted" | "limited")
}

fn can_read_granted(source: Source) -> bool {
    #[cfg(target_os = "macos")]
    if source == Source::AppleNotes {
        return crate::selected_note::status_for_grant() == "granted";
    }
    can_read(source)
}

#[tauri::command]
async fn authorize<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    grant: AppleGrant,
) -> Result<(), String> {
    let Revision { id, revision } = grant.connection;
    if id.is_empty() || id.len() > 128 || revision == 0 {
        return Err("permission_denied".into());
    }
    blocking(move || {
        if !can_read(grant.connector_id) {
            return Err("permission_denied".into());
        }
        let file = grant_file(&app)?;
        let state = app.state::<AppleResources>();
        let mut store = state.store.lock().map_err(|_| "read_failed")?;
        store.require(&context)?;
        let previous = store.grants.clone();
        let connector_id = grant.connector_id.id();
        let mut replaced = Vec::new();
        store.grants.retain(|entry| {
            if entry.matches(&context) && entry.connector_id == connector_id {
                replaced.push(entry.connection_id.clone());
                false
            } else {
                true
            }
        });
        store.grants.push(Grant {
            owner_id: context.owner_id,
            device_id: context.device_id,
            connection_id: id,
            root: PathBuf::new(),
            scope: "device".into(),
            connector_id: connector_id.into(),
            capabilities: Default::default(),
            revision,
        });
        if let Err(error) = store.persist(&file) {
            store.grants = previous;
            return Err(error);
        }
        state.invalidate_ready();
        for id in replaced {
            store.cancel_connection(Some(&id));
            store.allowed.remove(&id);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
async fn revoke<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    connection_id: String,
) -> Result<(), String> {
    blocking(move || {
        let state = app.state::<AppleResources>();
        let mut store = state.store.lock().map_err(|_| "read_failed")?;
        store.require(&context)?;
        state.invalidate_ready();
        store.cancel_connection(Some(&connection_id));
        store.allowed.remove(&connection_id);
        store
            .grants
            .retain(|entry| !entry.matches(&context) || entry.connection_id != connection_id);
        store.persist(&grant_file(&app)?)
    })
    .await
}

#[tauri::command]
async fn ready<R: Runtime>(
    app: AppHandle<R>,
    context: Context,
    connections: Vec<Revision>,
) -> Result<Vec<Value>, String> {
    blocking(move || {
        let state = app.state::<AppleResources>();
        let (epoch, sources) = {
            let store = state.store.lock().map_err(|_| "read_failed")?;
            store.require(&context)?;
            let present = |source: Source| {
                store.grants.iter().any(|grant| {
                    grant.matches(&context)
                        && grant.connector_id == source.id()
                        && connections.iter().any(|entry| {
                            entry.id == grant.connection_id && entry.revision == grant.revision
                        })
                })
            };
            let sources = [
                Source::AppleCalendar,
                Source::ApplePhotos,
                Source::AppleNotes,
            ]
            .into_iter()
            .filter(|source| present(*source))
            .collect::<Vec<_>>();
            (state.invalidate_ready(), sources)
        };
        // Notes may have to open in the background. Never launch it without a persisted current grant.
        let allowed_sources: Vec<_> = sources
            .into_iter()
            .filter(|source| can_read_granted(*source))
            .map(Source::id)
            .collect();
        state.complete_ready(&context, epoch, &allowed_sources, &connections)
    })
    .await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("yonder-apple-resources")
        .setup(|app, _| {
            app.manage(AppleResources::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            statuses,
            request_permission,
            open_settings,
            activate,
            reset,
            authorize,
            revoke,
            ready,
            commands::execute,
            commands::cancel,
        ])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_older_permission_check_cannot_restore_revoked_readiness() {
        let state = AppleResources::default();
        let context = Context {
            owner_id: "mem_a".into(),
            device_id: "dev_a".into(),
            session_id: "ses_a".into(),
        };
        let revision = Revision {
            id: "con_a".into(),
            revision: 1,
        };
        {
            let mut store = state.store.lock().unwrap();
            store.context = Some(context.clone());
            store.grants.push(Grant {
                owner_id: context.owner_id.clone(),
                device_id: context.device_id.clone(),
                connection_id: revision.id.clone(),
                connector_id: Source::AppleCalendar.id().into(),
                scope: "device".into(),
                root: PathBuf::new(),
                capabilities: Default::default(),
                revision: revision.revision,
            });
        }
        let earlier = state.invalidate_ready();
        let latest = state.invalidate_ready();
        assert!(state
            .complete_ready(&context, latest, &[], &[])
            .unwrap()
            .is_empty());
        assert_eq!(
            state.complete_ready(
                &context,
                earlier,
                &[Source::AppleCalendar.id()],
                &[revision]
            ),
            Err("cancelled".into()),
        );
        assert!(state.store.lock().unwrap().allowed.is_empty());
    }
}

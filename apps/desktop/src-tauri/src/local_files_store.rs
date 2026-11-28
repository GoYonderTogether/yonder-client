use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
#[cfg(desktop)]
use std::sync::Mutex;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub owner_id: String,
    pub device_id: String,
    pub session_id: String,
}

impl Context {
    pub fn valid(&self) -> bool {
        [&self.owner_id, &self.device_id, &self.session_id]
            .iter()
            .all(|s| {
                !s.is_empty()
                    && s.len() <= 128
                    && s.chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            })
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    #[serde(default)]
    pub file_tools: bool,
    /// `computer-control` only: the Bot may run commands as this system user (TOOLS-V3 §4).
    ///
    /// Absent in an authorization written before this field existed, and `false` is exactly right
    /// for it: a grant never widens silently into shell access.
    #[serde(default)]
    pub terminal: bool,
    /// `computer-control` only: computer use — see and operate the screen (desktop control design §5).
    ///
    /// Its own capability, never implied by `file_tools` or `terminal`. Absent in an authorization
    /// written before this field existed, and `false` is right for it: a grant never widens silently
    /// into desktop control.
    #[serde(default)]
    pub desktop: bool,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Grant {
    pub owner_id: String,
    pub device_id: String,
    pub connection_id: String,
    pub root: PathBuf,
    #[serde(default = "folder_scope")]
    pub scope: String,
    #[serde(default = "read_connector")]
    pub connector_id: String,
    #[serde(default)]
    pub capabilities: Capabilities,
    #[serde(default = "initial_revision")]
    pub revision: u64,
}

fn folder_scope() -> String {
    "folder".into()
}
fn read_connector() -> String {
    "local-files".into()
}
fn initial_revision() -> u64 {
    1
}

impl Grant {
    pub fn matches(&self, context: &Context) -> bool {
        self.owner_id == context.owner_id && self.device_id == context.device_id
    }
}

#[derive(Default)]
pub struct Store {
    pub context: Option<Context>,
    pub grants: Vec<Grant>,
    pub allowed: HashSet<String>,
    pub loaded: bool,
    pub running: HashMap<String, (String, std::sync::Arc<std::sync::atomic::AtomicBool>)>,
}

#[cfg(desktop)]
pub type LocalFilesState = Mutex<Store>;

impl Store {
    pub fn grant_for(&self, context: &Context, connection_id: &str) -> Result<Grant, String> {
        self.require(context)?;
        if !self.allowed.contains(connection_id) {
            return Err("permission_denied".into());
        }
        self.grants
            .iter()
            .find(|g| g.matches(context) && g.connection_id == connection_id)
            .cloned()
            .ok_or_else(|| "permission_denied".into())
    }
    pub fn cancel_connection(&self, id: Option<&str>) {
        for (connection, flag) in self.running.values() {
            if id.map_or(true, |id| connection == id) {
                flag.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        }
    }
    pub fn require(&self, context: &Context) -> Result<(), String> {
        if context.valid() && self.context.as_ref() == Some(context) {
            Ok(())
        } else {
            Err("permission_denied".into())
        }
    }

    pub fn activate(&mut self, file: &Path, context: Context) -> Result<(), String> {
        if !context.valid() {
            return Err("permission_denied".into());
        }
        if !self.loaded {
            self.grants = match fs::read(file) {
                Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "read_failed")?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                Err(_) => return Err("read_failed".into()),
            };
            self.loaded = true;
        }
        if self.context.as_ref() != Some(&context) {
            self.cancel_connection(None);
            self.allowed.clear();
        }
        self.context = Some(context.clone());
        Ok(())
    }

    pub fn persist(&self, file: &Path) -> Result<(), String> {
        let parent = file.parent().ok_or("read_failed")?;
        fs::create_dir_all(parent).map_err(|_| "read_failed")?;
        let temp = file.with_extension(format!("{}.tmp", std::process::id()));
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut output = options.open(&temp).map_err(|_| "read_failed")?;
            let bytes = serde_json::to_vec(&self.grants).map_err(|_| "read_failed")?;
            output.write_all(&bytes).map_err(|_| "read_failed")?;
            output.sync_all().map_err(|_| "read_failed")?;
            fs::rename(&temp, file).map_err(|_| "read_failed")
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result.map_err(str::to_owned)
    }

    pub fn reset(&mut self) {
        self.cancel_connection(None);
        self.context = None;
        self.allowed.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grants_survive_login_but_only_the_current_account_device_and_session_can_execute() {
        let file = std::env::temp_dir().join(format!("yonder-grants-{}.json", std::process::id()));
        let a = Context {
            owner_id: "mem_a".into(),
            device_id: "dev_a".into(),
            session_id: "ses_a".into(),
        };
        let mut store = Store {
            loaded: true,
            context: Some(a.clone()),
            ..Store::default()
        };
        store.grants.push(Grant {
            owner_id: a.owner_id.clone(),
            device_id: a.device_id.clone(),
            connection_id: "con_a".into(),
            root: std::env::temp_dir(),
            scope: "folder".into(),
            connector_id: "local-files".into(),
            capabilities: Capabilities::default(),
            revision: 1,
        });
        store.persist(&file).unwrap();
        let mut restored = Store::default();
        restored.activate(&file, a.clone()).unwrap();
        assert_eq!(restored.grants.len(), 1);
        restored.allowed.insert("con_a".into());
        assert!(restored.grant_for(&a, "con_a").is_ok());
        assert!(restored
            .grant_for(
                &Context {
                    owner_id: "mem_other".into(),
                    ..a.clone()
                },
                "con_a"
            )
            .is_err());
        assert!(restored
            .grant_for(
                &Context {
                    device_id: "dev_other".into(),
                    ..a.clone()
                },
                "con_a"
            )
            .is_err());
        let b = Context {
            session_id: "ses_new".into(),
            ..a.clone()
        };
        restored.activate(&file, b.clone()).unwrap();
        assert_eq!(restored.grants.len(), 1);
        assert!(restored.require(&a).is_err());
        assert!(restored.grants[0].matches(&b));
        assert!(restored.grant_for(&b, "con_a").is_err());
        restored.allowed.insert("con_a".into());
        assert!(restored.grant_for(&b, "con_a").is_ok());
        let other = Context {
            owner_id: "mem_other".into(),
            ..b.clone()
        };
        restored.activate(&file, other.clone()).unwrap();
        restored.allowed.insert("con_a".into());
        assert!(restored.grant_for(&other, "con_a").is_err());
        restored.reset();
        assert!(restored.require(&b).is_err());
        assert!(restored.grant_for(&b, "con_a").is_err());
        assert!(restored.allowed.is_empty());
        assert!(file.exists());
        fs::remove_file(file).unwrap();
    }
}

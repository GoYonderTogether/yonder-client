use keyring::{Entry, Error};
use tauri::WebviewWindow;

const REFRESH_SERVICE: &str = "dev.yonder.desktop";
const REFRESH_ACCOUNT: &str = "refresh-token";
const MODEL_SERVICE: &str = "dev.yonder.desktop.device-model";
const UNAVAILABLE: &str = "endpoint_unavailable";

fn main_window(window: &WebviewWindow) -> Result<(), &'static str> {
    if window.label() != "main" {
        return Err(UNAVAILABLE);
    }
    Ok(())
}

fn read(entry: Entry) -> Result<Option<String>, &'static str> {
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err(UNAVAILABLE),
    }
}

#[tauri::command]
pub fn get_desktop_refresh_token(window: WebviewWindow) -> Result<Option<String>, &'static str> {
    main_window(&window)?;
    read(Entry::new(REFRESH_SERVICE, REFRESH_ACCOUNT).map_err(|_| UNAVAILABLE)?)
}

#[tauri::command]
pub fn set_desktop_refresh_token(window: WebviewWindow, value: Option<String>) -> Result<(), &'static str> {
    main_window(&window)?;
    let entry = Entry::new(REFRESH_SERVICE, REFRESH_ACCOUNT).map_err(|_| UNAVAILABLE)?;
    match value {
        Some(token) => entry.set_password(&token).map_err(|_| UNAVAILABLE),
        None => remove(entry),
    }
}

fn remove(entry: Entry) -> Result<(), &'static str> {
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(_) => Err(UNAVAILABLE),
    }
}

fn model_entry(owner: &str, device: &str, endpoint: &str) -> Result<Entry, &'static str> {
    // All three IDs have already been validated and cannot contain a colon.
    Entry::new(MODEL_SERVICE, &format!("{owner}:{device}:{endpoint}")).map_err(|_| UNAVAILABLE)
}

pub fn read_model_key(owner: &str, device: &str, endpoint: &str) -> Result<Option<String>, &'static str> {
    read(model_entry(owner, device, endpoint)?)
}

pub fn store_model_key(owner: &str, device: &str, endpoint: &str, key: &str) -> Result<(), &'static str> {
    super::device_model_http::validate_key(key)?;
    model_entry(owner, device, endpoint)?.set_password(key).map_err(|_| UNAVAILABLE)
}

pub fn remove_model_key(owner: &str, device: &str, endpoint: &str) {
    if let Ok(entry) = model_entry(owner, device, endpoint) {
        let _ = remove(entry);
    }
}

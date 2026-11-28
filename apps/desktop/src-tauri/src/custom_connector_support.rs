//! Small pieces the custom connector commands share: the window check, the deadline parser and the
//! registry of live calls (20261128-people-archive 03).
//!
//! They live apart from the commands so each command file stays readable and under the repository's
//! length limit; nothing here reads a package or touches the network.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::WebviewWindow;

/// Commands run for the main window only: a second window of the app, or the add-contact popup,
/// must never reach an owner's package.
pub fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("permission_denied".into())
    }
}

/// Epoch milliseconds for the instant the server sends, `YYYY-MM-DDTHH:MM:SS(.sss)Z`. Only that
/// shape is accepted; a call with an unreadable deadline does not run.
pub fn parse_iso_ms(text: &str) -> Option<u64> {
    let bytes = text.as_bytes();
    let shaped = bytes.len() >= 20
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes.ends_with(b"Z");
    if !shaped {
        return None;
    }
    let frac = if bytes.len() > 20 && bytes[19] == b'.' { number(text, 20, bytes.len() - 1)? } else { 0 };
    if frac > 999 {
        return None;
    }
    let (year, month, day) = (number(text, 0, 4)?, number(text, 5, 7)?, number(text, 8, 10)?);
    let (hour, minute, second) = (number(text, 11, 13)?, number(text, 14, 16)?, number(text, 17, 19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    // Days since the epoch by the civil-from-days algorithm, so one comparison needs no date crate.
    let (y, m) = if month <= 2 { (year - 1, month + 12) } else { (year, month) };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m - 3) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let seconds = days * 86_400 + hour * 3600 + minute * 60 + second;
    u64::try_from(seconds).ok().map(|value| value * 1_000 + frac as u64)
}

fn number(text: &str, start: usize, end: usize) -> Option<i64> {
    let part = text.get(start..end)?;
    if !part.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    part.parse().ok()
}



/// Which calls are live, so a cancel reaches one and a package that lost its grant ends them all.
#[derive(Default)]
pub struct CustomConnectorState {
    /// Call id → the connection it runs for and the flag that ends it.
    running: std::sync::Mutex<std::collections::HashMap<String, (String, Arc<AtomicBool>)>>,
}

impl CustomConnectorState {
    pub fn track(&self, call_id: &str, connection_id: &str, flag: Arc<AtomicBool>) {
        if let Ok(mut running) = self.running.lock() {
            running.insert(call_id.to_owned(), (connection_id.to_owned(), flag));
        }
    }
    pub fn untrack(&self, call_id: &str) {
        if let Ok(mut running) = self.running.lock() {
            running.remove(call_id);
        }
    }
    pub fn cancel(&self, call_id: &str) {
        if let Ok(running) = self.running.lock() {
            if let Some((_, flag)) = running.get(call_id) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
    /// A connection that is no longer installed has no live call: every call bound to it ends now,
    /// so a package the owner disconnected cannot keep running on the old grant.
    pub fn keep(&self, installed: &[String]) {
        if let Ok(running) = self.running.lock() {
            for (connection_id, flag) in running.values() {
                if !installed.iter().any(|id| id == connection_id) {
                    flag.store(true, Ordering::SeqCst);
                }
            }
        }
    }
}
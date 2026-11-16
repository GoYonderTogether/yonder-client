//! The native confirmation shown before a broad local-file grant is stored.
//!
//! The webview chooses *what* to ask for (`scope`, `connectorId`, `capabilities`); this module is
//! what makes the person decide *whether* it is granted. A grant that reaches the whole device, or
//! that lets a connector create, edit or delete files, is shown as a native message box owned by
//! the main window. Nothing in the page can open, answer or suppress it: the box is built and shown
//! in Rust, and the webview has no dialog plugin or capability at all.
//!
//! Folder-scoped read-only grants do not come through here. Picking one folder is the same gesture
//! as confirming it, and that grant cannot change files.

use crate::local_files_store::{Capabilities, Grant};

/// True when the requested grant is broader than "read one folder the person picked".
pub fn needs_confirmation(scope: &str, connector: &str, capabilities: &Capabilities) -> bool {
    scope == "device" || connector == "computer-control" || capabilities.file_tools
}

/// True when an existing grant already reaches everything the request asks for.
///
/// The connector panel re-authorizes the previous grant when a save fails part-way, and a
/// reconnect re-sends the same grant. Neither widens anything, so neither should ask again: the
/// person already answered that question for this connection. A request that reaches further
/// (folder → device, read → write, a different connector) always asks.
fn covers(existing: &Grant, scope: &str, connector: &str, capabilities: &Capabilities) -> bool {
    existing.connector_id == connector
        && (existing.scope == "device" || scope == "folder")
        && (existing.capabilities.file_tools || !capabilities.file_tools)
}

/// Whether the person must be asked before this grant is stored.
pub fn must_ask(
    existing: Option<&Grant>,
    scope: &str,
    connector: &str,
    capabilities: &Capabilities,
) -> bool {
    needs_confirmation(scope, connector, capabilities)
        && !existing.is_some_and(|grant| covers(grant, scope, connector, capabilities))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Language {
    Chinese,
    English,
    Bilingual,
}

/// The interface picks its language from the system locale at start-up (`apps/web/index.html`), so
/// the confirmation uses the same source. An unknown locale gets both languages rather than a guess
/// the person may not read.
fn language() -> Language {
    let tag = sys_locale::get_locale()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if tag.starts_with("zh") {
        Language::Chinese
    } else if tag.starts_with("en") {
        Language::English
    } else {
        Language::Bilingual
    }
}

struct Texts {
    title: String,
    message: String,
    allow: String,
    deny: String,
}

fn texts(scope: &str, capabilities: &Capabilities) -> Texts {
    let device = scope == "device";
    let write = capabilities.file_tools;
    let chinese = format!(
        "一个连接器正在请求访问这台电脑上的文件。\n\n范围：{}\n权限：{}\n\n只有你点击「允许」后才会授予；拒绝不会改变现有授权。",
        if device {
            "整台电脑（所有文件夹）"
        } else {
            "已选择的文件夹"
        },
        if write {
            "读取、创建、修改和删除文件"
        } else {
            "读取文件"
        }
    );
    let english = format!(
        "A connector is asking for access to files on this computer.\n\nScope: {}\nAccess: {}\n\nNothing is granted unless you choose Allow; Deny leaves the current grants unchanged.",
        if device {
            "the whole computer (every folder)"
        } else {
            "the folder you selected"
        },
        if write {
            "read, create, edit and delete files"
        } else {
            "read files"
        }
    );
    match language() {
        Language::Chinese => Texts {
            title: "Yonder 需要本机文件权限".into(),
            message: chinese,
            allow: "允许".into(),
            deny: "拒绝".into(),
        },
        Language::English => Texts {
            title: "Yonder needs file access".into(),
            message: english,
            allow: "Allow".into(),
            deny: "Deny".into(),
        },
        Language::Bilingual => Texts {
            title: "Yonder — 本机文件权限 / file access".into(),
            message: format!("{chinese}\n\n{english}"),
            allow: "允许 / Allow".into(),
            deny: "拒绝 / Deny".into(),
        },
    }
}

/// Shows the confirmation and reports whether the person allowed the grant.
///
/// Blocking; call it from a blocking context, never from the main thread. `rfd` marshals the alert
/// to the main thread itself and the caller waits for the answer.
pub fn confirm(app: &tauri::AppHandle, scope: &str, capabilities: &Capabilities) -> bool {
    use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
    use tauri::Manager;

    let texts = texts(scope, capabilities);
    let mut dialog = MessageDialog::new()
        .set_title(texts.title)
        .set_description(texts.message)
        .set_level(MessageLevel::Warning)
        .set_buttons(MessageButtons::OkCancelCustom(texts.allow, texts.deny));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    matches!(
        dialog.show(),
        MessageDialogResult::Ok | MessageDialogResult::Yes | MessageDialogResult::Custom(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caps(file_tools: bool) -> Capabilities {
        Capabilities { file_tools }
    }

    #[test]
    fn only_grants_that_reach_past_one_read_only_folder_are_confirmed() {
        assert!(!needs_confirmation("folder", "local-files", &caps(false)));
        assert!(needs_confirmation("folder", "local-files", &caps(true)));
        assert!(needs_confirmation("folder", "computer-control", &caps(false)));
        assert!(needs_confirmation("device", "local-files", &caps(false)));
        assert!(needs_confirmation("device", "computer-control", &caps(true)));
    }

    #[test]
    fn the_message_names_the_scope_and_the_access() {
        let device = texts("device", &caps(true));
        assert!(
            device.message.contains("整台电脑") || device.message.contains("whole computer"),
            "{}",
            device.message
        );
        let folder = texts("folder", &caps(false));
        assert!(
            folder.message.contains("已选择的文件夹") || folder.message.contains("folder you selected"),
            "{}",
            folder.message
        );
    }

    fn grant(scope: &str, connector: &str, file_tools: bool) -> Grant {
        Grant {
            owner_id: "mem_a".into(),
            device_id: "dev_a".into(),
            connection_id: "con_a".into(),
            root: std::env::temp_dir(),
            scope: scope.into(),
            connector_id: connector.into(),
            capabilities: caps(file_tools),
            revision: 1,
        }
    }

    #[test]
    fn a_repeat_of_an_answered_grant_does_not_ask_again_but_a_wider_one_does() {
        let device_write = grant("device", "computer-control", true);
        // The panel's rollback re-authorizes what was already stored; a reconnect resends it.
        assert!(!must_ask(
            Some(&device_write),
            "device",
            "computer-control",
            &caps(true)
        ));
        assert!(!must_ask(
            Some(&device_write),
            "folder",
            "computer-control",
            &caps(true)
        ));
        // Reaching further always asks: more scope, more access, a different connector.
        assert!(must_ask(
            Some(&device_write),
            "device",
            "local-files",
            &caps(false)
        ));
        let folder_read = grant("folder", "local-files", false);
        assert!(must_ask(
            Some(&folder_read),
            "device",
            "local-files",
            &caps(false)
        ));
        assert!(must_ask(
            Some(&folder_read),
            "folder",
            "local-files",
            &caps(true)
        ));
        // A first grant always asks when it is broad.
        assert!(must_ask(None, "device", "computer-control", &caps(true)));
        // A first read-only folder grant does not.
        assert!(!must_ask(None, "folder", "local-files", &caps(false)));
    }
}

use serde::Serialize;
use tauri::{Manager, ResourceId, Webview};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    raw_json: serde_json::Value,
}

#[tauri::command]
pub fn restore_channel_update(
    webview: Webview,
    manifest: serde_json::Value,
    expected_version: String,
    returning_to_stable: bool,
) -> Result<Option<UpdateMetadata>, String> {
    if webview.label() != "main" {
        return Err("Only the main window checks account update channels".into());
    }
    let updater = webview
        .updater_builder()
        .version_comparator(move |current, release| {
            release.version.to_string() == expected_version
                && (release.version > current || (returning_to_stable && release.version < current))
        })
        .build()
        .map_err(|error| error.to_string())?;
    let Some(update) = updater
        .restore_update(manifest)
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    let url = &update.download_url;
    let version_prefix = format!("/desktop/{}/", update.version);
    if url.scheme() != "https"
        || url.host_str() != Some("dl.zethai.cn")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.path().starts_with(&version_prefix)
    {
        return Err("Untrusted desktop update download URL".into());
    }
    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}

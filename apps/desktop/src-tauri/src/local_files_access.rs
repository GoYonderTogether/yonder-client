use std::io::{Error, ErrorKind};
use std::path::{Component, Path, PathBuf};

pub(crate) fn existing_path_error(error: Error) -> &'static str {
    match error.kind() {
        ErrorKind::PermissionDenied => "permission_denied",
        _ => "not_found",
    }
}

pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, &'static str> {
    let path = Path::new(relative);
    if relative.is_empty()
        || relative.len() > 2048
        || relative.contains(['\\', ':', '\0'])
        || path.is_absolute()
        || path.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("path_invalid");
    }
    let actual_root = root.canonicalize().map_err(|_| "permission_denied")?;
    if actual_root != root {
        return Err("permission_denied");
    }
    let mut part = root.to_path_buf();
    for component in path.components() {
        part.push(component);
        if std::fs::symlink_metadata(&part)
            .map(|m| crate::local_files_text::link_like(&m))
            .unwrap_or(false)
        {
            return Err("unsupported_file");
        }
    }
    let target = root
        .join(path)
        .canonicalize()
        .map_err(existing_path_error)?;
    if !target.starts_with(root) {
        return Err("path_invalid");
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_files_store::{Capabilities, Context, Grant};
    use serde_json::{json, Value};
    use std::fs;

    #[test]
    fn separates_permission_errors_from_missing_paths() {
        assert_eq!(
            existing_path_error(ErrorKind::PermissionDenied.into()),
            "permission_denied"
        );
        assert_eq!(existing_path_error(ErrorKind::NotFound.into()), "not_found");
    }

    fn execute(root: &Path, operation: &str, path: &str) -> Result<Value, &'static str> {
        let context = Context {
            owner_id: "mem_fixture".into(),
            device_id: "dev_fixture".into(),
            session_id: "ses_fixture".into(),
        };
        let grant = Grant {
            owner_id: context.owner_id.clone(),
            device_id: context.device_id.clone(),
            connection_id: "con_fixture".into(),
            root: root.to_path_buf(),
            scope: "folder".into(),
            connector_id: "local-files".into(),
            capabilities: Capabilities::default(),
            revision: 1,
        };
        crate::local_files_operations::execute(
            &grant,
            &context,
            operation,
            path,
            &json!({}),
            &root.join("recovery"),
            &std::sync::atomic::AtomicBool::new(false),
            u64::MAX,
        )
    }

    #[test]
    fn reads_only_bounded_text_inside_the_selected_folder() {
        let base = std::env::temp_dir().join(format!("yonder-local-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("selected");
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        fs::write(root.join("note.txt"), "fixture text").unwrap();
        fs::write(base.join("outside.txt"), "outside").unwrap();
        fs::write(root.join("large.txt"), vec![b'x'; 65537]).unwrap();
        fs::write(root.join("binary"), [0, 1, 2]).unwrap();
        fs::write(root.join("non-utf8"), [255, 254]).unwrap();
        assert_eq!(
            execute(&root, "read", "note.txt").unwrap()["content"],
            "fixture text"
        );
        assert_eq!(
            execute(&root, "read", "../outside.txt"),
            Err("path_invalid")
        );
        assert_eq!(execute(&root, "read", "/etc/passwd"), Err("path_invalid"));
        assert_eq!(
            execute(&root, "read", "C:\\outside.txt"),
            Err("path_invalid")
        );
        assert_eq!(execute(&root, "read", "large.txt"), Err("line_too_long"));
        assert_eq!(execute(&root, "read", "binary"), Err("unsupported_file"));
        assert_eq!(execute(&root, "read", "non-utf8"), Err("unsupported_file"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(base.join("outside.txt"), root.join("escape")).unwrap();
            assert_eq!(execute(&root, "read", "escape"), Err("unsupported_file"));
            assert!(!execute(&root, "list", ".").unwrap()["entries"]
                .as_array()
                .unwrap()
                .iter()
                .any(|e| e["name"] == "escape"));
        }
        for index in 0..205 {
            fs::write(root.join(format!("entry-{index}")), "text").unwrap();
        }
        let listed = execute(&root, "list", ".").unwrap();
        assert!(listed["entries"].as_array().unwrap().len() <= 200);
        assert_eq!(listed["truncated"], true);
        #[cfg(unix)]
        {
            let outside = base.join("outside-dir");
            fs::create_dir(&outside).unwrap();
            fs::write(outside.join("secret.txt"), "outside").unwrap();
            fs::rename(&root, base.join("selected-old")).unwrap();
            std::os::unix::fs::symlink(outside, &root).unwrap();
            assert_eq!(
                execute(&root, "read", "secret.txt"),
                Err("permission_denied")
            );
        }
        fs::remove_dir_all(base).unwrap();
    }
}

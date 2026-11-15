use super::*;

#[test]
fn search_paths_use_posix_for_folders_and_preserve_native_device_paths() {
    assert_eq!(
        search_result_path(Path::new(r"sub\file.txt"), true),
        "sub/file.txt"
    );
    assert_eq!(
        search_result_path(Path::new(r"C:\data\file.txt"), false),
        r"C:\data\file.txt"
    );
}
use crate::local_files_store::Capabilities;
#[test]
fn whole_device_fixture_create_cas_delete_restore_and_old_folder_scope() {
    let root = std::env::temp_dir().join(format!("yonder-modify-fixture-{}", nonce()));
    fs::create_dir_all(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let recovery = root.join("recovery");
    let context = Context {
        owner_id: "mem_test".into(),
        device_id: "dev_test".into(),
        session_id: "ses_test".into(),
    };
    let read = Grant {
        owner_id: context.owner_id.clone(),
        device_id: context.device_id.clone(),
        connection_id: "con_read".into(),
        root: PathBuf::new(),
        scope: "device".into(),
        connector_id: "local-files".into(),
        capabilities: Capabilities { file_tools: false },
        revision: 2,
    };
    let write = Grant {
        connection_id: "con_write".into(),
        connector_id: "computer-control".into(),
        capabilities: Capabilities { file_tools: true },
        ..read.clone()
    };
    let cancel = AtomicBool::new(false);
    let path = root.join("fixture.txt").to_string_lossy().into_owned();
    let call = |grant: &Grant, op: &str, path: &str, args: Value| {
        execute(
            grant,
            &context,
            op,
            path,
            &args,
            &recovery,
            &cancel,
            u64::MAX,
        )
    };
    let created = call(&write, "create", &path, json!({"content":"one"})).unwrap();
    assert_eq!(created["hash"], hash(b"one"));
    assert_eq!(
        call(&write, "create", &path, json!({"content":"overwrite"})),
        Err("already_exists")
    );
    assert_eq!(
        call(
            &write,
            "edit",
            &path,
            json!({"content":"two","expectedHash":hash(b"unread")})
        ),
        Err("conflict")
    );
    call(
        &write,
        "edit",
        &path,
        json!({"content":"two","expectedHash":hash(b"one")}),
    )
    .unwrap();
    assert_eq!(
        call(&read, "read", &path, json!({})).unwrap()["content"],
        "two"
    );
    assert_eq!(
        call(&read, "delete", &path, json!({"expectedHash":hash(b"two")})),
        Err("permission_denied")
    );
    let deleted = call(
        &write,
        "delete",
        &path,
        json!({"expectedHash":hash(b"two")}),
    )
    .unwrap();
    assert!(!Path::new(&path).exists());
    assert_eq!(
        call(
            &write,
            "restore",
            root.join("wrong-target.txt").to_str().unwrap(),
            json!({"recoveryId":deleted["recoveryId"]})
        ),
        Err("path_invalid")
    );
    call(
        &write,
        "restore",
        "",
        json!({"recoveryId":deleted["recoveryId"]}),
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "two");
    let deleted_again = call(
        &write,
        "delete",
        &path,
        json!({"expectedHash":hash(b"two")}),
    )
    .unwrap();
    let reconnected = Grant {
        connection_id: "con_reconnected".into(),
        ..write.clone()
    };
    let session = Context {
        session_id: "ses_new".into(),
        ..context.clone()
    };
    let foreign = Context {
        owner_id: "mem_foreign".into(),
        ..session.clone()
    };
    assert_eq!(
        execute(
            &reconnected,
            &foreign,
            "restore",
            "",
            &json!({"recoveryId":deleted_again["recoveryId"]}),
            &recovery,
            &cancel,
            u64::MAX
        ),
        Err("permission_denied")
    );
    execute(
        &reconnected,
        &session,
        "restore",
        &path,
        &json!({}),
        &recovery,
        &cancel,
        u64::MAX,
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "two");

    let old:Grant=serde_json::from_value(json!({"owner_id":context.owner_id,"device_id":context.device_id,"connection_id":"old","root":root})).unwrap();
    assert_eq!(old.scope, "folder");
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested").join("search.txt"), "fixture").unwrap();
    let found = call(&old, "search", ".", json!({"query":"search.txt"})).unwrap();
    assert_eq!(found["entries"][0]["path"], "nested/search.txt");
    assert!(call(&old, "read", &path, json!({})).is_err());
    assert_eq!(
        call(&old, "read", "fixture.txt", json!({})).unwrap()["content"],
        "two"
    );
    assert_eq!(
        call(&read, "index", root.to_str().unwrap(), json!({})).unwrap()["kind"],
        "index"
    );
    cancel.store(true, Ordering::SeqCst);
    assert_eq!(
        call(
            &write,
            "create",
            root.join("cancelled").to_str().unwrap(),
            json!({"content":"no"})
        ),
        Err("cancelled")
    );
    fs::remove_dir_all(root).unwrap();
}

use super::*;
use crate::local_files_mutations::nonce;
use crate::local_files_text::hash;
use std::sync::atomic::Ordering;

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

#[test]
fn paged_read_and_local_edit_preserve_versions_and_newlines() {
    let root = std::env::temp_dir().join(format!("yonder-v2-{}", nonce()));
    fs::create_dir_all(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let context = Context {
        owner_id: "owner".into(),
        device_id: "device".into(),
        session_id: "session".into(),
    };
    let read = Grant {
        owner_id: context.owner_id.clone(),
        device_id: context.device_id.clone(),
        connection_id: "read".into(),
        root: root.clone(),
        scope: "folder".into(),
        connector_id: "local-files".into(),
        capabilities: Capabilities::default(),
        revision: 1,
    };
    let write = Grant {
        scope: "device".into(),
        connector_id: "computer-control".into(),
        capabilities: Capabilities { file_tools: true },
        ..read.clone()
    };
    let cancel = AtomicBool::new(false);
    let call = |grant: &Grant, op: &str, path: &str, args: Value| {
        execute(
            grant,
            &context,
            op,
            path,
            &args,
            &root.join("recovery"),
            &cancel,
            u64::MAX,
        )
    };
    let body = format!("{}last\n", "line\n".repeat(20000));
    fs::write(root.join("large"), &body).unwrap();
    let page = call(&read, "read", "large", json!({"offset": 100, "limit": 2})).unwrap();
    assert_eq!(page["content"], "line\nline");
    assert_eq!(page["startLine"], 100);
    assert_eq!(page["endLine"], 101);
    assert_eq!(page["totalLines"], 20001);
    assert_eq!(page["hash"], hash(body.as_bytes()));
    assert_eq!(page["truncated"], true);
    let empty = call(&read, "read", "large", json!({"offset": 30000})).unwrap();
    assert_eq!(empty["content"], "");
    assert_eq!(empty["truncated"], false);
    let path = root.join("edit");
    let name = path.to_str().unwrap();
    let original = "\u{feff}one\r\ntwo\r\none\r\ntwo\r\n";
    fs::write(&path, original).unwrap();
    let args = json!({"oldString":"one\ntwo", "newString":"yes\nno", "expectedHash":hash(original.as_bytes())});
    assert_eq!(
        call(&write, "edit", name, args.clone()),
        Err("multiple_matches")
    );
    assert_eq!(
        candidate_lines(&write, name, &args, &cancel, u64::MAX).unwrap(),
        vec![1, 3]
    );
    assert_eq!(
        call(
            &write,
            "edit",
            name,
            json!({"oldString":"missing", "newString":"x", "expectedHash":hash(original.as_bytes())})
        ),
        Err("no_match")
    );
    assert_eq!(
        call(
            &write,
            "edit",
            name,
            json!({"oldString":"one", "newString":"x", "expectedHash":hash(b"stale")})
        ),
        Err("conflict")
    );
    let result = call(&write, "edit", name, json!({"oldString":"one\ntwo", "newString":"yes\nno", "replaceAll":true, "expectedHash":hash(original.as_bytes())})).unwrap();
    assert_eq!(result["replacements"], 2);
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "\u{feff}yes\r\nno\r\nyes\r\nno\r\n"
    );
    let current = fs::read(&path).unwrap();
    let result = call(&write, "edit", name, json!({"oldString":"yes", "newString":"", "expectedHash":hash(&current), "replaceAll":true})).unwrap();
    assert_eq!(result["replacements"], 2);
    let many = root.join("many");
    fs::write(&many, vec![b'a'; 1024 * 1024]).unwrap();
    let many_result = call(&write, "edit", many.to_str().unwrap(), json!({"oldString":"a", "newString":"", "replaceAll":true, "expectedHash":hash(&vec![b'a'; 1024 * 1024])})).unwrap();
    assert_eq!(many_result["replacements"], 1024 * 1024);
    assert_eq!(fs::metadata(many).unwrap().len(), 0);
    let single = root.join("single");
    fs::write(&single, "before").unwrap();
    let single_result = call(
        &write,
        "edit",
        single.to_str().unwrap(),
        json!({"oldString":"before", "newString":"after", "expectedHash":hash(b"before")}),
    )
    .unwrap();
    assert_eq!(single_result["replacements"], 1);
    assert_eq!(fs::read_to_string(single).unwrap(), "after");
    let current = fs::read(&path).unwrap();
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&path, perms).unwrap();
    assert_eq!(
        call(
            &write,
            "edit",
            name,
            json!({"content":"x", "expectedHash":hash(&current)})
        ),
        Err("permission_denied")
    );
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&path, root.join("link")).unwrap();
        assert_eq!(
            call(
                &write,
                "edit",
                root.join("link").to_str().unwrap(),
                json!({"content":"x", "expectedHash":hash(&current)})
            ),
            Err("unsupported_file")
        );
    }
    assert_eq!(
        execute(
            &read,
            &context,
            "read",
            "large",
            &json!({}),
            &root.join("recovery"),
            &cancel,
            0
        ),
        Err("cancelled")
    );
    cancel.store(true, Ordering::SeqCst);
    assert_eq!(call(&read, "read", "large", json!({})), Err("cancelled"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn discovery_receipts_keep_requested_paths_skip_binary_and_respect_limits() {
    let root = std::env::temp_dir()
        .canonicalize()
        .unwrap()
        .join(format!("yonder-receipts-{}", nonce()));
    fs::create_dir_all(root.join("docs")).unwrap();
    fs::create_dir(root.join(".yonder-trash")).unwrap();
    fs::write(root.join("docs/visible.txt"), "visible").unwrap();
    let context = Context {
        owner_id: "owner".into(),
        device_id: "device".into(),
        session_id: "session".into(),
    };
    let grant = Grant {
        owner_id: context.owner_id.clone(),
        device_id: context.device_id.clone(),
        connection_id: "read".into(),
        root: root.clone(),
        scope: "folder".into(),
        connector_id: "local-files".into(),
        capabilities: Capabilities::default(),
        revision: 1,
    };
    let cancel = AtomicBool::new(false);
    let call = |op: &str, path: &str, args: Value| {
        execute(
            &grant,
            &context,
            op,
            path,
            &args,
            &root.join("recovery"),
            &cancel,
            u64::MAX,
        )
    };
    let list = call("list", ".", json!({})).unwrap();
    assert_eq!(list["path"], ".");
    assert!(!list["entries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| entry["name"] == ".yonder-trash"));
    assert_eq!(call("list", "docs", json!({})).unwrap()["path"], "docs");
    let mut binary = b"needle\n".to_vec();
    binary.extend(vec![b'x'; 70_000]);
    binary.extend_from_slice(b"\0needle\n");
    fs::write(root.join("binary.txt"), binary).unwrap();
    let grep = call(
        "grep",
        "binary.txt",
        json!({"query":"needle", "literal":true, "limit":1}),
    )
    .unwrap();
    assert!(grep["matches"].as_array().unwrap().is_empty());
    let mut deep = root.clone();
    for _ in 0..4 {
        deep.push("\u{1}".repeat(180));
        fs::create_dir(&deep).unwrap();
    }
    for n in 0..190 {
        fs::write(deep.join(format!("item-{n:03}.txt")), "x").unwrap();
    }
    let result = call("search", ".", json!({"query":"item"})).unwrap();
    assert_eq!(result["truncated"], true);
    assert_eq!(result["stopReason"], "budget");
    assert!(serde_json::to_vec(&result).unwrap().len() < 512 * 1024);
    for entry in result["entries"].as_array().unwrap() {
        assert!(entry["path"].as_str().unwrap().encode_utf16().count() <= 1024);
    }
    assert!(path_in_budget(&"x".repeat(1024), 1024));
    assert!(!path_in_budget(&"x".repeat(1025), 1024));
    assert!(path_in_budget(&"😀".repeat(2048), 4096));
    assert!(!path_in_budget(&"😀".repeat(2049), 4096));
    fs::remove_dir_all(root).unwrap();
}

use super::*;

#[test]
fn durable_upload_intent_retains_original_conversation_and_pauses_on_account_change() {
    let root = std::env::temp_dir().join(format!(
        "yonder-upload-check-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store
        .create("owner", "Synthetic upload check", 16_000, 1)
        .unwrap();
    store.append(&mut recording, &[1; 1600]).unwrap();
    store
        .finish(&mut recording, Some("interrupted".into()))
        .unwrap();
    let recorder = DesktopRecorder::new(root.clone()).unwrap();
    recorder.set_owner(Some("owner".into())).unwrap();
    let queue = UploadQueue {
        root: root.clone(),
        recorder: recorder.clone(),
        state: Arc::new(Mutex::new(State {
            session: None,
            generation: 0,
        })),
        io: Arc::new(Mutex::new(())),
        on_change: Arc::new(|| {}),
    };
    assert!(queue.jobs("owner".into()).unwrap().is_empty());
    assert!(queue.enqueue("owner".into(), recording.id.clone(), "conversation_original".into()).is_err());
    store.conclude("owner", &recording.id).unwrap();
    queue
        .enqueue(
            "owner".into(),
            recording.id.clone(),
            "conversation_original".into(),
        )
        .unwrap();
    assert!(queue
        .enqueue(
            "owner".into(),
            recording.id.clone(),
            "conversation_other".into()
        )
        .is_err());
    queue
        .configure(
            "owner".into(),
            "http://127.0.0.1:9".into(),
            "synthetic-local-token".into(),
        )
        .unwrap();
    let previous = queue.state.lock().unwrap().session.clone().unwrap();
    assert!(queue.has_pending());
    queue.retain_owner(Some("other"));
    assert!(!queue.current(&previous));
    assert!(!queue.has_pending());
    let restored = queue.load("owner", &recording.id).unwrap().unwrap();
    assert_eq!(restored.conversation_id, "conversation_original");
    assert_eq!(restored.state, "queued");
    let mut paused = restored.clone();
    paused.state = "authentication_required".into();
    paused.retry_at = 1;
    queue.save("owner", &paused).unwrap();
    let restarted = UploadQueue {
        root: root.clone(),
        recorder: recorder.clone(),
        state: Arc::new(Mutex::new(State {
            session: None,
            generation: 0,
        })),
        io: Arc::new(Mutex::new(())),
        on_change: Arc::new(|| {}),
    };
    restarted
        .configure(
            "owner".into(),
            "http://127.0.0.1:9".into(),
            "fresh-synthetic-token".into(),
        )
        .unwrap();
    assert_eq!(restarted.state.lock().unwrap().generation, 1);
    assert_eq!(
        restarted
            .load("owner", &recording.id)
            .unwrap()
            .unwrap()
            .state,
        "queued"
    );
    let bytes = fs::read(queue.path("owner", &recording.id).unwrap()).unwrap();
    assert!(!String::from_utf8(bytes)
        .unwrap()
        .contains("synthetic-local-token"));
    assert_eq!(
        store.list("owner", None).unwrap()[0]
            .conversation_id
            .as_deref(),
        Some("conversation_original")
    );
    recorder.set_owner(None).unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn retry_after_process_restart_skips_server_confirmed_segments() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    let root = std::env::temp_dir().join(format!(
        "yonder-upload-http-check-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store
        .create_bound(
            "owner",
            "Synthetic upload fixture",
            16_000,
            1,
            Some("conversation_original".into()),
            true,
            None,
        )
        .unwrap();
    for _ in 0..2 {
        store.append(&mut recording, &[1; 1600]).unwrap();
    }
    store.finish(&mut recording, None).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let mut paths = Vec::new();
        for round in 0..6 {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 8192];
            let header_end = loop {
                let size = socket.read(&mut buffer).unwrap();
                assert!(size > 0);
                bytes.extend_from_slice(&buffer[..size]);
                if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                    break end + 4;
                }
            };
            let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
            paths.push(headers.lines().next().unwrap().to_string());
            let length = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|s| s.parse::<usize>().ok())
                })
                .unwrap_or(0);
            while bytes.len() < header_end + length {
                let size = socket.read(&mut buffer).unwrap();
                assert!(size > 0);
                bytes.extend_from_slice(&buffer[..size]);
            }
            if headers.starts_with("POST /v1/meetings ") {
                let body: serde_json::Value =
                    serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap();
                assert_eq!(body["separateSpeakers"], true);
            }
            let payload = serde_json::json!({"id":"mtg_check", "segments":[{"index":0,"uploaded":round >= 3},{"index":1,"uploaded":false}]}).to_string();
            let status = if round == 2 {
                "503 Service Unavailable"
            } else {
                "200 OK"
            };
            write!(socket, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}", payload.len()).unwrap();
        }
        paths
    });
    let recorder = DesktopRecorder::new(root.clone()).unwrap();
    recorder.set_owner(Some("owner".into())).unwrap();
    let make_queue = || UploadQueue {
        root: root.clone(),
        recorder: recorder.clone(),
        state: Arc::new(Mutex::new(State {
            session: None,
            generation: 0,
        })),
        io: Arc::new(Mutex::new(())),
        on_change: Arc::new(|| {}),
    };
    let queue = make_queue();
    queue
        .configure("owner".into(), base.clone(), "synthetic-test-token".into())
        .unwrap();
    let session = queue.state.lock().unwrap().session.clone().unwrap();
    assert!(queue.has_pending());
    let _ = rustls::crypto::ring::default_provider().install_default();
    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    queue.tick(&http, &session).unwrap();
    let failed = queue.load("owner", &recording.id).unwrap().unwrap();
    assert_eq!(failed.state, "queued");
    assert_eq!(failed.meeting_id.as_deref(), Some("mtg_check"));
    queue.clear();
    let restarted = make_queue();
    restarted
        .enqueue(
            "owner".into(),
            recording.id.clone(),
            "conversation_original".into(),
        )
        .unwrap();
    restarted
        .configure("owner".into(), base, "synthetic-refreshed-token".into())
        .unwrap();
    let session = restarted.state.lock().unwrap().session.clone().unwrap();
    restarted.tick(&http, &session).unwrap();
    assert_eq!(
        restarted
            .load("owner", &recording.id)
            .unwrap()
            .unwrap()
            .state,
        "submitted"
    );
    assert!(!restarted.has_pending());
    let paths = server.join().unwrap();
    assert_eq!(
        paths.iter().filter(|p| p.contains("/segments/0 ")).count(),
        1
    );
    assert_eq!(
        paths.iter().filter(|p| p.contains("/segments/1 ")).count(),
        2
    );
    assert!(paths.last().unwrap().contains("/process "));
    recorder.set_owner(None).unwrap();
    fs::remove_dir_all(root).unwrap();
}

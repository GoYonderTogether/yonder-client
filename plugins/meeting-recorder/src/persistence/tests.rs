use super::*;

fn directory() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "yonder-recorder-test-{}-{}",
        std::process::id(),
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&path);
    path
}

#[test]
fn recover_committed_audio_even_if_manifest_was_not_updated() {
    let root = directory();
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store.create("owner_a", "Meeting", 8000, 1).unwrap();
    store.append(&mut recording, &vec![1200; 32_000]).unwrap();
    // Second WAV was durably renamed, but the process died before saving its manifest entry.
    let path = store.recording_path("owner_a", &recording.id).unwrap();
    wav::atomic_write(
        &path.join("00000001.wav"),
        &wav::encode(&vec![-1200; 16_000], 8000, 1),
    )
    .unwrap();
    let items = store.list("owner_a", None).unwrap();
    assert_eq!(items[0].state, "interrupted");
    assert_eq!(items[0].saved_duration_ms, 6000);
    assert_eq!(items[0].segments.len(), 2);
    assert_eq!(
        store.read_audio("owner_a", &recording.id, 1).unwrap().len(),
        32_044
    );
    assert!(store.read_audio("owner_b", &recording.id, 0).is_err());
    assert!(store.list("../owner_a", None).is_err());
    let mut old = items[0].clone();
    assert!(store.append(&mut old, &[1, 2, 3]).is_err());
    assert_ne!(
        store.create("owner_a", "New", 8000, 1).unwrap().id,
        recording.id
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn incomplete_tail_never_invalidates_committed_segments() {
    let root = directory();
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store.create("owner_a", "Meeting", 8000, 1).unwrap();
    store.append(&mut recording, &vec![7; 32_000]).unwrap();
    let path = store.recording_path("owner_a", &recording.id).unwrap();
    fs::write(path.join("00000001.pending"), b"RIFF partial").unwrap();
    let items = store.list("owner_a", None).unwrap();
    assert_eq!(items[0].segments.len(), 1);
    assert_eq!(items[0].saved_duration_ms, 4000);
    assert_eq!(
        store.read_audio("owner_a", &recording.id, 0).unwrap().len(),
        64_044
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn persistent_manifest_write_failure_still_returns_stopped_state_and_audio() {
    let root = directory();
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store.create("owner_a", "Meeting", 8000, 1).unwrap();
    let path = store.recording_path("owner_a", &recording.id).unwrap();
    fs::create_dir(path.join("recording.pending")).unwrap();
    assert!(store.append(&mut recording, &vec![11; 32_000]).is_err());
    let items = store.list("owner_a", None).unwrap();
    assert_eq!(items[0].state, "interrupted");
    assert_eq!(items[0].saved_duration_ms, 4000);
    assert!(items[0]
        .error
        .as_ref()
        .unwrap()
        .contains("meeting_storage_unavailable"));
    assert_eq!(
        store.read_audio("owner_a", &recording.id, 0).unwrap().len(),
        64_044
    );
    // The write failure is deliberately still present on the second status read.
    assert_eq!(store.list("owner_a", None).unwrap()[0].state, "interrupted");
    fs::remove_dir_all(root).unwrap();
}

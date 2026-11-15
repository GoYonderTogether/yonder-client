use super::*;
#[test]
fn manifest_failure_does_not_duplicate_audio_when_finishing() {
    let root = std::env::temp_dir().join(format!("yonder-recorder-flush-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let store = Store::new(root.clone()).unwrap();
    let mut recording = store.create("owner", "Fixture", 8000, 1).unwrap();
    let blocked = root
        .join("owner")
        .join(&recording.id)
        .join("recording.pending");
    std::fs::create_dir(&blocked).unwrap();
    let mut pending = vec![111; 32_000];
    pending.extend(vec![222; 8000]);
    assert!(flush_pending(&store, &mut recording, &mut pending, false).is_err());
    assert_eq!(pending.len(), 8000);
    std::fs::remove_dir(blocked).unwrap();
    flush_pending(&store, &mut recording, &mut pending, true).unwrap();
    store
        .finish(&mut recording, Some("injected_manifest_failure".into()))
        .unwrap();
    assert_eq!(recording.saved_duration_ms, 5000);
    assert_eq!(recording.segments.len(), 2);
    assert_eq!(
        store.read_audio("owner", &recording.id, 0).unwrap().len(),
        64_044
    );
    assert_eq!(
        store.read_audio("owner", &recording.id, 1).unwrap().len(),
        16_044
    );
    assert_eq!(recording.state, "interrupted");
    std::fs::remove_dir_all(root).unwrap();
}

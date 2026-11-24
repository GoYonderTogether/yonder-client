use super::*;

#[test]
fn an_older_permission_check_cannot_restore_revoked_readiness() {
    let state = AppleResources::default();
    let context = Context {
        owner_id: "mem_a".into(),
        device_id: "dev_a".into(),
        session_id: "ses_a".into(),
    };
    let revision = Revision {
        id: "con_a".into(),
        revision: 1,
    };
    {
        let mut store = state.store.lock().unwrap();
        store.context = Some(context.clone());
        store.grants.push(Grant {
            owner_id: context.owner_id.clone(),
            device_id: context.device_id.clone(),
            connection_id: revision.id.clone(),
            connector_id: Source::AppleCalendar.id().into(),
            scope: "device".into(),
            root: PathBuf::new(),
            capabilities: Default::default(),
            revision: revision.revision,
        });
    }
    let earlier = state.invalidate_ready();
    let latest = state.invalidate_ready();
    assert!(state
        .complete_ready(&context, latest, &[], &[])
        .unwrap()
        .is_empty());
    assert_eq!(
        state.complete_ready(
            &context,
            earlier,
            &[Source::AppleCalendar.id()],
            &[revision]
        ),
        Err("cancelled".into()),
    );
    assert!(state.store.lock().unwrap().allowed.is_empty());
}

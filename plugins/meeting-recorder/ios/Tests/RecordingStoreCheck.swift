import Foundation

@main
struct RecordingStoreCheck {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("meeting-store-check-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try RecordingStore(root: root)
    var record = try store.create(owner: "owner-one", title: "Storage regression", rate: 16000,
      conversationId: "bot-chat", separateSpeakers: true, transportMode: "live")
    let pcm = Data(repeating: 7, count: 16000 * 2 * 4)
    try store.append(pcm, to: &record)
    let initializing = try store.directory("owner-one", UUID().uuidString.lowercased())
    try FileManager.default.createDirectory(at: initializing, withIntermediateDirectories: false)
    let initialManifest = initializing.appendingPathComponent("recording.json.pending")
    try Data("unfinished initial manifest".utf8).write(to: initialManifest)
    let initialized = try store.list(owner: "owner-one", recover: false)
    assert(initialized.count == 1 && initialized[0].id == record.id && initialized[0].conversationId == "bot-chat")
    let initializedAudio = try store.read(owner: "owner-one", id: record.id, index: 0)
    assert(initializedAudio == RecordingStore.wave(pcm: pcm, rate: 16000))
    assert(FileManager.default.fileExists(atPath: initialManifest.path), "unfinished initialization files must be preserved")
    let folder = try store.directory(record.ownerId, record.id)
    let blocker = folder.appendingPathComponent("recording.json.pending")
    try FileManager.default.createDirectory(at: blocker, withIntermediateDirectories: false)
    do { try store.append(pcm, to: &record); assertionFailure("manifest failure was not reported") }
    catch { }
    assert(record.segments.count == 2, "durable WAV must not be re-appended after index failure")
    let stopped = try store.list(owner: "owner-one", recover: true)
    assert(stopped[0].state == "interrupted" && stopped[0].error == "audio_storage_failed")
    assert(stopped[0].savedDurationMs == 8000)
    let orphan = try store.read(owner: "owner-one", id: record.id, index: 1)
    assert(orphan == RecordingStore.wave(pcm: pcm, rate: 16000), "committed orphan must remain playable while manifest is unwritable")
    try FileManager.default.removeItem(at: blocker)
    // A truncated tail must not hide earlier complete WAVs or the recovered record.
    let malformed = RecordingStore.wave(pcm: pcm, rate: 16000).dropLast(2)
    try Data(malformed).write(to: folder.appendingPathComponent("000002.wav"))
    let recovered = try RecordingStore(root: root).list(owner: "owner-one", recover: true)
    assert(recovered.count == 1 && recovered[0].state == "interrupted")
    assert(recovered[0].conversationId == "bot-chat")
    assert(recovered[0].separateSpeakers == true)
    assert(recovered[0].transportMode == "live")
    assert(recovered[0].segments.count == 2 && recovered[0].savedDurationMs == 8000)
    assert(recovered[0].error == "audio_segment_damaged")
    let audio = try store.read(owner: "owner-one", id: record.id, index: 0)
    assert(audio == RecordingStore.wave(pcm: pcm, rate: 16000))
    let otherOwner = try store.list(owner: "owner-two", recover: true)
    assert(otherOwner.isEmpty)
    do { _ = try store.directory("../escape"); assertionFailure("owner traversal accepted") } catch { }
    let next = try store.create(owner: "owner-one", title: "New recording", rate: 16000)
    assert(next.id != record.id && next.segments.isEmpty)
    let metadata = try JSONSerialization.jsonObject(with: JSONEncoder().encode(next)) as! [String: Any]
    assert(metadata["endedAt"] is NSNull && metadata["error"] is NSNull)
    let unbound = try RecordingStore(root: root).list(owner: "owner-one", recover: false).first { $0.id == next.id }
    assert(unbound != nil && unbound?.conversationId == nil && metadata["conversationId"] == nil)
    assert(unbound?.separateSpeakers == nil && metadata["separateSpeakers"] == nil)
    // Resume window: a clean interruption continues for ten minutes, damaged storage never does.
    var cut = try store.create(owner: "owner-one", title: "Cut", rate: 16000)
    try store.append(Data(count: 16000 * 2 * 4), to: &cut)
    cut.state = "interrupted"; cut.endedAt = RecordingStore.now - 60_000; cut.error = "audio_interrupted"
    try store.save(cut)
    let open = try store.resumable(owner: "owner-one", id: cut.id)
    assert(open.id == cut.id)
    cut.endedAt = RecordingStore.now - RecordingStore.resumeWindowMs - 1
    try store.save(cut)
    do { _ = try store.resumable(owner: "owner-one", id: cut.id); assertionFailure("expired window accepted") } catch RecorderFailure.resumeExpired { }
    cut.endedAt = RecordingStore.now; cut.error = "audio_storage_failed"
    try store.save(cut)
    do { _ = try store.resumable(owner: "owner-one", id: cut.id); assertionFailure("storage failure accepted") } catch RecorderFailure.notResumable { }
    cut.error = "audio_interrupted"
    try store.save(cut)
    try store.conclude(owner: "owner-one", id: cut.id)
    let concluded = try store.list(owner: "owner-one", recover: false).first { $0.id == cut.id }
    assert(concluded?.state == "ended" && concluded?.error == nil)
    print("PASS: durable WAV, unfinished initialization isolation, manifest failure, truncated tail recovery, owner isolation, new ID, null schema and optional conversation binding")
  }
}

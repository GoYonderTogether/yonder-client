import Foundation

@main
struct RecordingStoreCheck {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("meeting-store-check-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try RecordingStore(root: root)
    var record = try store.create(owner: "owner-one", title: "Storage regression", rate: 16000, separateSpeakers: true)
    let pcm = Data(repeating: 7, count: 16000 * 2 * 4)
    try store.append(pcm, to: &record)
    let initializing = try store.directory("owner-one", UUID().uuidString.lowercased())
    try FileManager.default.createDirectory(at: initializing, withIntermediateDirectories: false)
    let initialManifest = initializing.appendingPathComponent("recording.json.pending")
    try Data("unfinished initial manifest".utf8).write(to: initialManifest)
    let initialized = try store.list(owner: "owner-one", recover: false)
    assert(initialized.count == 1 && initialized[0].id == record.id)
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
    assert(recovered[0].separateSpeakers == true)
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
    assert(next.separateSpeakers == nil && metadata["separateSpeakers"] == nil)
    print("PASS: durable WAV, unfinished initialization isolation, manifest failure, truncated tail recovery, owner isolation, new ID and null schema")
  }
}

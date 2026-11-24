import Foundation
import Darwin

struct RecordingSegment: Codable {
  var index: Int
  var durationMs: Int
  var byteLength: Int
}

struct MeetingRecording: Codable {
  var id: String
  var ownerId: String
  var title: String
  var conversationId: String?
  var separateSpeakers: Bool?
  var transportMode: String?
  var state: String
  var startedAt: Int64
  var endedAt: Int64?
  var durationMs: Int
  var savedDurationMs: Int
  var sampleRate: Int
  var channels: Int
  var segments: [RecordingSegment]
  var error: String?

  enum CodingKeys: String, CodingKey {
    case id, ownerId, title, conversationId, separateSpeakers, transportMode, state, startedAt, endedAt, durationMs, savedDurationMs, sampleRate, channels, segments, error
  }
  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(id, forKey: .id); try values.encode(ownerId, forKey: .ownerId)
    try values.encode(title, forKey: .title); try values.encode(state, forKey: .state)
    try values.encodeIfPresent(conversationId, forKey: .conversationId)
    try values.encodeIfPresent(separateSpeakers, forKey: .separateSpeakers)
    try values.encodeIfPresent(transportMode, forKey: .transportMode)
    try values.encode(startedAt, forKey: .startedAt); try values.encode(endedAt, forKey: .endedAt)
    try values.encode(durationMs, forKey: .durationMs); try values.encode(savedDurationMs, forKey: .savedDurationMs)
    try values.encode(sampleRate, forKey: .sampleRate); try values.encode(channels, forKey: .channels)
    try values.encode(segments, forKey: .segments); try values.encode(error, forKey: .error)
  }
}

enum RecorderFailure: String, Error { case invalidOwner, wrongOwner, missingRecording, invalidAudio, storageFailed, notResumable, resumeExpired }

final class RecordingStore {
  let root: URL
  init(root: URL) throws {
    self.root = root
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: root.path)
    #endif
    try Self.syncDirectory(root.deletingLastPathComponent())
  }

  static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

  func directory(_ owner: String, _ id: String? = nil) throws -> URL {
    guard owner.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { throw RecorderFailure.invalidOwner }
    let base = root.appendingPathComponent(owner, isDirectory: true)
    guard let id = id else { return base }
    guard UUID(uuidString: id) != nil else { throw RecorderFailure.missingRecording }
    return base.appendingPathComponent(id, isDirectory: true)
  }

  func create(owner: String, title: String, rate: Int, conversationId: String? = nil, separateSpeakers: Bool = false, transportMode: String? = nil) throws -> MeetingRecording {
    let record = MeetingRecording(id: UUID().uuidString.lowercased(), ownerId: owner,
      title: String(title.prefix(200)), conversationId: conversationId, separateSpeakers: separateSpeakers ? true : nil, transportMode: transportMode,
      state: "recording", startedAt: Self.now, endedAt: nil,
      durationMs: 0, savedDurationMs: 0, sampleRate: rate, channels: 1, segments: [], error: nil)
    var privateAttributes: [FileAttributeKey: Any] = [.posixPermissions: 0o700]
    #if os(iOS)
    privateAttributes[.protectionKey] = FileProtectionType.completeUntilFirstUserAuthentication
    #endif
    try FileManager.default.createDirectory(at: directory(owner), withIntermediateDirectories: true, attributes: privateAttributes)
    try FileManager.default.createDirectory(at: directory(owner, record.id), withIntermediateDirectories: false, attributes: privateAttributes)
    try Self.syncDirectory(root)
    try Self.syncDirectory(directory(owner))
    try save(record)
    return record
  }

  func save(_ record: MeetingRecording) throws {
    try durableWrite(JSONEncoder().encode(record), to: directory(record.ownerId, record.id).appendingPathComponent("recording.json"))
  }

  func append(_ pcm: Data, to record: inout MeetingRecording) throws {
    guard !pcm.isEmpty, pcm.count % 2 == 0 else { throw RecorderFailure.invalidAudio }
    let index = record.segments.count
    let audio = Self.wave(pcm: pcm, rate: record.sampleRate)
    let url = try directory(record.ownerId, record.id).appendingPathComponent(String(format: "%06d.wav", index))
    try durableWrite(audio, to: url)
    let duration = pcm.count * 1000 / (record.sampleRate * 2)
    record.segments.append(RecordingSegment(index: index, durationMs: duration, byteLength: audio.count))
    record.savedDurationMs += duration
    record.durationMs = record.savedDurationMs
    try save(record)
  }

  static let resumeWindowMs: Int64 = 10 * 60 * 1000

  /// The interrupted recording that can still be continued; throws when it cannot.
  func resumable(owner: String, id: String) throws -> MeetingRecording {
    guard let record = try list(owner: owner, recover: true).first(where: { $0.id == id }) else { throw RecorderFailure.missingRecording }
    let error = record.error ?? ""
    let unrecoverable = ["storage", "damaged", "corrupt", "owner_changed", "capture_start_failed"].contains { error.contains($0) }
    guard record.state == "interrupted", !record.segments.isEmpty, !unrecoverable, let ended = record.endedAt else { throw RecorderFailure.notResumable }
    guard Self.now < ended + Self.resumeWindowMs else { throw RecorderFailure.resumeExpired }
    return record
  }

  /// Ending an interrupted recording is the user saying it is over; it can then be processed.
  func conclude(owner: String, id: String) throws {
    guard var record = try list(owner: owner, recover: true).first(where: { $0.id == id }) else { throw RecorderFailure.missingRecording }
    guard record.state == "interrupted", !record.segments.isEmpty else { return }
    record.state = "ended"
    record.error = nil
    try save(record)
  }

  func read(owner: String, id: String, index: Int) throws -> Data {
    let folder = try directory(owner, id)
    let record = try JSONDecoder().decode(MeetingRecording.self, from: Data(contentsOf: folder.appendingPathComponent("recording.json")))
    guard record.ownerId == owner, (0...999999).contains(index) else { throw RecorderFailure.missingRecording }
    let audio = try Data(contentsOf: folder.appendingPathComponent(String(format: "%06d.wav", index)))
    guard Self.validWave(audio, rate: record.sampleRate) else { throw RecorderFailure.invalidAudio }
    return audio
  }

  func list(owner: String, recover: Bool, activeId: String? = nil) throws -> [MeetingRecording] {
    let base = try directory(owner)
    guard FileManager.default.fileExists(atPath: base.path) else { return [] }
    return try FileManager.default.contentsOfDirectory(at: base, includingPropertiesForKeys: nil).compactMap { folder in
      guard UUID(uuidString: folder.lastPathComponent) != nil else { return nil }
      let manifest = folder.appendingPathComponent("recording.json")
      guard FileManager.default.fileExists(atPath: manifest.path) else { return nil }
      var record = try JSONDecoder().decode(MeetingRecording.self, from: Data(contentsOf: manifest))
      guard record.ownerId == owner, record.id == folder.lastPathComponent else { throw RecorderFailure.wrongOwner }
      if recover && record.state == "recording" && record.id != activeId {
        let recovered = try recoveredSegments(folder: folder, rate: record.sampleRate)
        record.segments = recovered.segments
        record.savedDurationMs = record.segments.reduce(0) { $0 + $1.durationMs }
        record.durationMs = record.savedDurationMs
        record.state = "interrupted"
        // The window counts from the last durable write, not from when the app was reopened.
        let written = (try? FileManager.default.attributesOfItem(atPath: manifest.path)[.modificationDate] as? Date) ?? nil
        record.endedAt = written.map { Int64($0.timeIntervalSince1970 * 1000) } ?? Self.now
        record.error = recovered.damaged ? "audio_segment_damaged" : "recording_interrupted"
        do { try save(record) } catch { record.error = "audio_storage_failed" }
      }
      return record
    }.sorted { $0.startedAt > $1.startedAt }
  }

  private func recoveredSegments(folder: URL, rate: Int) throws -> (segments: [RecordingSegment], damaged: Bool) {
    let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
      .filter { $0.lastPathComponent.range(of: "^[0-9]{6}\\.wav$", options: .regularExpression) != nil }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
    var damaged = false
    let segments: [RecordingSegment] = files.compactMap { file in
      guard let audio = try? Data(contentsOf: file), Self.validWave(audio, rate: rate),
        let index = Int(file.deletingPathExtension().lastPathComponent) else {
        damaged = true
        return nil
      }
      return RecordingSegment(index: index, durationMs: (audio.count - 44) * 1000 / (rate * 2), byteLength: audio.count)
    }
    return (segments, damaged)
  }

  private static func validWave(_ audio: Data, rate: Int) -> Bool {
    guard audio.count >= 44, audio.count % 2 == 0 else { return false }
    func number(_ at: Int) -> UInt32 {
      (0..<4).reduce(UInt32(0)) { $0 | UInt32(audio[at + $1]) << ($1 * 8) }
    }
    return audio.prefix(4) == Data("RIFF".utf8) && audio[8..<12] == Data("WAVE".utf8)
      && audio[36..<40] == Data("data".utf8) && number(4) == audio.count - 8
      && number(24) == rate && number(40) == audio.count - 44
  }

  private func durableWrite(_ bytes: Data, to url: URL) throws {
    let temporary = url.appendingPathExtension("pending")
    #if os(iOS)
    // Apply protection when creating the file so the first write also works while locked.
    try bytes.write(to: temporary, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    #else
    try bytes.write(to: temporary)
    #endif
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temporary.path)
    let handle = try FileHandle(forWritingTo: temporary)
    try handle.synchronize()
    try handle.close()
    guard Darwin.rename(temporary.path, url.path) == 0 else { throw RecorderFailure.storageFailed }
    try Self.syncDirectory(url.deletingLastPathComponent())
  }

  private static func syncDirectory(_ directory: URL) throws {
    let descriptor = Darwin.open(directory.path, O_RDONLY)
    guard descriptor >= 0 else { throw RecorderFailure.storageFailed }
    defer { Darwin.close(descriptor) }
    guard Darwin.fsync(descriptor) == 0 else { throw RecorderFailure.storageFailed }
  }

  static func wave(pcm: Data, rate: Int) -> Data {
    var output = Data()
    func text(_ value: String) { output.append(contentsOf: value.utf8) }
    func number<T: FixedWidthInteger>(_ value: T) {
      var little = value.littleEndian
      withUnsafeBytes(of: &little) { output.append(contentsOf: $0) }
    }
    text("RIFF"); number(UInt32(pcm.count + 36)); text("WAVEfmt "); number(UInt32(16))
    number(UInt16(1)); number(UInt16(1)); number(UInt32(rate)); number(UInt32(rate * 2))
    number(UInt16(2)); number(UInt16(16)); text("data"); number(UInt32(pcm.count)); output.append(pcm)
    return output
  }
}

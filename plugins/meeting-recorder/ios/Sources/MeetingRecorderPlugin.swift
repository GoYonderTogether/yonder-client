import AVFoundation
import Foundation
import Tauri
import UIKit

private struct OwnerArgs: Decodable { let ownerId: String? }
private struct StartArgs: Decodable {
  let ownerId: String
  let title: String
  let conversationId: String?
  let separateSpeakers: Bool?
  let transportMode: String?
}
private struct StopArgs: Decodable { let ownerId: String; let recordingId: String }
private struct ReadArgs: Decodable { let ownerId: String; let recordingId: String; let segmentIndex: Int }

final class MeetingRecorderPlugin: Plugin {
  private let queue = DispatchQueue(label: "net.yonder.meeting-recorder")
  private var owner: String?
  private var store: RecordingStore?
  private var engine: AVAudioEngine?
  private var active: MeetingRecording?
  private var pending = Data()
  private var audioLevel: Float = 0
  private var paused = false
  private var observers: [NSObjectProtocol] = []

  override init() {
    super.init()
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
      guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
      self?.interrupt("audio_interrupted")
    })
    observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: nil) { [weak self] note in
      self?.queue.async {
        guard let self = self, let engine = self.engine, self.active != nil,
          (note.object as? AVAudioEngine) === engine else { return }
        // Initial route configuration may notify while start() is in progress. Inspect after start returns.
        if !engine.isRunning && !self.paused { try? self.finish(state: "interrupted", reason: "audio_configuration_changed") }
      }
    })
    observers.append(center.addObserver(forName: UIApplication.willTerminateNotification, object: nil, queue: nil) { [weak self] _ in
      self?.queue.sync { try? self?.finish(state: "interrupted", reason: "application_terminated") }
    })
  }

  private func storage() throws -> RecordingStore {
    if let store = store { return store }
    let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let result = try RecordingStore(root: directory.appendingPathComponent("meeting-recorder", isDirectory: true))
    store = result
    return result
  }

  private func requireOwner(_ requested: String?) throws -> String {
    guard let requested = requested, owner == requested else { throw RecorderFailure.wrongOwner }
    return requested
  }

  private func state(_ requested: String?) throws -> JsonObject {
    guard let requested = requested else { return ["supported": true, "activeId": NSNull(), "audioLevel": 0, "recordings": []] }
    _ = try requireOwner(requested)
    var records = try storage().list(owner: requested, recover: true, activeId: active?.id)
    if var current = active {
      current.durationMs = current.savedDurationMs + pending.count * 1000 / (current.sampleRate * 2)
      records = records.map { $0.id == current.id ? current : $0 }
    }
    let data = try JSONEncoder().encode(records)
    return ["supported": true, "activeId": active?.id as Any? ?? NSNull(), "audioLevel": active == nil ? 0 : audioLevel, "paused": paused, "pauseSupported": true,
      "recordings": try JSONSerialization.jsonObject(with: data)]
  }

  private func respond(_ invoke: Invoke, work: @escaping () throws -> JsonObject) {
    queue.async {
      do { invoke.resolve(try work()) } catch { invoke.reject("meeting_recorder_\(error)") }
    }
  }

  @objc func setOwner(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OwnerArgs.self)
    respond(invoke) {
      if args.ownerId != self.owner {
        try self.finish(state: "ended", reason: nil)
        if let next = args.ownerId { _ = try self.storage().list(owner: next, recover: true) }
        self.owner = args.ownerId
      }
      return try self.state(args.ownerId)
    }
  }

  @objc func getState(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OwnerArgs.self)
    respond(invoke) { try self.state(args.ownerId) }
  }

  @objc func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      guard granted else { invoke.reject("microphone_denied"); return }
      self.respond(invoke) {
        _ = try self.requireOwner(args.ownerId)
        guard self.active == nil else { throw RecorderFailure.invalidAudio }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
        var started = false
        defer {
          if !started {
            if self.active != nil { try? self.finish(state: "interrupted", reason: "capture_start_failed") }
            else { try? session.setActive(false, options: .notifyOthersOnDeactivation) }
          }
        }
        let engine = AVAudioEngine()
        let node = engine.inputNode
        let format = node.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw RecorderFailure.invalidAudio }
        let record = try self.storage().create(
          owner: args.ownerId, title: args.title, rate: Int(format.sampleRate),
          conversationId: args.conversationId, separateSpeakers: args.separateSpeakers == true, transportMode: args.transportMode)
        self.active = record
        self.audioLevel = 0
        self.engine = engine
        node.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak recorder = self] buffer, _ in
          guard let samples = buffer.floatChannelData else { recorder?.interrupt("unsupported_audio_format"); return }
          let frames = Int(buffer.frameLength)
          var pcm = Data(capacity: frames * 2)
          var peak: Float = 0
          for frame in 0..<frames {
            var value: Float = 0
            for channel in 0..<Int(buffer.format.channelCount) { value += samples[channel][frame] }
            value = max(-1, min(1, value / Float(buffer.format.channelCount)))
            peak = max(peak, abs(value))
            var little = Int16(value * 32767).littleEndian
            withUnsafeBytes(of: &little) { pcm.append(contentsOf: $0) }
          }
          let level = peak
          recorder?.queue.async { recorder?.received(pcm, level: level, id: record.id) }
        }
        try engine.start()
        let result = try self.state(args.ownerId)
        started = true
        return result
      }
    }
  }

  private func received(_ bytes: Data, level: Float, id: String) {
    guard var record = active, record.id == id, !paused else { return }
    audioLevel = level
    pending.append(bytes)
    let size = record.sampleRate * 2 * 4
    do {
      while pending.count >= size {
        let chunk = Data(pending.prefix(size))
        // Consume once: the WAV may be durable even if the following manifest update fails.
        pending.removeFirst(size)
        try storage().append(chunk, to: &record)
        active = record
      }
    } catch {
      active = record
      try? finish(state: "interrupted", reason: "audio_storage_failed")
    }
  }

  private func finish(state: String, reason: String?) throws {
    guard var record = active else { return }
    defer { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    active = nil
    paused = false
    let remaining = pending
    pending.removeAll()
    do {
      if !remaining.isEmpty { try storage().append(remaining, to: &record) }
      record.state = state
      record.endedAt = RecordingStore.now
      record.error = reason
      try storage().save(record)
    } catch {
      record.state = "interrupted"
      record.endedAt = RecordingStore.now
      record.error = "audio_storage_failed"
      try? storage().save(record)
      throw error
    }
  }

  private func interrupt(_ reason: String) { queue.async { try? self.finish(state: "interrupted", reason: reason) } }

  @objc func pause(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StopArgs.self)
    respond(invoke) {
      _ = try self.requireOwner(args.ownerId)
      guard var record = self.active, record.id == args.recordingId, !self.paused, let engine = self.engine else { throw RecorderFailure.missingRecording }
      engine.pause()
      self.paused = true
      self.audioLevel = 0
      if !self.pending.isEmpty {
        let remaining = self.pending
        self.pending.removeAll()
        do { try self.storage().append(remaining, to: &record); self.active = record }
        catch { try? self.finish(state: "interrupted", reason: "audio_storage_failed"); throw error }
      }
      return try self.state(args.ownerId)
    }
  }

  /// Continues an interrupted recording into the same record. Nothing is written until the engine runs.
  private func resumeInterrupted(_ args: StopArgs) throws -> JsonObject {
    _ = try requireOwner(args.ownerId)
    guard active == nil else { throw RecorderFailure.invalidAudio }
    var record = try storage().resumable(owner: args.ownerId, id: args.recordingId)
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
    try session.setActive(true)
    var started = false
    defer { if !started { try? session.setActive(false, options: .notifyOthersOnDeactivation) } }
    let engine = AVAudioEngine()
    let node = engine.inputNode
    let format = node.outputFormat(forBus: 0)
    // A different input rate would make the appended audio play at the wrong speed.
    guard Int(format.sampleRate) == record.sampleRate, format.channelCount > 0 else { throw RecorderFailure.invalidAudio }
    record.state = "recording"
    record.endedAt = nil
    record.error = nil
    self.active = record
    self.audioLevel = 0
    self.engine = engine
    node.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak recorder = self] buffer, _ in
      guard let samples = buffer.floatChannelData else { recorder?.interrupt("unsupported_audio_format"); return }
      let frames = Int(buffer.frameLength)
      var pcm = Data(capacity: frames * 2)
      var peak: Float = 0
      for frame in 0..<frames {
        var value: Float = 0
        for channel in 0..<Int(buffer.format.channelCount) { value += samples[channel][frame] }
        value = max(-1, min(1, value / Float(buffer.format.channelCount)))
        peak = max(peak, abs(value))
        var little = Int16(value * 32767).littleEndian
        withUnsafeBytes(of: &little) { pcm.append(contentsOf: $0) }
      }
      let level = peak
      recorder?.queue.async { recorder?.received(pcm, level: level, id: record.id) }
    }
    do {
      try engine.start()
      try storage().save(record)
    } catch {
      node.removeTap(onBus: 0)
      engine.stop()
      self.engine = nil
      self.active = nil
      throw error
    }
    started = true
    return try state(args.ownerId)
  }

  @objc func resume(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StopArgs.self)
    respond(invoke) {
      if self.active == nil { return try self.resumeInterrupted(args) }
      _ = try self.requireOwner(args.ownerId)
      guard let record = self.active, record.id == args.recordingId, self.paused, let engine = self.engine else { throw RecorderFailure.missingRecording }
      try engine.start()
      self.paused = false
      return try self.state(args.ownerId)
    }
  }

  @objc func stop(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StopArgs.self)
    respond(invoke) {
      _ = try self.requireOwner(args.ownerId)
      if self.active == nil {
        try self.storage().conclude(owner: args.ownerId, id: args.recordingId)
        return try self.state(args.ownerId)
      }
      if let active = self.active, active.id != args.recordingId { throw RecorderFailure.missingRecording }
      try self.finish(state: "ended", reason: nil)
      return try self.state(args.ownerId)
    }
  }

  @objc func readAudio(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ReadArgs.self)
    respond(invoke) {
      _ = try self.requireOwner(args.ownerId)
      let bytes = try self.storage().read(owner: args.ownerId, id: args.recordingId, index: args.segmentIndex)
      return ["bytes": bytes.map { Int($0) }]
    }
  }
}

@_cdecl("init_plugin_meeting_recorder")
func initPlugin() -> Plugin { MeetingRecorderPlugin() }

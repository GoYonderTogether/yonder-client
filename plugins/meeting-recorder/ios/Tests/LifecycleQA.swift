import Foundation
import Tauri
import UIKit

/// Standalone, isolated simulator probe. It invokes the production plugin, never a fake microphone.
@main
final class LifecycleQA: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private let recorder = MeetingRecorderPlugin()
  private let owner = "m1-isolated-qa"
  private var activeId: String?
  private var enteredBackground = false
  private var lastState: [String: Any] = [:]
  private var backgroundObserver: NSObjectProtocol?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
      object: nil, queue: .main) { [weak self] _ in self?.backgroundCheckpoint(event: "notification") }
    return true
  }

  func sceneStarted(_ window: UIWindow) {
    self.window = window
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.run() }
  }

  func backgroundCheckpoint(event: String) {
    enteredBackground = true
    let stateAtEvent = UIApplication.shared.applicationState.rawValue
    let eventAt = Int64(Date().timeIntervalSince1970 * 1000)
    do {
      let data = try JSONSerialization.data(withJSONObject: ["ownerId": owner])
      let invoke = Invoke(command: "getState", callback: 1, error: 2, sendResponse: { result, payload in
        // Persist while audio is still active; do not wait for stop() to release its background execution time.
        guard result == 1, let payload = payload?.data(using: .utf8),
          let state = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any] else { return }
        let checkpoint: [String: Any] = ["event": event, "at": eventAt, "applicationState": stateAtEvent,
          "nativeState": state, "pid": ProcessInfo.processInfo.processIdentifier]
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = directory.appendingPathComponent("background-\(event)-checkpoint.json")
        do {
          try JSONSerialization.data(withJSONObject: checkpoint, options: [.sortedKeys]).write(to: url, options: .atomic)
          let handle = try FileHandle(forWritingTo: url)
          try handle.synchronize(); try handle.close()
        } catch { NSLog("Lifecycle QA checkpoint failed: %@", "\(error)") }
      }, sendChannelData: { _, _ in }, data: String(decoding: data, as: UTF8.self))
      try recorder.getState(invoke)
    } catch { NSLog("Lifecycle QA checkpoint invoke failed: %@", "\(error)") }
  }

  private func call(_ name: String, args: [String: Any], completion: @escaping ([String: Any]) -> Void) {
    do {
      let raw = try JSONSerialization.data(withJSONObject: args)
      let invoke = Invoke(command: name, callback: 1, error: 2, sendResponse: { result, payload in
        DispatchQueue.main.async {
          guard result == 1, let data = payload?.data(using: .utf8),
            let state = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            self.write(phase: "failed", extra: ["command": name, "error": payload ?? "empty"])
            return
          }
          self.lastState = state
          completion(state)
        }
      }, sendChannelData: { _, _ in }, data: String(decoding: raw, as: UTF8.self))
      switch name {
      case "setOwner": try recorder.setOwner(invoke)
      case "getState": try recorder.getState(invoke)
      case "start": try recorder.start(invoke)
      case "stop": try recorder.stop(invoke)
      default: preconditionFailure("unknown probe command")
      }
    } catch { write(phase: "failed", extra: ["error": "\(error)"]) }
  }

  private func run() {
    call("setOwner", args: ["ownerId": owner]) { state in
      if CommandLine.arguments.contains("--recover") {
        let records = state["recordings"] as? [[String: Any]] ?? []
        let targetIndex = CommandLine.arguments.firstIndex(of: "--recording-id")
        let target = targetIndex.flatMap { CommandLine.arguments.indices.contains($0 + 1) ? CommandLine.arguments[$0 + 1] : nil }
        let interrupted = records.filter { ($0["state"] as? String) == "interrupted" && ($0["id"] as? String) == target }
        let passed = state["activeId"] is NSNull && interrupted.contains { ($0["savedDurationMs"] as? Int ?? 0) >= 4000 }
        self.write(phase: passed ? "recovered" : "failed", extra: ["passed": passed])
      } else {
        self.call("start", args: ["ownerId": self.owner, "title": "Isolated native lifecycle QA"]) { state in
          guard let id = state["activeId"] as? String else { self.write(phase: "failed"); return }
          self.activeId = id
          self.write(phase: "recording")
          if CommandLine.arguments.contains("--background") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
              // QA-only OS transition, never shipped in Sources or simulated by posting notifications.
              let suspend = NSSelectorFromString("suspend")
              if UIApplication.shared.responds(to: suspend) { _ = UIApplication.shared.perform(suspend) }
              else { self.write(phase: "failed", extra: ["error": "background_action_unavailable"]) }
            }
          }
          let hold = CommandLine.arguments.contains("--hold")
          DispatchQueue.main.asyncAfter(deadline: .now() + (hold ? 30 : 12)) {
            self.call("getState", args: ["ownerId": self.owner]) { beforeStop in
              let records = beforeStop["recordings"] as? [[String: Any]] ?? []
              let active = records.first { ($0["id"] as? String) == id }
              let sampled = (active?["savedDurationMs"] as? Int ?? 0) >= 4000
              let appState = UIApplication.shared.applicationState.rawValue
              self.call("stop", args: ["ownerId": self.owner, "recordingId": id]) { _ in
                self.write(phase: sampled ? "stopped" : "failed", extra: ["sampledBeforeStop": sampled,
                  "backgroundObserved": self.enteredBackground, "applicationStateBeforeStop": appState])
              }
            }
          }
        }
      }
    }
  }

  private func write(phase: String, extra: [String: Any] = [:]) {
    var result: [String: Any] = ["phase": phase, "state": lastState, "pid": ProcessInfo.processInfo.processIdentifier,
      "at": Int64(Date().timeIntervalSince1970 * 1000), "activeId": activeId as Any? ?? NSNull(),
      "applicationState": UIApplication.shared.applicationState.rawValue]
    result.merge(extra) { _, next in next }
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    do { try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: directory.appendingPathComponent("lifecycle-result.json"), options: .atomic) }
    catch { NSLog("Lifecycle QA result save failed: %@", "\(error)") }
  }
}

@objc(MeetingRecorderQAScene)
final class MeetingRecorderQAScene: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = UIViewController()
    window.rootViewController?.view.backgroundColor = .systemBackground
    window.makeKeyAndVisible()
    self.window = window
    (UIApplication.shared.delegate as? LifecycleQA)?.sceneStarted(window)
  }
  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? LifecycleQA)?.backgroundCheckpoint(event: "scene")
  }
}

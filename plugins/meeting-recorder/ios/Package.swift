// swift-tools-version:5.5
import PackageDescription

let package = Package(
  name: "tauri-plugin-meeting-recorder",
  platforms: [.iOS(.v13)],
  products: [.library(name: "tauri-plugin-meeting-recorder", type: .static, targets: ["MeetingRecorder"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "MeetingRecorder", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)

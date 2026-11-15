# Native contacts checks

This harness includes the current desktop contact-window implementation and loads a real bundled
client in Tauri/Wry/WKWebView. It uses the separate identifier
dev.yonder.native-contacts-test and an in-memory keyring fixture. It never initializes the OS
keyring plugin. Use only a local test API, isolated database and newly registered test accounts.

Build the client into a separate output directory with VITE_API_BASE pointing at the local API.
Then build this harness with CARGO_BUILD_JOBS=2, an independent CARGO_TARGET_DIR,
TAURI_CONFIG selecting that frontendDist, and --features tauri/custom-protocol.
Cached dependencies suffice for cargo build --offline.

Create a private temporary directory whose name contains native-contacts. Write seed.json there
with a shell test account's refreshToken; keep its mode 0600. Import runNative from run.mjs and
pass binary, root, two registered peer handles, optional switchAccount/originalAccount test
password credentials, and reportPath. The caller owns test-account registration and cleanup.
Do not print or commit the seed or account passwords.

By default on macOS, all test windows stay hidden. The test process suppresses native order-front calls
before product code can show a window: macOS can relocate a window back onto a real display on
its first show, even after an offscreen frame was set. No user input or production app is used.

Only after explicit permission, NATIVE_TEST_ALLOW_DISPLAY=1 enables foreground QA. Its caller
must save the previous frontmost application and restore it in finally; the test is capped at
120 seconds. The report distinguishes this actual display/focus mode from hidden-runtime checks,
which do not establish visible display or system foreground focus.
The keyring fixture does not establish OS Keychain behavior. The stdin protocol also supports
eval, inspect, windows, close and quit for host-specific runners.

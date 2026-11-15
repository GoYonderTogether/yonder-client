# QA APK repack

Use repack.py only with a newly built local debug APK and its matching stripped ARM64 library.
This repairs QA packaging, without rebuilding or installing the application.

The script preserves each non-native ZIP entry's compression method and timestamps. Native
libraries stay STORED. It verifies that stripping changed neither ELF loadable program headers
nor allocated section contents, aligns native entries with zipalign -P 16, then re-signs with
the same debug certificate and verifies the final APK's signature and alignment.

AndroidManifest.xml and APK asset payloads must remain byte-identical. Tauri may embed its Web
assets inside the native ELF instead; the allocated-section digest covers that case. ELF
16KiB support is reported separately from ZIP alignment.

Set the signing-password environment variables only in the trusted calling process:
ANDROID_DEBUG_STORE_PASSWORD and ANDROID_DEBUG_KEY_PASSWORD. Passwords are never command-line
arguments or report contents. Supply --source, --stripped, --output and optionally --report.
Use a new output path; the original APK remains intact. --build-tools, --keystore and --alias
can select the installed local debug signing tools. No emulator, installation or build runs.

Run python3 scripts/android-repack-test/repack.py --self-test for the small ZIP regression check.
Execute a real repack only in the resource window agreed with the other native builds.

Reference: [Android zipalign](https://developer.android.com/tools/zipalign). Alignment precedes
apksigner; the signed output is checked again.

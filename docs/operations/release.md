# Releases

Releases are manual. Nothing publishes automatically. During the current development phase,
formal version numbers identify dev-test releases, not production acceptance. See
[verification and ownership in AGENTS.md](../../AGENTS.md#发版与测试2026-11-24-起).

## Flow

```
Release (workflow_dispatch, release.yml)
  └─ verify ref is in main, fast-forward to origin/main
  └─ optionally (`require_ci=true`) wait for the aggregate `CI` check; by default it does not wait:
     release first, CI runs alongside (AGENTS.md「发版与测试」)
  └─ bump every workspace version + apps/desktop, write CHANGELOG, commit, tag v<version>
  └─ build the web bundle (the release must be buildable before anything is pushed)
  └─ push tag + main atomically, create a draft Release, publish it
  └─ dispatch: ci.yml on the tag, then android-release / desktop-release / ios-release
```

The tag is pushed before the Release exists, and the Release is a draft until it is published, so a
failure never leaves a public Release whose commit is not on `main`.

## Workflows

| workflow                    | trigger                                                                       | what it does                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                    | push to main, pull_request, workflow_dispatch                                 | lint, typecheck, test, the three `tools/` checks, changelog check, web build, cloud endpoint smoke, macOS `.app` build; one aggregate `CI` job |
| `release.yml`               | workflow_dispatch only                                                        | tag, CHANGELOG, GitHub Release, dispatch the platform builds                                                                                   |
| `desktop-release.yml`       | dispatched by `release.yml` (also `release: published` for manual publishing) | macOS Developer ID-signed, notarized dmg (ad-hoc fallback) + unsigned Windows nsis → Release; signed updater artifacts and manifests → OSS     |
| `android-release.yml`       | dispatched by `release.yml`                                                   | signed APK → Release asset `yonder-android.apk` + OSS `android/`                                                                               |
| `ios-release.yml`           | dispatched by `release.yml`                                                   | archive, export IPA, upload to TestFlight                                                                                                      |
| `windows-install-check.yml` | workflow_dispatch (input: release tag)                                        | installs the nsis installer on `windows-2025`, launches it, requires 20 s uptime, screenshots, uninstalls                                      |
| `auto-release.yml`          | workflow_dispatch only                                                        | does nothing; kept so nobody re-adds automatic releases by accident                                                                            |

### Removed

| workflow             | why                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-windows.yml`     | it installed the old product with `scripts/install.ps1` and verified the installed CLI. That CLI does not exist any more, and the shell's Windows artifact is the Tauri nsis installer, which `desktop-release.yml` builds. |
| `windows-native.yml` | it built `packages/sdk/native/*` — the old product's Node native addon. Nothing in the shell has native Node code.                                                                                                          |

## Version scheme

`0.<minor>.<YYMMDDNN>` — for example `0.3.26111201` (minor 3, 2026-11-12, sequence 01). `minor` is
read from the root `package.json`; the date and sequence come from `scripts/release/version.mjs`.

`release.yml` keeps these in step:

- every workspace manifest (`package.json`, `apps/web`, `packages/protocol`) —
  `scripts/release/bump-versions.mjs`
- `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`,
  `apps/desktop/src-tauri/Cargo.toml` — `scripts/release/sync-desktop-version.mjs`, because
  `apps/desktop` is not an npm workspace

`android-release.yml` derives `versionCode` from the same version (`YYMMDDNN`), and
`ios-release.yml` derives `CFBundleVersion` from it, so all three platforms agree on one number.

## Secrets

| secret                                                                                 | used by                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GITHUB_TOKEN` (built in)                                                              | every workflow                                                       |
| `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`                       | desktop-release, android-release (OSS `yonder-release`, cn-hangzhou) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`            | android-release                                                      |
| `IOS_DISTRIBUTION_CERT_P12_BASE64`, `IOS_DISTRIBUTION_CERT_PASSWORD`                   | ios-release                                                          |
| `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_TEAM_ID`                                       | ios-release                                                          |
| `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGNING_IDENTITY` | desktop-release (Developer ID Application for team `D4UZU32UN9`)     |
| `ASC_API_ISSUER_ID`, `ASC_API_KEY_ID`, `ASC_API_PRIVATE_KEY_BASE64`                    | ios-release (TestFlight), desktop-release (notarization)             |
| `TAURI_UPDATER_PUBKEY`                                                                 | desktop-release (contents of the updater `.pub` file)                |
| `TAURI_UPDATER_PRIVATE_KEY`, `TAURI_UPDATER_KEY_PASSWORD`                              | desktop-release (Tauri updater artifact signatures)                  |
| `DEPLOY_SSH_KEY`                                                                       | web-deploy (restricted key, see `docs/operations/web-deploy.md`)     |

`DEPLOY_SSH_KEY` is used by `web-deploy.yml`, which `release.yml` dispatches after the Release is
public. See `docs/operations/web-deploy.md`.

If any macOS certificate secret is missing, desktop-release warns and builds an ad-hoc dmg without
notarization. A Developer ID build requires the existing App Store Connect API secrets as well.

## App updates

Desktop updates use Tauri's updater signature, which is independent of Apple code signing,
notarization, and Windows code signing. Before the first updater-enabled release, the operator
generates a Tauri signing key pair (for example with `tauri signer generate --write-keys <secure-path>`) and
sets the three updater secrets above. Keep the private key and its password private and stable: apps
already shipped with one public key cannot verify releases signed by a different key. Never commit
the private key or password. The release workflow requires all three values; it writes the public
key to a temporary config overlay via `scripts/release/tauri-updater-config.mjs` and passes that
overlay to `tauri build`. Local/CI builds without a key do not register the updater, and update
checks report an error rather than claiming to be current.

The desktop workflow signs the updater artifact with `tauri signer sign --app-version`, then
`scripts/release/desktop.mjs` verifies the artifact, signature, public key and version before
uploading the versioned artifact and finally its static JSON manifest. The current build matrix
publishes `desktop/darwin.json` for Apple Silicon and `desktop/windows.json` for Windows x64 at
`https://dl.zethai.cn/`. The macOS updater archive contains the same signed app as the dmg; Apple
notarization still depends on the Apple secrets described above. Users of builds made before the
updater was included need to install an updater-enabled build first.

Android publishes `android/latest.json` only after its versioned APK. The publisher reads the
actual APK `versionCode` and `versionName` with Android build-tools `aapt`, checks them against the
release version, and records the APK SHA-256. `minSupportedVersion` is `null` by default; the
optional `min_supported_version` input on a manually dispatched `android-release.yml` run sets it
to a valid version no newer than the release. Each publication, rebuild or repair uses its own
input; specify the minimum again to retain it, otherwise it returns to `null`. Existing apps below
that version are told an update is required but are not blocked. After the user chooses to download, the app verifies the hash and
opens Android's package installer; the user may need to allow installs from this app in system
settings and must confirm installation. Android refuses to replace an app signed with a different
certificate. The web and iOS apps have no in-app updater.

### When a client looks for a release

The server watches the same feeds and pushes `device.update.available` over the socket, so a
release reaches an open client within about a minute. The client also checks on its own: five
seconds after launch, when the window returns to the foreground (throttled to once every 30
minutes), and every six hours while it stays open. The launch and foreground checks are what cover
a socket that was never opened or was dropped while the app was in the background.

`apps/web/src/updates/schedule.ts` holds those numbers. Each check is safe to repeat: a check
already running is waited for, a desktop package already downloading or ready for the same version
is not downloaded again, and a repeated failure is not reported as a new one.

Releases land faster than a user restarts, so a build that is downloaded but not installed does not
stay current by itself. The top notice and the restart dialog both re-read the feed: if a newer
build was published, the older package is closed, the newer one is staged in its place, and the
version shown in the notice and on the restart button moves to it. The restart then installs
exactly the version on screen — `install(version)` refuses any other — so a fast release cadence
never leaves a user restarting into a build that is already two releases behind.

## Rebuilding a release that failed

A signed Android APK that already exists on GitHub can be published to OSS without building or
signing it again. After the updated workflow is on `main`, dispatch:

```sh
gh workflow run android-release.yml --ref main -f version=<version> -f reuse_signed_apk=true
```

The workflow checks the GitHub asset SHA-256, APK signature and embedded version. It uploads large APKs
in 2 MiB parts to the versioned key and uses OSS CopyObject for the fixed-name APK. It verifies that
both APK URLs return the expected SHA-256 without credentials before updating `android/latest.json`.
Recovery accepts a newer version or the same version with the same APK
digest. If the release requires a minimum supported version, supply `min_supported_version` on recovery.

A release that fails in a platform workflow leaves a published Release with some artifacts missing.
Do **not** publish a new version for that: re-run the failed workflow against `main` with the fix
merged, and it appends to the same Release (`gh release upload --clobber`).

```
gh workflow run android-release.yml --ref main -f version=<version>     # expected_commit left empty
gh workflow run ios-release.yml     --ref main -f version=<version>     # expected_commit left empty
```

With `expected_commit` empty both workflows check out the dispatched ref instead of the tag, and
skip the tag → SHA equality check; the tag must still exist, because the artifact is uploaded to
that Release. `android-release.yml` additionally passes `--rebuild` to `scripts/release/android.mjs`
so `android/latest.json` accepts an unchanged `versionCode` (a downgrade is still refused).

TestFlight is the exception: it rejects a second upload with a `CFBundleVersion` it already has. If
an iOS build already reached TestFlight, the version has to move forward.

## What the first release of the shell cost, and why

`v0.3.26111301` was the first release of the rebuilt repo. Five things broke; each is now guarded:

| failure                                                                  | cause                                                                                                  | guard now                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `ENOENT: CHANGELOG.md`                                                   | the rebuild deleted the file `release.yml` writes a section into                                       | file restored; `changelog.mjs --check` runs in CI                                           |
| iOS + Android: `does not include required runtime symbols`               | `lib.rs` lost `#[cfg_attr(mobile, tauri::mobile_entry_point)]` in the rebuild                          | the attribute is back, with a comment saying why                                            |
| iOS: `CFBundleVersion [0.3.26111301.26111301] … no longer than 18 chars` | `tauri ios build --build-number` **appends** to the app version instead of replacing `CFBundleVersion` | `bundle.iOS.bundleVersion` pins it to `YYMMDDNN`; the archive step prints both plist values |
| Android: OSS publish rejected the manifest                               | the rebuild path used `--repair`, which requires an identical APK digest                               | `--rebuild` allows an equal `versionCode` only                                              |
| Windows install check: `gh` could not find the repository                | the workflow never checks out the repo, so `gh` had no remote to infer                                 | `GH_REPO: ${{ github.repository }}`                                                         |

Two habits would have caught most of these before a release: run `npm run check` (it now includes
the changelog check), and exercise the platform workflows against a throwaway tag or via
`workflow_dispatch` with `expected_commit` empty before cutting the version you intend to ship.

## Verifying an artifact

A green build job proves the bundle was produced, not that it installs. What each artifact was
actually checked against for `v0.3.26111301`:

| platform | how it was checked                                                                                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | downloaded the dmg from the Release, mounted it, copied `Yonder.app` to a temp folder, launched it, read the version from the window, quit, detached, deleted. `codesign --verify --deep --strict` passes; `spctl` **rejects** it (ad-hoc signature, no Developer ID), so a browser download needs right-click → Open. |
| Windows  | `windows-install-check.yml`: installs the nsis silently, checks the exe's `FileVersion`, requires the process to survive 20 s, screenshots, uninstalls and asserts the directory is gone.                                                                                                                              |
| Android  | installed the Release APK on the `yonder-36` emulator (`-no-window -memory 2048 -no-snapshot-save`), launched it, screenshotted with `adb exec-out screencap -p`. Start the emulator only when no local Rust build is running.                                                                                         |
| iOS      | the `上传 TestFlight` step reports `UPLOAD SUCCEEDED` and a Delivery UUID; the archive step prints the `CFBundleShortVersionString` / `CFBundleVersion` it is about to upload.                                                                                                                                         |

For new Developer ID builds, `desktop-release.yml` verifies the signed dmg and the app mounted from
it, including both notarization staples and Gatekeeper's disk-image and app assessments. A signed,
notarized download should open without right-click → Open; the ad-hoc fallback still needs that
override. The workflow also reports the `spctl -t install` result, but uses `-t open --context
context:primary-signature` for the dmg because the install policy is for installer packages. These
checks do not replace testing an actual downloaded release on a Mac. The iOS archive check reads the
app's `Info.plist` and requires `ITSAppUsesNonExemptEncryption=false`.

`apksigner verify --print-certs` in `android-release.yml` prints the signing certificate; the APK
must be signed with the release key, not the debug key.

For the Windows check, the installed executable is named after the Cargo package
(`apps/desktop/src-tauri/Cargo.toml` → `yonder-desktop.exe`), **not** after `productName`.

## Which update sources can say “ready”

- **macOS Apple silicon / Windows x64:** use the existing Tauri manifests
  `https://dl.zethai.cn/desktop/darwin.json` and
  `https://dl.zethai.cn/desktop/windows.json` through the signed updater. The publisher
  verifies the exact version signature and then compares the bytes served by the public
  download endpoint before advancing the manifest. GitHub tag/Release creation and the
  separate installer upload do not count.
- **Android:** use `https://dl.zethai.cn/android/latest.json`. The publisher checks the signed
  APK's version in the Android release job and verifies the public versioned APK and fixed
  alias against the built APK's size and SHA-256 before advancing the manifest.
- **Web:** use the live origin's `/version.json`, not a GitHub tag or the API's health
  version. The atomic deploy executor checks exact version and commit through nginx;
  `/build-version.json` is the deploy verification record.
- **iOS:** an IPA asset or `altool` upload receipt only proves submission. Confirm the
  marketing version and build number against the workflow, then verify the exact build
  under the Yonder iOS app in App Store Connect, available for testing by the intended
  TestFlight group. Check Apple processing, review where required, and expiry; a build
  ready to be assigned is not proof that the intended group can install it. An authorized
  reviewer can instead verify the exact version/build is offered for installation in
  TestFlight as a member of that group. Until one of those checks succeeds, leave the iOS
  update unannounced. Never use a public Release IPA as the fallback install path.

Apple references: [build status](https://developer.apple.com/help/app-store-connect/test-a-beta-version/view-build-status-and-metrics/),
[internal groups](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/),
and [external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).

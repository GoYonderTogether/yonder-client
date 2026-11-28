# Releases

Releases are dispatched from `main`. The normal release command publishes only to the beta
channel. Production keeps serving both channels from the same backend and database.

```sh
gh workflow run release.yml --ref main -f ref=main
gh workflow run promote-stable.yml --ref main -f tag=v0.3.26112813
```

Run the first command for day-to-day releases. Use the second for the exact candidate accepted
for public release. Its tag CI must be green, the signed macOS, Windows and Android artifacts must
exist, and the matching Web snapshot must still be on the server. Promotion reuses the exact
candidate bytes, advances stable updates and the public Web root, then changes GitHub's Latest.
Stable promotion can be retried with the same tag if a later step fails.

Operators grant **启用测试版** from the user's account detail with the dedicated beta operation
credential. The user can then choose the latest beta in **检查更新**. Turning off eligibility
also clears the account's beta selection. This affects release access on the existing account and
leaves stored product data available. Backend migrations must keep both supported clients and the
rollback backend compatible with the production database.

An installed stable build from before the channel setting needs the first-use Web entry
`/beta/me/about?beta-setup=1` or the signed beta installer. Once a build with the setting has been
promoted, eligible accounts can choose beta directly in stable **检查更新**.

The Web executor keeps the newest five snapshots plus both channels' current and previous
snapshots. Promote the accepted build while it is retained. TestFlight and the WeChat experience
build keep their own eligibility and distribution. For a public iOS or WeChat release, confirm the
matching candidate from the intended group and complete that platform's formal publishing
process separately.

## Flow

1. `release.yml` verifies the requested ref is in `main` and fast-forwards to the tip. Passing
   `require_ci=true` waits for CI. The default lets candidate publication and CI run together.
2. It increments the shared version, updates the changelog, builds Web, then atomically pushes
   the release commit and tag. The GitHub Release is a prerelease and never becomes Latest here.
3. It dispatches CI on the tagged commit and builds the candidate packages. It deploys the Web
   candidate to `/beta/` and advances the beta native update manifests after verification.

## Workflows

| Workflow                    | Trigger                                         | Result                                                    |
| --------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `ci.yml`                    | Push, pull request, or dispatch                 | Aggregate `CI` check                                      |
| `release.yml`               | Manual dispatch                                 | Tag, changelog, GitHub prerelease and beta build dispatch |
| `desktop-release.yml`       | Beta release dispatch                           | Signed macOS and Windows packages and beta updates        |
| `android-release.yml`       | Beta release dispatch                           | Signed APK and beta update manifest                       |
| `ios-release.yml`           | Beta release dispatch or dedicated iOS dispatch | TestFlight delivery                                       |
| `web-deploy.yml`            | Beta release dispatch                           | Beta Web snapshot                                         |
| `promote-stable.yml`        | Manual dispatch for a verified candidate        | Stable Web, OSS and GitHub Latest                         |
| `windows-install-check.yml` | Manual dispatch for a tag                       | Authenticode and clean Windows install/launch             |
| `auto-release.yml`          | Manual dispatch                                 | No publication                                            |

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

## Desktop operating system signing

During the development phase, the workflow reports when a Windows build is unsigned or a macOS
build has an ad-hoc signature without notarization. When both signing paths are provisioned,
set the repository variable `DESKTOP_REQUIRE_OS_CODE_SIGNING=true` before public production
distribution. In this mode the corresponding desktop job fails before upload if OS signing is
missing or fails. macOS Developer ID signing uses the App Store Connect API credentials above
for Apple notarization.

Windows signing uses the certificate linked to the approved signing provider in
`Cert:\CurrentUser\My` of the Windows x64 build runner. Set
`WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT` to the certificate's 40-digit hexadecimal fingerprint
and `WINDOWS_SIGNING_TIMESTAMP_URL` to the provider's RFC 3161 endpoint. Prefer HTTPS where the
provider offers it. The certificate private key stays with the signing provider. Tauri signs
the app payload, installer and uninstaller. The NSIS build checks the app and uninstaller
signatures and timestamps before bundling completes. The workflow checks the final installer's
signature, timestamp and certificate fingerprint before generating the Tauri updater signature.

For a dedicated release runner, set `WINDOWS_SIGNING_RUNNER` to its unique runner label. Use an
organization runner group restricted to the repository and to
`GoYonderTogether/yonder-client/.github/workflows/desktop-release.yml@refs/heads/main` under
**Selected workflows**. This limits exposure of the signing identity on the public repository.
Provision PowerShell 7, Git, GitHub CLI, the Visual Studio C++ build tools and the Windows SDK.
The signer's key provider must work non-interactively for the runner account.
If those workflow restrictions are unavailable, the GitHub-hosted runner needs the approved
provider's bootstrap to install its key provider and make the certificate available to SignTool.
Desktop release dispatches run on `main` and build the SHA pinned to the release tag.
[Runner group access](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)

Use a clean Windows runner for the signed candidate's installation check. Set
`require_authenticode=true` to verify the installer, installed app and uninstaller before
enabling the signed-only release policy, then test the app update from an existing build.
Set `expected_signer_thumbprint` if verifying a release signed with a previous certificate.
Test the browser download separately with Windows and 360 protections enabled to exercise the
SmartScreen flow. Use a new release version when migrating to Authenticode so an existing
version keeps its original artifact hashes.

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
publishes `beta/desktop/darwin.json` for Apple Silicon and `beta/desktop/windows.json` for Windows x64 at
`https://dl.zethai.cn/`. The macOS updater archive contains the same signed app as the dmg; Apple
notarization still depends on the Apple secrets described above. Users of builds made before the
updater was included need to install an updater-enabled build first.

Android publishes `beta/android/latest.json` only after its versioned APK. The publisher reads the
actual APK `versionCode` and `versionName` with Android build-tools `aapt`, checks them against the
release version, and records the APK SHA-256. `minSupportedVersion` is `null` by default; the
optional `min_supported_version` input on a manually dispatched `android-release.yml` run sets it
to a valid version no newer than the release. To set a minimum, pass it on the initial candidate publication. Promotion preserves that manifest. Existing apps below
that version are told an update is required but are not blocked. After the user chooses to download, the app verifies the hash and
opens Android's package installer; the user may need to allow installs from this app in system
settings and must confirm installation. Android refuses to replace an app signed with a different
certificate. The web and iOS apps have no in-app updater.

## Rebuilding a release that failed

A signed Android APK that already exists on GitHub can be published to OSS without building or
signing it again. After the updated workflow is on `main`, dispatch:

```sh
gh workflow run android-release.yml --ref main -f version=<version> -f reuse_signed_apk=true
```

The workflow checks the GitHub asset SHA-256, APK signature and embedded version. Recovery
accepts the same bytes for that exact candidate. The stable aliases are changed only by promotion.

Rerun an interrupted workflow with the same tag to repair a transient failure before its
artifact is published. If a fix changes source or already-published signed bytes, publish a
new beta. TestFlight also requires a new build number after a successful upload.

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

| platform | how it was checked                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | downloaded the dmg from the Release, mounted it, copied `Yonder.app` to a temp folder, launched it, read the version from the window, quit, detached, deleted. `codesign --verify --deep --strict` passes. Gatekeeper **rejects** this historical ad-hoc build. |
| Windows  | `windows-install-check.yml`: installs the nsis silently, checks the exe's `FileVersion`, requires the process to survive 20 s, screenshots, uninstalls and asserts the directory is gone.                                                                       |
| Android  | installed the Release APK on the `yonder-36` emulator (`-no-window -memory 2048 -no-snapshot-save`), launched it, screenshotted with `adb exec-out screencap -p`. Start the emulator only when no local Rust build is running.                                  |
| iOS      | the `上传 TestFlight` step reports `UPLOAD SUCCEEDED` and a Delivery UUID; the archive step prints the `CFBundleShortVersionString` / `CFBundleVersion` it is about to upload.                                                                                  |

For new Developer ID builds, `desktop-release.yml` verifies the signed dmg and the app mounted from
it, including both notarization staples and Gatekeeper's disk-image and app assessments. Gatekeeper
must accept the downloaded production installer. The workflow also reports the
`spctl -t install` result, but uses `-t open --context
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
  `https://dl.zethai.cn/desktop/windows.json` through the signed updater. Beta inserts
  `/beta` before `/desktop`. The publisher
  verifies the exact version signature and then compares the bytes served by the public
  download endpoint before advancing the manifest. GitHub tag/Release creation and the
  separate installer upload do not count.
- **Android:** use `https://dl.zethai.cn/android/latest.json` for stable or
  `https://dl.zethai.cn/beta/android/latest.json` for beta. The release verifies the public
  versioned APK size and SHA-256. Stable promotion additionally verifies the fixed download alias.
- **Web:** use the live origin's `/version.json` or `/beta/version.json`. The executor checks the
  exact version and commit through nginx at the corresponding `build-version.json`.
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

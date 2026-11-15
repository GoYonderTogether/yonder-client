# Releases

Releases are manual. Nothing publishes automatically.

## Flow

```
Release (workflow_dispatch, release.yml)
  └─ verify ref is in main, fast-forward to origin/main
  └─ require the aggregate `CI` check on that commit to be green
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
| `desktop-release.yml`       | dispatched by `release.yml` (also `release: published` for manual publishing) | macOS Developer ID-signed, notarized dmg (ad-hoc fallback) + unsigned Windows nsis → Release + OSS `desktop/<version>/`                        |
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
| `DEPLOY_SSH_KEY`                                                                       | web-deploy (restricted key, see `docs/web-deploy.md`)                |

`DEPLOY_SSH_KEY` is used by `web-deploy.yml`, which `release.yml` dispatches after the Release is
public. See `docs/web-deploy.md`.

If any macOS certificate secret is missing, desktop-release warns and builds an ad-hoc dmg without
notarization. A Developer ID build requires the existing App Store Connect API secrets as well.

## Rebuilding a release that failed

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

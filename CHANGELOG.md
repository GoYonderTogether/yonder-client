# Changelog

## [Unreleased]

## [0.3.26111504] - 2026-11-15

### Added

- keep the public client in step with official app updates

## [0.3.26111503] - 2026-11-15

### Fixed

- include the release version consistency check
- remove server-only workspaces from the public release

## [0.3.26111503] - 2026-11-15

### Fixed

- allow native shells to reach the production API
- auth：retain shell sessions across restarts
- refresh OSS upload signatures and handle upstream disconnects

### Added

- updates：show update status in About
- updates：add native desktop and Android bridges

## [0.3.26111502] - 2026-11-15

### Fixed

- support approved single-parameter SMS templates

## [0.3.26111501] - 2026-11-15

### Fixed

- shell：preserve detail state across responsive layouts
- render readable conversation previews
- show platform providers and their models
- account：format device dates in the selected language
- restore chat Markdown list markers
- models：show localized provider validation errors
- keep chat tables readable on small screens
- chat：show reconnecting while reply status is unknown
- keep Chinese punctuation outside chat links
- auth：keep setup action labels readable
- show exact quota balance
- legal：make Chinese website links explicit

## [0.3.26111403] - 2026-11-14

### Fixed

- provider requests on the server, and the mobile builds

## [0.3.26111402] - 2026-11-14

### Fixed

- return focus to the legal link only once the sign-in form is visible again
- desktop：tauri dev talks to the local server through the Vite proxy
- ui：leave 「我」 for sign-in in the same click as signing out; exact tab names in e2e
- e2e：create .e2e/ before the server's log redirect
- ci：kill the health server by port, not by its npm wrapper
- ci：stop the health-check server before the end-to-end run
- health reported a stale version and called an unconfigured SMS "configured"
- a shell build needs an absolute API origin

### Added

- add public legal documents
- price glm-5.3-flash and keep each price's source with its entry
- implement audited cloud chat model loop
- deploy：backend install script, systemd unit, nginx routes; real download links
- web：landing page and download page with environment detection
- show invitations and quota in the web app
- record signup invitations and quota grants
- add development debug panel
- ui：Bot face avatars, flat conversation list, rounded app icons
- web：add development component preview
- auth：align sign-in views and language switching
- ui：standardize tokens and form controls
- ui：adopt three-tab shell navigation
- ui：use selected logo across product surfaces
- desktop：regenerate platform app icons
- brand：replace selected logo and web icons
- ui：IM-style frame, styling, and the 「我」 tab

### Changed

- shell：use the library Segmented and IconButton; no back button beside the list on wide

## [0.3.26111401] - 2026-11-14

### Fixed

- release：retry OSS uploads instead of failing the release

## [0.3.26111302] - 2026-11-13

### Fixed

- release：add --rebuild for republishing the same Android version
- release：pin CFBundleVersion instead of appending a build number
- ci：find the installed exe by the name Tauri actually uses
- ci：pass the installer name to the windows install step
- release：let android-release rebuild an existing version from a ref
- ci：give windows-install-check the repository to talk to
- desktop：restore tauri::mobile_entry_point on run()

## [0.3.26111301] - 2026-11-13

- 从零重建：仓库里只剩新壳（网页 + Tauri 桌面/移动外壳），旧产品移出主线，保留在 tag `archive/harness-20261113` 与分支 `archive/harness-main`。
- 发版改为全手工：`auto-release.yml` 不再监听 CI，只有 `release.yml` 的 workflow_dispatch 能发版。

### Fixed

- release：restore CHANGELOG.md and gate it in CI

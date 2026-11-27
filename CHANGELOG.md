# Changelog

## [Unreleased]

## [0.3.26112716] - 2026-11-27

### Fixed

- connectors：restore Mac file previews and keep chat links concise
- chat：truncate the composer quote bar and keep its cancel button visible

## [0.3.26112715] - 2026-11-27

### Added

- ui：selected tab icons use the accent colour; align confirm dialogs with the released API; development stays on main
- ui：neutral glass materials for floating chrome
- connectors：add device file preview protocol
- auth：require invitations to join the beta
- landing：use a globe menu for language selection
- web：make Yonder installable as a web app
- protocol：a device endpoint serves the same four wires a cloud one does

### Fixed

- release：verify desktop operating system signatures
- chat：use a standard row for Bot visits
- miniprogram：use message list row for Bot visits
- chat：open Bot visits in a dedicated message pane
- miniprogram：open incoming Bot visits in a separate list
- chat：fold incoming Bot visits and relay from the composer
- notifications：show content setting when supported by the server
- ios：open system settings to change notification permission

## [0.3.26112714] - 2026-11-27

### Fixed

- ui：draw the invitation entry without a reward rule, and measure round bubbles

## [0.3.26112713] - 2026-11-27

### Fixed

- models：per-protocol address suffixes, keep the address and key when the run location changes, and show the server reason when a model fetch fails

## [0.3.26112712] - 2026-11-27

### Added

- ui：add shared detail panes and device file readers

## [0.3.26112711] - 2026-11-27

### Fixed

- web：keep the rebased branch in step with main
- web：move developer panel below the header

### Added

- memory：expand notes and recordings in the sidebar
- tasks：show live runtime beside active items
- contacts：separate contacts and friend requests

## [0.3.26112710] - 2026-11-27

### Added

- web：the present above the main composer, built-in brand icons, official channel icons

## [0.3.26112709] - 2026-11-27

### Added

- ui：flat two-layer glyphs for memory kinds, activities, files, folders, tasks and contacts

## [0.3.26112708] - 2026-11-27

### Fixed

- invite：keep the track at its spots when an account invited more

### Added

- ui：neutral glass materials for floating chrome

## [0.3.26112707] - 2026-11-27

### Fixed

- chat：show quoted replies below rounded bubbles

## [0.3.26112706] - 2026-11-27

### Added

- models：K/M token input, output limit field, sectioned provider form and the real reason a model fetch failed

## [0.3.26112705] - 2026-11-27

### Added

- chat：quote, forward, recall, delete and rate messages

## [0.3.26112704] - 2026-11-27

### Added

- beta invitations, one-screen invite page and entry points, desktop access, PWA, device file previews
- chat：offer an attachment's download row from the message menu
- chat：add attachment download actions and image navigation
- chat：restore avatar and message context menus

## [0.3.26112703] - 2026-11-27

### Added

- connectors：one card per connector, device switches inside

## [0.3.26112702] - 2026-11-27

### Fixed

- chat：send immediately after IME confirmation
- chat：cap the phone composer within the chat area
- chat：use a chevron for the group member list
- chat：show waiting dots for owned secondary bots
- memory：show back on desktop memory pages
- tasks：keep the selected desktop item highlighted
- chat：grow the desktop composer within line and height limits

## [0.3.26112701] - 2026-11-27

### Added

- settings：group computer access permissions per device

## [0.3.26112609] - 2026-11-26

### Fixed

- providers：show raw lowercase reasoning levels
- providers：restore local URL and compact reasoning level selection
- providers：preserve native endpoint editing and local key handoff

## [0.3.26112608] - 2026-11-26

### Fixed

- chat：use a standard row for Bot visits
- miniprogram：use message list row for Bot visits

## [0.3.26112607] - 2026-11-26

### Added

- connectors：align device cards and restore Apple setup entries

## [0.3.26112606] - 2026-11-26

### Fixed

- chat：open Bot visits in a dedicated message pane
- miniprogram：open incoming Bot visits in a separate list

## [0.3.26112605] - 2026-11-26

### Fixed

- chat：fold incoming Bot visits and relay from the composer
- ios：read public group from build relationships
- ios：make TestFlight status exact and redact private data
- notifications：show content setting when supported by the server
- ios：open system settings to change notification permission
- ios：verify TestFlight availability and signed build identity

## [0.3.26112603] - 2026-11-26

### Added

- models：a device endpoint serves the same four wires a cloud one does

## [0.3.26112509] - 2026-11-25

### Added

- notifications：ask for permission, subscribe to Web Push, report presence
- models：four upstream protocols, per-model effort and a slot table

## [0.3.26112506] - 2026-11-25

### Added

- meetings：a recording's card opens its transcript and write-up files
- protocol：a recording reports the two memory files it keeps

## [0.3.26112505] - 2026-11-25

### Added

- voice-memos：a long memo is read one two-minute window at a time
- intake：the connector import card shows what will be imported and opens its session

## [0.3.26112504] - 2026-11-25

### Fixed

- photos：compare the iCloud refusal by its numeric code

### Added

- protocol：the picture command carries the edge it must encode at
- photos：read at the model's edge, name the real refusal, and hand a picture back
- chat：inline code and quotes are drawn, and one page previews them

## [0.3.26112503] - 2026-11-25

### Fixed

- recording：tolerate older server responses without progress

### Added

- memory：the organization tree reads the server's folder names too
- memory：read every folder name from the server
- protocol：an agent message may carry image references
- web：the live page prints the same time and speaker label as the reader
- web：the live page and the recording reader read the shared paragraphs
- protocol：one reading format for a stored transcript

## [0.3.26112502] - 2026-11-25

### Fixed

- e2e,composer：a mention's caret no longer undoes a newline, and two fixtures stop trusting the machine
- chat：give bubbles 90% of the column, keep the tab capsule and the grey card

## [0.3.26112501] - 2026-11-25

### Fixed

- queue passive notifications in the top overlay

## [0.3.26112414] - 2026-11-24

### Added

- memory：archived group, read-only archived files, and 恢复

### Fixed

- composer：keep mobile draft text and Markdown overlay aligned at all scales

## [0.3.26112413] - 2026-11-24

### Added

- 通用：界面大小 5 档（最小/小/中/大/最大），一处倍率带动字号、间距、圆角、控件、图标、输入区与标签栏；默认「中」比原先大 10%
- settings：interface size in five levels, default 10% larger
- shell：the system's Back closes the top layer before history
- shell：make the back gesture follow the system's page transition
- chat：confirm cards list their targets, and the privacy policy matches real deletion

### Fixed

- client：simplify chat bubbles, update notices and version display
- shell：find the page below a pushed page, not the page itself
- chat：the phone's bar is grey under a white composer, and a tab wears a capsule

## [0.3.26112412] - 2026-11-24

## [0.3.26112411] - 2026-11-24

### Fixed

- chat：let the phone draft sit on the composer's one card

## [0.3.26112410] - 2026-11-24

### Fixed

- chat：wrap at the field's width and give bubbles a sender's tail

## [0.3.26112409] - 2026-11-24

## [0.3.26112408] - 2026-11-24

### Fixed

- ios：enable locked SHA-256 for photo cursor scope

## [0.3.26112407] - 2026-11-24

## [0.3.26112406] - 2026-11-24

### Added

- chat：a failed reply is one system line, never a caption on the bubble

## [0.3.26112405] - 2026-11-24

## [0.3.26112404] - 2026-11-24

## [0.3.26112403] - 2026-11-24

### Fixed

- chat：unify desktop Bot conversation headers

## [0.3.26112402] - 2026-11-24

### Fixed

- client：align chat rows and automatically fit large photo uploads

## [0.3.26112401] - 2026-11-24

### Added

- tasks：fold archived items under the list and load them on open
- chat：merge identical failures in a row into one counted line
- groups：members bring and take out their own Bots; confirm cards show what they ask and what came of it
- chat：the photo archive plan line, and archive strings in their own locale file
- chat：show the photo archive's stop, end and finish as a system line
- tasks：hand off preset drafts to the main Bot
- models：speak the server's device-local relay protocol
- stage desktop model providers and signed-in landing

### Fixed

- chat：preserve cached history across refresh failures and races
- mobile：align Bot chat headers and simplify Me chrome
- miniprogram：keep the existing app available with a saved session
- auth：open known sessions offline without new UI
- web：resume stored sessions across service updates
- miniprogram：restore login after temporary service interruptions
- auth：preserve sessions during transient refresh failures

## [0.3.26112302] - 2026-11-23

### Fixed

- chat：keep the phone voice control on the left

### Added

- chat：say why a reply failed the reply protocol

## [0.3.26112301] - 2026-11-23

### Added

- tasks：a calmer goals tab with goals, their checks and finished ones
- memory：show the Bot's profile of the owner in AI 对我的了解
- recording：improve task recording cards and synchronize recording titles
- preview the AI impression and opt in to internal error reporting

### Fixed

- unblock provider settings and improve recording conversations

## [0.3.26112201] - 2026-11-22

### Changed

- web：prioritize visible entry content and contain header chrome

### Fixed

- models：align desktop providers with canonical device-local relay
- protocol：match the server's connector argument docs and order
- mac：show permissions already granted on first sign-in
- recording：simplify live recorder controls and waveform
- recording：keep live audio syncing while prior recordings finish
- ci：align internal iOS web build version
- support native QuickTime Voice Memos recordings
- page macOS Notes attachments
- expose Apple Notes attachment pagination
- clarify iPhone Calendar access recovery
- show mobile chat unread dots and open iOS notification settings
- guide Apple connector permissions and simplify actions
- devices：leave social exports with their implementation
- settings：keep device downloads in the application
- ui：anchor overlay actions below the scroll body

### Added

- web：add platform icons to signed-in downloads
- stage device model Keychain support and landing downloads
- chat：open a task session from its entry in the main chat
- chat：render owner Agent question and namecard cards in the chat
- agent：load owner Agent cards through the protocol and cache
- meetings：draw opt-in SVG diagrams in recording notes
- export native macOS Apple connector media
- show cross-device connector sources and route Apple media
- reception：drag files and folders between directories
- connectors：connect Apple data through device permissions
- reception：review Bot organization of shared memory files
- settings：group channels and scale reception browsing
- settings：redesign Bot selection and reception library
- devices：group platforms and confirm device sign-out
- contacts：open desktop contacts as a tab page
- chat：add Bot restart and clear history actions

## [0.3.26112109] - 2026-11-21

### Added

- memory：make the AI profile a private reading page
- meetings：open a recording archive with source-linked notes

## [0.3.26112108] - 2026-11-21

### Fixed

- meetings：start live recording directly and report upload status

## [0.3.26112107] - 2026-11-21

### Added

- meetings：add recoverable live recording and private task delivery

## [0.3.26112106] - 2026-11-21

### Fixed

- mobile：switch directly away from the main Bot tab

### Changed

- shell：drive swipe-to-close with Motion drag instead of hand-rolled pointer tracking

## [0.3.26112103] - 2026-11-21

### Fixed

- ci：make main green again after merging the day's work
- desktop：build the local-files mutations module on desktop only
- ios：keep the camera usage description when preparing the project
- merge the composer focus handlers and drop the unused Me back label
- ci：align internal iOS web build version
- support native QuickTime Voice Memos recordings
- page macOS Notes attachments
- expose Apple Notes attachment pagination
- clarify iPhone Calendar access recovery
- show mobile chat unread dots and open iOS notification settings
- guide Apple connector permissions and simplify actions
- devices：leave social exports with their implementation
- settings：keep device downloads in the application
- ui：anchor overlay actions below the scroll body

### Added

- export native macOS Apple connector media
- show cross-device connector sources and route Apple media
- reception：drag files and folders between directories
- connectors：connect Apple data through device permissions
- reception：review Bot organization of shared memory files
- settings：group channels and scale reception browsing
- settings：redesign Bot selection and reception library
- devices：group platforms and confirm device sign-out
- contacts：open desktop contacts as a tab page
- chat：add Bot restart and clear history actions
- connectors：implement desktop file tools v2
- mobile：follow the finger to a stop, round close on Me, form header, Me card
- tasks：one plus menu on Items and Goals; scrim leaves as the overlay closes

## [0.3.26112102] - 2026-11-21

### Added

- mobile：main Bot as a phone tab, haptics, and keyboard-following dock

## [0.3.26112101] - 2026-11-21

### Fixed

- chat：keep legacy connector requests from breaking chat

## [0.3.26112002] - 2026-11-20

### Fixed

- ui：restore compact chat header and disambiguate notices
- chat：keep Bot replies running without a stop control
- ui：raise the system notice slightly
- ci：retain the existing Web artifact policy
- ui：unify transient notices and connector recovery
- recover tray activity and resolve cold-cache connector context
- visits：confirm inline before a visitor cancels a relay request
- preserve explicit sign-in return paths

### Added

- connectors：authorize from any client; the device applies the grant without a confirmation box
- ui：a card's fill follows the surface under it
- add desktop tray and default main Bot entry (#1)
- add desktop tray and open the main Bot by default

## [0.3.26112001] - 2026-11-20

### Fixed

- cap realtime reconnect delays at three seconds
- show compact update progress and confirm restart in app
- landing：drop the invented people from the landing page
- web：scan every UI feature package for Tailwind classes

### Added

- devices：device remarks, native device names, and connect-a-device downloads
- devices：define the device remark API
- quota：show the tools pool, tool charges and tool prices
- tools：fail on new raw UI values above a committed baseline
- shell：page widths, overlay footer and ConfirmDialog
- ui：canonical feedback, menu, switch and badge components
- tokens：add icon, width, layer, opacity, spring and motion tokens

## [0.3.26111904] - 2026-11-19

### Added

- quota：one-screen quota dashboard with pool meters, daily chart and drill-down pages

## [0.3.26111903] - 2026-11-19

### Added

- memory：one memory page under a two-sided card; Codex's chat, meeting and voice updates
- chat：read active subtasks for one Bot

## [0.3.26111902] - 2026-11-19

### Added

- social：avatars open cards, cards list a person's Bots, memory page gets a shareable QR card

### Fixed

- ios：skip removing push keys the generated project does not have

## [0.3.26111901] - 2026-11-19

### Added

- settings：one settings form standard across Bot, channel, reception and chat pages
- integrate settings, notifications, voice messages and chat layout updates
- meetings：choose speaker separation before recording
- updates：add safe desktop restart shortcut to sidebar
- friends：add contacts and system notification workflows

### Fixed

- meetings：keep idle browser recovery clear of recording start
- chat：replace activity display with message sources
- ui：limit QR camera scanning to mobile hosts

## [0.3.26111802] - 2026-11-18

### Fixed

- memory：readable error sentences, and leave a deleted file cleanly
- memory：name every file author, never by internal words
- ui：align list headers and task creation actions
- ui：dismiss action dialogs and toggle desktop settings

### Added

- memory：undo a reply's memory change across all its writes
- memory：a meeting source on a timeline card opens that meeting
- memory：memory page, file pages and the chat update line per design 24
- shell：one right-hand side panel for group info, Bot detail and member cards
- memory：wire the web memory page and file history
- chat：open and revert a memory update
- miniprogram：show the memory timeline and about files
- data：wire memory files and realtime refresh
- protocol：define memory files and update notices
- integrate bot, goals, channels and recording updates
- protocol：sync release handoff and connector contracts
- protocol：extend channel and delivery contracts
- protocol：align shared chat and channel contracts

## [0.3.26111801] - 2026-11-18

### Added

- quota：show the coding floor refusal as the coding quota being used up
- quota：a public price page built only from the published endpoints
- quota：the usage list shows only the name the server gives each call
- quota：read the cycle, fixed floor and catalog names on the quota page
- quota：a low-quota banner that names the pool and the reset date
- tasks：事项 | 目标 页，接入合并事项列表
- quota：fetch the quota catalog only when its version changes
- quota：version the quota catalog and drop vendor names from prices

## [0.3.26111703] - 2026-11-17

### Changed

- memory：remove every automatic trigger; nothing collects or organizes on its own

## [0.3.26111702] - 2026-11-17

### Added

- memory：timeline v4 on real days, with sources, delete and day status

## [0.3.26111701] - 2026-11-17

### Fixed

- web：one exit for Back and Escape, tolerate a shell without the recorder, update e2e to the new frame
- memory：restore memory page files dropped by the previous commit

### Added

- quota：pool usage, invite rewards and scheduled tasks
- landing：scroll story with damped scrolling, pinned demos and SVG motion
- web：assemble the new frame and routes
- quota：show pools, the rate card and the platform model catalog
- invite：rebuild the invite page with a shareable poster
- connectors：connect the local device and let the Bot read and write files
- skills：import, inspect and enable skills from the me section
- memory：show memory cards and a timeline
- desktop：open add-contacts in its own window
- chat：add the new-chat menu, contacts and QR codes
- chat：rebuild the conversation view with streaming and file messages
- chat：add the /compact command to the composer
- composer：add drafts, completion and voice input to the composer
- attachments：send files with messages and preview them in place
- devices：register login devices and show them in the account page
- miniprogram：add the WeChat mini program client
- meetings：record meetings natively and keep the audio across restarts
- landing：rebuild the public landing and download pages
- native：extend content behind system bars and keep controls in the safe area
- shell：reflow list and detail into covering panes with gestures
- theme：add the Semi-based classic and glow styles

### Changed

- auth：share the sign-in presentation with the mini program
- web：defer views and coalesce cache writes

## [0.3.26111505] - 2026-11-15

### Changed

- defer web views and coalesce query cache writes

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

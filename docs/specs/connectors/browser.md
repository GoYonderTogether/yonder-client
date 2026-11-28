# 浏览器控制（接入 Tencent BrowserSkill）

> 状态：客户端与协议已实现（2026-11-28），**设备实机验收尚未完成**；服务端工具 `computer_browser_*`、策略和授权卡由服务端仓库按同一批字面量实现，契约见 `reviews/20261128-connector-tools/06-浏览器控制接入BrowserSkill.md` 与 `browser.md` 的同批实现。协议字面量两仓库逐字节一致，`toolsVersion` 为 **10**。

## 一、用户故事

1. 让 Bot 在我的浏览器里打开一个网页、读一读上面写了什么，把结果讲给我。
2. 让 Bot 在我看不懂的页面里点那几个按钮、填那几栏，我可以看着它做。
3. Bot 在它自己的窗口里做事，不来抢我正在看的窗口；页面需要我登录或过验证码时，它停下来告诉我。

## 二、为什么直接接 BrowserSkill

浏览器控制不自己写一套 CDP 扩展。腾讯 BrowserSkill（MIT 许可）已经有三部分：`bsk` 命令行、它自带的后台守护进程，以及 Chrome/Edge 的 MV3 扩展。它的会话模型本来就是一个单独的 Agent Window、可借用用户标签页、用完归还，正好满足「不抢焦点」。扩展只支持 Chromium（125+），Safari 与 Firefox 不在范围内。

分发方式是**引导安装**，不内置：

- `bsk` 默认 30 分钟自动更新并原地替换二进制，内置会反复和签名过的副本打架，也会把安装包撑大、重来 Windows 和微软商店的签名审核。
- 扩展本来就只能用户自己在商店装，内置 CLI 也省不掉这一步。

设备端只做三件事：检测有没有在跑、没跑就启动它（`bsk daemon start`）、启动后调用它。**复用用户已有的守护进程**：一个守护进程独占 52800 端口，同一 `BSK_HOME` 有 `daemon.lock`。自己另起一个或换 `BSK_HOME`，都会逼用户在扩展里手改端口，那是无法自动化的一步。每个 `bsk` 子进程都设置 `BSK_AUTO_UPDATE=off`，我们驱动的那份 CLI 不会被自动更新替换。

**不做自己的鉴权层**（创始人 2026-11-28 定）。浏览器控制是通用工具，只引导安装、连上就能用：不加配对流程、不加每次调用的确认、不实现网关协议。它已有的本地隔离（文件权限、扩展 origin 白名单）就够，不再叠一层。用户打开「浏览器控制」开关，就是允许 Bot 驱动它。

## 三、授权

| 项       | 规则                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 能力位置 | `computer-control` 的 `capabilities.browser`，默认 `false`。`fileTools`、`terminal`、`browser` 是同一连接上的三个独立能力，互不隐含                                   |
| 旧授权   | 授权库里没有 `browser` 字段的旧记录一律读作 `false`（`local_files_store::Capabilities` 的 `#[serde(default)]`）；授权从不静默扩大                                     |
| 文案     | 连接器页在电脑接管卡片下多一行「浏览器控制」：「Bot 可以在你的浏览器里打开页面、点击和输入。」                                                                        |
| 开关     | 只由自己那一行打开、关闭（`masterState` 不含它，主开关不代授）；关掉只清 `browser`，同一连接的 `fileTools`、`terminal` 保留                                           |
| 平台     | 只在 macOS、Windows 上出现（`bsk` 只在两个桌面系统发布）；Linux 虽有接线但不在发布渠道，手机没有浏览器                                                                |
| 设备校验 | `local_files_authorize` 只允许 `computer-control` 带 `browser:true`，其他连接器带它就拒绝；`browser_execute` 再按授权库核对连接器、能力、修订号、设备、会话和到期时间 |
| 版本闸门 | 设备握手 `connector.ready` 报 `toolsVersion` 10。服务端 `BROWSER_TOOLS_VERSION = 10` 以下的设备不暴露浏览器工具，也不接受这些操作                                     |

## 四、协议

`ConnectorCapabilities` 新增 `browser: boolean`；`ConnectorOperation` 新增 `browser_status`、`browser_session`、`browser_navigate`、`browser_observe`、`browser_act`。`ConnectorCommandArgs` 新增 `sessionId`、`url`、`waitUntil`、`mode`、`ref`、`value`、`key`、`deltaY`、`fullPage`；`action` 的类型扩为 `ShellJobAction | BrowserSessionAction | BrowserActAction`。结果 `kind` 与字段逐一对应下面的五个操作。

| 操作               | 参数                                                                                                                                                 | 结果 `kind`        | 结果字段                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `browser_status`   | 无                                                                                                                                                   | `browser_status`   | `installed`、`daemonRunning`、`connected`、`browsers: {name, version, extensions}[]`、`hint`（中文） |
| `browser_session`  | `action`（`start` / `stop` / `list`）、`sessionId?`（只有 `stop` 带）                                                                                | `browser_session`  | `sessions: {id, url, title}[]`、`sessionId?`（`start`/`stop` 带）                                    |
| `browser_navigate` | `sessionId`、`url`（http/https 或 `about:blank`）、`waitUntil?`（`load` / `domcontentloaded`，默认 `load`）                                          | `browser_navigate` | `url`、`title`                                                                                       |
| `browser_observe`  | `sessionId`、`mode`（`text` 默认 / `snapshot`）、`ref?`                                                                                              | `browser_observe`  | `text`、`elements?: {ref, role, name, value?}[]`（`snapshot` 才有）、`truncated`                     |
| `browser_act`      | `sessionId`、`action`（`click` / `fill` / `press` / `select` / `hover` / `scroll` / `screenshot`）、`ref?`、`value?`、`key?`、`deltaY?`、`fullPage?` | `browser_act`      | `ok`、`image?: {base64, mimeType, width, height}`（`screenshot` 才有）                               |

`ConnectorExecutionError` 新增 `browser_not_installed`、`browser_disconnected`、`browser_session_not_found`。

## 五、设备端实现（`apps/desktop/src-tauri/src/browser*.rs`）

| 文件                  | 职责                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `browser.rs`          | 设备状态：四种状态判定、复用/启动守护进程、`browser_status` 的结果与 `hint`                                                    |
| `browser_ops.rs`      | 五个操作里除状态外的四个：`bsk` 子命令构造、参数校验、结果形状（aria-snapshot 文本转元素、截图 PNG 内联）                      |
| `browser_bsk.rs`      | 以 `Supervisor` trait 抽象「跑一个子进程」：超时杀进程、在混杂日志的 stdout 里稳健地取出 JSON、把 bsk 错误码映射成连接器错误码 |
| `browser_limits.rs`   | 所有上限与超时的唯一来源，并写明每个数值保护什么                                                                               |
| `browser_png.rs`      | 从 PNG 头读宽高，不解码整张图                                                                                                  |
| `browser_windows.rs`  | 只含 Windows 逻辑：默认安装目录、`CREATE_NO_WINDOW`、`taskkill /T`、`OpenProcess` 存活判断；自包含，可单独对 msvc 编译         |
| `browser_commands.rs` | Tauri 命令 `browser_execute` / `browser_cancel` / `browser_status` / `browser_install` 与授权核对                              |

### 5.1 四种状态

| 状态                         | 判定                                                                                          | `hint`（给用户看的一句中文）                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 没装 CLI                     | `bsk` 不在 PATH，也不在安装脚本写的 `$HOME/.local/bin`（Windows：`%USERPROFILE%\.local\bin`） | 「点卡片上的『安装浏览器控制』装好 bsk，再在 Chrome 或 Edge 里装上 BrowserSkill 扩展。」             |
| 装了但守护进程没跑           | `~/.bsk/daemon.json` 不存在或其 pid 已不在                                                    | 「bsk 已装好，后台服务没有运行。点卡片上的『安装浏览器控制』或在终端运行 bsk daemon start 启动它。」 |
| 守护进程在跑但没有浏览器连上 | `bsk --json browsers` 返回空数组                                                              | 「后台服务已在运行，但还没有浏览器连上。请在 Chrome 或 Edge 里安装并启用 BrowserSkill 扩展。」       |
| 已连上                       | `browsers` 非空                                                                               | 「浏览器已连上，Bot 可以在你的浏览器里打开页面、点击和输入。」                                       |

### 5.2 子命令

参数以本机安装的 `bsk 0.3.3` 与上游 `origin/main`（0.5.0）的 `crates/bsk-cli` 命令树为准（见第六节）。全部用全局 `--json`；`--json` 在 0.3.x 与 0.5.x 都能放在子命令前。

- `browser_status` → `bsk --json browsers`（守护进程不在跑时不调用，直接是「没在跑」）。
- 守护进程启动 → `bsk daemon start`（只在不跑时；它自己 spawn 一个脱离的守护进程后返回）。
- `browser_session start` → `bsk --json session start`；`stop` → `bsk --json session stop <id>`；`list` → `bsk --json session list`，再对每个会话取页：`bsk --json tab list --session <id> --scope agent`（只读 Agent Window 自己的标签页，不碰用户正在看的窗口）。
- `browser_navigate` → `bsk --json navigate --session <id> --wait-until <load|domcontentloaded> --timeout <n> <url>`，标题取自随后的 `tab list`。
- `browser_observe text` → `bsk --json observe --session <id>`；`snapshot` → `bsk --json snapshot --session <id>`，元素从 aria-snapshot 文本的 `@eN role "name" =value` 行解析出来。
- `browser_act`：`click` → `bsk --json click --session <id> --ref @eN`；`fill` → `fill --session <id> --ref @eN --value <v>`；`press` → `press --session <id> <key>`；`select` → `select --session <id> --ref @eN --value <v>`；`hover` → `hover --session <id> --ref @eN`；`scroll` → `wheel --session <id> --delta-y <n>`；`screenshot` → `screenshot --session <id> [--full-page] --timeout <n>`，设备读回 `path` 指向的 PNG，按 288 KiB 上限编码后内联回传。

`bsk --json` 的输出里可能混有升级提示等日志行；`browser_bsk::extract_json` 取第一个配平的 JSON 值（对象或数组），解析失败返回 `operation_failed`，不把原始输出丢给模型。

### 5.3 运行步骤

运行步骤由服务端记：每完成一次浏览器调用，`browserStep` 写下动作、`sessionId`、导航的 URL 或操作的 `ref`、是否截图、耗时（`packages/platform/connectors/src/browser-tools.ts`）。设备端不另外保存一份页面文本或图片字节——运行记录是「Bot 做了什么」，不是页面的一份拷贝。

### 5.4 超时

每次 `bsk` 子进程调用都有独立超时（`browser_limits.rs`），到点用 SIGKILL（Windows 用 `taskkill /T /F`）结束子进程，返回对应的错误码，不静默挂住。数值与理由见第六节。

## 六、常量与理由

| 常量                    | 值      | 它保护什么                                                                        |
| ----------------------- | ------- | --------------------------------------------------------------------------------- |
| `SESSION_START_TIMEOUT` | 45 s    | 守护进程自己的连接等待是 35 s，会话启动要比它长，否则会在即将成功时放弃           |
| `SESSION_STOP_TIMEOUT`  | 20 s    | 停止要归还借用的标签页，可能要等扩展                                              |
| `LIST_TIMEOUT`          | 8 s     | 列会话是本地往返                                                                  |
| `STATUS_TIMEOUT`        | 8 s     | `browsers` 要的是即时快照                                                         |
| `NAVIGATE_TIMEOUT`      | 60 s    | 导航要等文档加载；CLI 自身给 45 s（`NAVIGATE_CLI_SECONDS`），我们的杀进程在它之上 |
| `OBSERVE_TIMEOUT`       | 45 s    | 大页面走一遍无障碍树要几秒                                                        |
| `ACT_TIMEOUT`           | 30 s    | 一次本地输入分发                                                                  |
| `SCREENSHOT_TIMEOUT`    | 90 s    | 整页截图要滚动拼接，是最慢的一项；CLI 自身给 75 s（`SCREENSHOT_CLI_SECONDS`）     |
| `DAEMON_START_TIMEOUT`  | 12 s    | 冷启动守护进程                                                                    |
| `OBSERVE_TEXT_BYTES`    | 65536 B | 服务端拒绝更大的一次观察文本；设备先截断并说 `truncated`                          |
| `OBSERVE_ELEMENTS`      | 400     | 服务端元素上限；超出说 `truncated`，不整份失败                                    |
| `SCREENSHOT_BYTES`      | 288 KiB | base64 后约 384 KiB，整个回执留在服务端 512 KiB 的 body 上限内                    |
| `SESSIONS`              | 10      | 一个人不会开更多 Agent Window                                                     |
| `INSTALL_TIMEOUT`       | 120 s   | 安装脚本要下载二进制并校验                                                        |

## 七、连接器页

电脑接管卡片下多一行「浏览器控制」（`DeviceSwitches` 的 `BROWSER_MEMBER`，沿用现有组件，不新增页面）。行上始终写着它的后果；`bsk` 没装时，行下显示设备自己的 `hint` 和一个「安装浏览器控制」按钮（调用平台自己的 `install.sh` / `install.ps1`），不加多余 UI。只在 macOS、Windows 出现。

## 八、不做

配对与二次确认、自己的网关协议、`BSK_HOME` 或守护进程端口的管理、Safari 与 Firefox、把 BrowserSkill 内置进安装包、在 Linux 与手机上提供浏览器控制。

## 九、未验证

- 真机：没有在 macOS 或 Windows 上跑过真实的「打开页面 → 观察 → 点击」全链路。`bsk 0.3.3` 已在本机（macOS）确认真实的子命令名、`--json` 输出形状（`browsers` 是数组、`session list` 带 `session_id`）、错误 JSON 的形状和退出码；单元测试用假 `Supervisor` 覆盖四种状态、JSON 容错、超时和参数构造，不依赖本机真的装了 bsk。
- Windows 真机：`browser_windows.rs` 用独立 stub crate 对 `x86_64-pc-windows-msvc` 编译通过（整包因 `ring` 的 C 依赖编不过）；`OpenProcess` 存活判断、`taskkill /T /F`、`CREATE_NO_WINDOW` 未在 Windows 上实际运行。
- 扩展侧：`bsk` 与本机 Chrome 扩展的联通用的是本机已装的 0.3.3；商店扩展的链接与审核状态、Windows 上扩展与守护进程的联通未实测。
- 截图：把 `bsk screenshot` 的临时文件按 288 KiB 上限编码并内联是设备端的做法，没有在真机上截过一张图、看过服务端收到后的显示。
- 服务端：`computer_browser_status/session/navigate/read/act` 的工具 schema、策略、运行步骤与错误码透传由服务端仓库同批实现，本轮只做客户端一侧。

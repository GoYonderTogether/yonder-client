# 桌面控制（`computer-control` 的 `desktop` 能力）

> 状态：客户端与协议已实现（2026-11-28），**macOS / Windows 真机验收尚未完成**；服务端工具 `computer_windows` / `computer_ax` / `computer_screen_shot` / `computer_input`、策略和授权卡由服务端仓库按同一批字面量实现。协议字面量以 [07-桌面控制设计](../../../reviews/20261128-connector-tools/07-桌面控制设计.md) 为准，两仓库逐字节一致。本文只记录客户端一侧的协议、授权、执行通道、权限与可替换接口。

## 一、用户故事

1. 让 Bot 在我自己的电脑上看一眼屏幕上的某个窗口，并据此替我点一下、输一段字、按一次键。
2. 默认在后台完成，不抢我的窗口焦点、不移动我的光标；只有在确实需要前台窗口时才抢，并且事后在运行步骤里如实说明。
3. 缺系统权限时它如实告诉我去这台电脑上打开「辅助功能」还是「屏幕录制」，而不是假装成功。

## 二、授权

| 项       | 规则                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 能力位置 | `computer-control` 的 `capabilities.desktop`，默认 `false`。与 `fileTools`、`terminal` 是同一连接上互不隐含的独立能力                                                 |
| 旧授权   | 授权库里没有 `desktop` 字段的旧记录一律读作 `false`；授权从不静默扩大                                                                                                 |
| 文案     | 连接器页与授权卡都用一句话写清后果：「Bot 可以看到屏幕并操作鼠标键盘。」（英文：Your Bot can see the screen and operate the mouse and keyboard.）                     |
| 开关     | 电脑接管组里的「桌面控制」行。主开关不代授它：它只由自己那一行打开（`masterState` 不含它），关掉它只清 `desktop`，同一连接的 `fileTools`、`terminal` 保留             |
| 平台     | 只在桌面客户端的 macOS、Windows 上出现；手机和 Web 没有后端，Linux 不在发布渠道                                                                                       |
| 设备校验 | `local_files_authorize` 只允许 `computer-control` 带 `desktop:true`，其他连接器带它就拒绝；`desktop_execute` 再按授权库核对连接器、能力、修订号、设备、会话和到期时间 |

## 三、协议

`ConnectorOperation` 新增 `desktop_windows`、`desktop_ax`、`desktop_shot`、`desktop_input`；`ConnectorCapabilities` 新增 `desktop`。参数字段与结果 `kind` 逐字如下（类型在 `packages/protocol/src/connectors/desktop.ts`）。

- `desktop_windows`：参数无；结果 `{ kind: "desktop_windows", windows: [{ id, app, title, pid, bounds: { x, y, width, height }, focused }] }`。
- `desktop_ax`：参数 `windowId`（必填）、`depth?`（默认 6，最大 12）、`maxNodes?`（默认 400，最大 2000）；结果 `{ kind: "desktop_ax", nodes: [{ ref, role, title?, value?, bounds?, actions: string[] }], truncated: boolean }`。`ref` 是不透明字符串，只在本次读取内有效，可直接传给 `desktop_input`。
- `desktop_shot`：参数 `windowId?`（缺省为整屏）；结果 `{ kind: "desktop_shot", image: { base64, mimeType, width, height }, capturedAt }`。`width`/`height` 是**像素**尺寸（含 Retina 缩放换算）。
- `desktop_input`：参数 `windowId`（必填）、`action`（`click|type|key|scroll|drag`）、`ref?`、`x?`/`y?`（窗口内坐标）、`text?`、`key?`、`deltaY?`、`toX?`/`toY?`、`delivery?`（`background` 默认 | `foreground`）；结果 `{ kind: "desktop_input", ok: true, delivered: "background"|"foreground", changed?: boolean }`。
- `ConnectorExecutionError` 新增 `desktop_permission_required`（带 `permission: "accessibility" | "screen_recording"`）、`window_not_found`、`element_not_found`。
- `toolsVersion` 升到 **9**（`apps/desktop/src-tauri/src/connector_tools.rs` 的唯一常量与版本表）：6 终端、7 读取升级、8 提权、9 桌面控制。设备握手 `connector.ready` 报 9，服务端据此才向模型暴露这些操作与 `desktop` 能力。

## 四、执行

两条通道，按场景选（设计 §2、§3）：

| 通道                        | macOS                                                                                                                  | Windows                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 无障碍读取/操作             | `AXUIElement` 遍历到 `depth`，每个节点给 `ref` 并缓存；点按用 `AXUIElementPerformAction`，不合成鼠标、不抢焦点         | UI Automation 控件树，`Invoke` / `ValuePattern.SetValue` 直接操作           |
| 识图 + 合成输入（后台优先） | `CGEventPostToPid`（后台，不改焦点）；前台才 `CGEventPost`                                                             | 先 UIA 模式，其次 `PostMessageW` 投递到目标窗口，最后 `SendInput`（仅前台） |
| 截图                        | `CGWindowListCreateImage` 只截目标窗口（`kCGWindowImageBestResolution`，Retina 全像素），`dlsym` 取符号以跨 macOS 版本 | GDI + `PrintWindow` 只截目标窗口，`GetDIBits` 取 BGRA，`png` 编码           |

- **后台优先于前台**：`desktop_input` 先按 `delivery` 决定。`background`（默认）走后台投递；仅当后端能观测到「做了但目标没变化」（`changed == false`）时才升级为前台，并在结果里如实返回 `delivered: "foreground"`。`changed` 观测不到时（`null`）不升级——不凭猜测抢焦点（设计 §3.4）。
- **无障碍元素优先**：带 `ref` 的点击/拖动用无障碍动作直接执行，不合成鼠标事件。
- **坐标换算**：窗口内坐标加窗口原点得到屏幕坐标；截图返回像素尺寸，模型按 Retina 缩放（`pixel / scale`）换算回窗口点（`desktop.rs::to_screen/pixel_size/pixel_to_point`，有单元测试）。
- **运行步骤**：每条 `desktop_input` 记录操作类型、目标窗口、是否前台投递（`delivered`）；提权不适用（桌面控制本身不提权）。

### 四.1 权限

- macOS 需要两项：**辅助功能**（读取与输入）和**屏幕录制**（截图）。在 `Info.plist` 补 `NSAccessibilityUsageDescription` / `NSScreenCaptureUsageDescription`，在 `Entitlements.plist` 补 `com.apple.security.accessibility` / `com.apple.security.screen-recording`，授权主体是 Yonder 自己。
- **首次调用时才检查**，不主动弹窗：`desktop_execute` 每次调用先查 `AXIsProcessTrusted()` / `CGPreflightScreenCaptureAccess()`，缺哪项就返回 `desktop_permission_required` 并带 `permission`，绝不假装成功。真正的系统弹窗由第一次实际操作/截图触发。
- Windows 通常不需要额外授权，但**无法操作提权后的窗口**（UAC 之后的高完整性窗口），这一条写进工具描述。

### 四.2 可替换接口与测试

- 平台实现是 `desktop.rs` 的 `Backend` trait（`list_windows` / `read_ax` / `screenshot` / `input_background` / `input_foreground`），测试用假实现，不依赖真机。
- Rust 单元测试（`desktop_test.rs`，21 个）覆盖：参数校验（`desktop_ax` 的 depth/maxNodes 边界、`desktop_input` 各 action 的必填字段）、`ref` 失效映射（`element_not_found`）、坐标换算（Retina 像素与窗口点互转、窗口原点到屏幕）、权限缺失映射（`desktop_permission_required` + `permission`）、后台优先于前台的选择逻辑（`should_escalate`）。

## 五、常量与理由

| 常量               | 值   | 它保护什么                                          |
| ------------------ | ---- | --------------------------------------------------- |
| `AX_DEFAULT_DEPTH` | 6    | 常见应用窗口的控件层级深度够用，不过深地遍历整棵树  |
| `AX_MAX_DEPTH`     | 12   | 给 `depth` 一个硬上限，异常深的树也不会拖死一次读取 |
| `AX_DEFAULT_NODES` | 400  | 一次结果里模型真正会读的节点量级                    |
| `AX_MAX_NODES`     | 2000 | 节点数的硬上限，避免一次 `desktop_ax` 撑爆上下文    |

## 六、不做

Linux 与手机、Web 上的桌面控制（后端只在 macOS/Windows 构建里）；服务端长期保存截图（只用于当次决策）；借用 Codex / Claude Code 的闭源 computer-use 资源（授权会记在别人的账号名下）。

## 七、未验证

- **macOS 真机**：`AXUIElement` 树在微信、QQ、Electron 应用上的可读程度；`CGEventPostToPid` 在目标应用未激活时是否稳定生效；`CGWindowListCreateImage` 在 macOS 15+ 的 `dlsym` 取符号是否如预期；Retina 与多屏不同缩放下的像素换算。本次只做了本机 `cargo build`/`cargo test`（仅编译与单元测试，未点一次真窗口、未截一次真屏）。
- **Windows 真机**：UIA 树读取与 `Invoke`/`ValuePattern` 在常见应用上的效果；`PostMessageW` 对 UWP/Chromium 应用的兼容性；`PrintWindow` 对遮挡窗口的捕获；`SendInput` 前景路径。本次未在 Windows 真机运行。
- **Windows 编译验证**：整包 `cargo check --target x86_64-pc-windows-msvc` 在 Mac 上因第三方 C 依赖（rustls 的 `ring`）需要 MSVC 工具链而无法编过，故把 `desktop.rs`、`desktop_time.rs`、`desktop_windows.rs` 抽成独立 stub crate（`apps/desktop/src-tauri/windows-check/`）对 `x86_64-pc-windows-msvc` 编译。命令：`cd apps/desktop/src-tauri/windows-check && CARGO_TARGET_DIR=/tmp/win-check-target RUSTC=<rustup stable rustc> <rustup stable cargo> check --target x86_64-pc-windows-msvc`，结果 **0 error、0 warning**。（Homebrew 的 cargo 不认 rustup 的 Windows 目标库，需用 rustup stable 工具链自带的 `cargo`/`rustc`。）
- 服务端 `computer_windows` / `computer_ax` / `computer_screen_shot` / `computer_input` 的工具 schema、策略与错误码透传；本轮只做客户端一侧。

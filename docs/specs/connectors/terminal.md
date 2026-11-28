# 终端（`computer-control` 的 `terminal` 能力）

> 状态：客户端与协议已实现（2026-11-28），**设备实机验收尚未完成**；服务端工具 `computer_shell` / `computer_shell_job`、策略和授权卡由服务端仓库按同一批字面量实现。协议字面量以 [TOOLS-V3 第九节](../../../reviews/20261120-connector-authorization-interaction/TOOLS-V3.md) 为准，两仓库逐字节一致。本文记录客户端一侧的协议、授权、转后台与重启核对。

## 一、用户故事

1. 让 Bot 在我自己的电脑上跑一条命令（构建、测试、`git`、一个小脚本），结束前我就不用管它。
2. 命令超过 15 秒还没结束时，Bot 拿到句柄，之后可以查状态、读增量输出、等它结束或结束它。
3. 我关掉 Yonder 或它崩了，正在跑的命令不因此消失；重新打开后 Bot 还查得到它的结果，或者明确告诉我「丢失，退出码未知」。

## 二、授权

| 项         | 规则                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 能力位置   | `computer-control` 的 `capabilities.terminal`，默认 `false`。`fileTools` 与它是同一连接上的两个独立能力，互不隐含                                                    |
| 旧授权     | 授权库（`local-file-grants.json`）里没有 `terminal` 字段的旧记录一律读作 `false`；授权从不静默扩大                                                                   |
| 文案       | 连接器页与授权卡都用一句话写清后果：「Bot 可以在这台设备上以你的系统账号运行任意命令，包括删除文件和联网。」                                                         |
| 开关       | 电脑接管组里的「终端」行。主开关不代授终端：终端只由自己那一行打开（`masterState` 不含它），关掉它只清 `terminal`，同一连接的 `fileTools` 保留                       |
| 平台       | 只在桌面客户端的 macOS、Windows 上出现；Linux 虽已接线但不在发布渠道，手机没有终端                                                                                   |
| 设备校验   | `local_files_authorize` 只允许 `computer-control` 带 `terminal:true`，其他连接器带它就拒绝；`shell_execute` 再按授权库核对连接器、能力、修订号、设备、会话和到期时间 |
| 不逐条确认 | 授权后每条命令都不再询问；事后在运行步骤与完成事件里看得到命令原文、工作目录、退出码和耗时                                                                           |

## 三、协议

`ConnectorOperation` 新增 `shell`、`shell_job`；`ConnectorCommandArgs` 新增 `command`、`workdir`、`timeoutMs`、`background`、`notify`、`stdin`、`elevated`、`justification`、`action`、`jobId`、`text`、`eof`（`offset` 与文件读取共用，`shell_job log` 里是字节偏移）。结果 `kind` 为 `shell`、`shell_job`，字段逐字见 TOOLS-V3 第九节。

- `shell` 参数：`command`（必填，原样执行）、`workdir?`（绝对路径，默认用户主目录）、`timeoutMs?`（硬超时，默认不设；上限 1 小时）、`background?`、`notify?`（默认真）、`stdin?`（默认关）、`elevated?`（仅 `toolsVersion >= 8`）、`justification?`（仅 `toolsVersion >= 8`）。
- `shell` 结果：`status`（`done` / `running`）、`exitCode?`、`output`、`truncated`、`outputPath`、`jobId?`（仅 `running`）。提权不改变结果结构。
- `shell_job` 参数：`action`（`list` / `status` / `log` / `wait` / `write` / `kill`）、`jobId?`（允许唯一前缀）、`offset?`、`text?`、`eof?`。
- `shell_job` 结果：`jobs?[]`（`jobId`、`name`、`status`、`elapsedMs`、`exitCode?`、`logPath`）、`output?`、`offset?`、`next?`、`truncated?`、`running?`、`exitCode?`。
- `ConnectorExecutionError` 新增 `timeout`、`output_unavailable`、`job_not_found`、`job_lost`，以及提权的 `elevation_denied`、`elevation_timeout`、`elevation_unavailable`。
- 设备上报新增 realtime `shell.job.finished`（`connectionId`、`jobId`、`command`（前 80 字符）、`status`、`exitCode?`、`elapsedMs`、`outputTail`），服务端据此写一条 `【事件 · 终端】`。
- `toolsVersion` 升到 **8**：管理员执行的 `elevated`、`justification` 是版本 8 起才有的参数（6 是终端本身，7 是读取工具升级）。设备握手 `connector.ready` 报 8，服务端据此才向模型暴露这两个参数。

## 四、执行

| 项       | 实现                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| 前台窗口 | `SHELL_FOREGROUND_MS = 15000`，设备端计时；到点返回 `running` + `jobId` + 输出尾部，进程继续跑                   |
| 进程归属 | 进程归客户端管理；Unix 独立进程组、Windows 任务对象（job object），停止时终止整棵树                              |
| 输出     | stdout 与 stderr 直接追加到 `<job>/output.log`，退出码由包装器写进 `<job>/output.exit`；不经过管道               |
| 返回上限 | `output` 不超过 65536 字节：前 16 KiB 加后 48 KiB，在 UTF-8 字符边界截断；完整输出用 `outputPath` 加 `read` 翻页 |
| shell    | Unix 用 `$SHELL`（缺省 `/bin/sh`），Windows 用 PowerShell；`workdir` 必须绝对且是目录                            |
| 标准输入 | 默认 `Stdio::null()`、不分配终端；`stdin:true` 才开管道，`shell_job write` 写入，`eof:true` 关闭                 |
| 不做     | 不设命令白名单，不改写命令                                                                                       |

### 四.1 管理员执行（`elevated`）

普通终端没有管理员权限，`sudo` 在没有终端的环境里会失败；要提权就用 `elevated`（补充方案第二节）。设备端实现：

- **参数校验**：`elevated` 必须是布尔；`elevated:true` 时 `justification` 必填、非空（去空白后）、不超过 300 字符、无 NUL；`elevated` 缺省或为 `false` 时不得带 `justification`。不符一律 `path_invalid`，在弹窗之前拒绝，服务端已经查过一次，设备端再查一次互不信任。`elevated:true` 与 `stdin:true` 不能同时用（提权进程不继承管道），同样 `path_invalid`。
- **macOS**：`osascript` 的 `do shell script … with administrator privileges with prompt "…"`，由系统弹管理员授权对话框，用户在这台电脑上输密码或 Touch ID；`justification` 作为对话框里的原因。Yonder 不保存、不经手密码。命令原文写进 `command.sh` 按路径执行，从不拼进 shell 词或 AppleScript 字符串。
- **Windows**：`ShellExecuteExW` 的 `runas` 动词（UAC）；命令写进 `command.ps1`（UTF-8 BOM）由 PowerShell `-File` 按路径执行，`elevated.cmd` 把 `%ERRORLEVEL%` 写进 `.exit`、退出 0。提权进程不继承管道，输出重定向到 `output.log`——沿用普通终端的 jobs 日志和 `.exit` 机制。
- **授权一次的证明**：启动器无法区分「已批准」与「还在等批准」（`osascript` 阻塞在授权对话框里），所以提权进程自己第一步写 `elevated.marker`（macOS 的 `elevated.pid` 还记自己的 pid 供 `kill` 用）。设备端最多等 `SHELL_ELEVATION_PROMPT_MS` 看这个标记，超时即 `elevation_timeout` 并结束启动器（取消待决对话框）。
- **错误码**：用户拒绝 → `elevation_denied`；等标记超时 → `elevation_timeout`；非 macOS/Windows 平台或无法弹窗（无图形会话、`osascript`/`cmd.exe` 启动失败）→ `elevation_unavailable`。都不重试、不换方式、不降级为无权限运行。
- **与普通命令一致**：提权命令同样走 15 秒前台转后台、`jobs.json` 记录、完成事件、`shell_job`。`kill` 先结束启动器，再按 `elevated.pid` 结束提权进程本身；权限不足、结束不掉时如实返回 `operation_failed`，不谎报已停。
- **运行步骤**：`elevated:true` 的 `shell` 步骤记录命令原文、`elevated: true` 和用户看到的 `justification`（存在 `jobs.json` 的 `elevated`、`justification` 字段里）。
- **可替换的提权接口**：`Elevate` trait 与 `set_test_elevator` 测试入口让单元测试用假实现覆盖拒绝/超时/成功，绝不弹系统对话框。

## 五、任务记录与重启核对

- `jobs.json` 在应用数据目录（与 `local-file-grants.json` 同级）；每个 job 一个目录 `shell-jobs/<jobId>/`，内含 `output.log` 与 `output.exit`（提权命令另有 `elevated.marker`、`elevated.pid`、`command.sh`/`command.ps1`）。记录字段：`id`、`command`、`workdir`、`startedMs`、`pid`、`startToken`、`logPath`、`notify`、`notified`、`status`、`exitCode`、`stdin`、`connectionId`、`elevated`、`justification`。
- `startToken` 是进程自身的启动时间（macOS 用 `proc_pidinfo`、Linux 用 `/proc`、Windows 用 `GetProcessTimes`），防止系统把同一个 pid 分给别的进程后把「还活着」认错。
- 启动时 `resume()` 逐条核对：进程在且启动时间相同 → 接管；进程不在但 `.exit` 有码 → 记 `done`；两者都没有 → 记 `lost`，事件里明确说丢失、退出码未知，不假装成功。
- 完成通知：后台 watcher 每 700 ms 调一次 `settle_all`，进程结束即落盘状态，并经 `shell-job-finished` 事件交给 webview 上报；`notified` 去重，只通知一次。
- 取消：停止一轮会调 `shell_cancel`，按命令 id 找到它启动的 job 并杀掉整棵树；`shell_job kill` 同样只杀进程，不撤销已经发生的外部影响。

## 六、常量与理由

| 常量                        | 值         | 它保护什么                                                                                                                                     |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHELL_FOREGROUND_MS`       | 15000 ms   | 与旧版 harness 同值；设备端计时，命令不随请求挂住，长命令变成 job 而不是错误                                                                   |
| `SHELL_WAIT_MS`             | 15000 ms   | `shell_job wait` 最多再等一个前台窗口，再次调用即可继续等                                                                                      |
| `SHELL_OUTPUT_BYTES`        | 65536 B    | 一次结果不吃掉整轮上下文；与一个文件 `read` 页同量级                                                                                           |
| `SHELL_OUTPUT_HEAD_BYTES`   | 16384 B    | 头保留命令自身的前言（版本、警告），其余留给解释失败原因的尾部                                                                                 |
| `SHELL_EVENT_TAIL_BYTES`    | 16384 B    | 完成事件是 Bot 在别的工作中读到的消息，尾部足以判断成败；要更多用 `shell_job log`                                                              |
| `SHELL_MAX_RUNNING`         | 4          | 一台笔记本上的真实并发（一个构建、一次测试、一个 dev server、一条交互命令）；再多就与用户抢 CPU。第 5 条直接报错，不排队                       |
| `SHELL_MAX_FINISHED_JOBS`   | 50         | 保留一次会话量级的已完成记录；超出后最旧的记录连同其日志目录删除。计数上限而不是字节上限，因为日志大小由用户磁盘决定                           |
| `SHELL_EXIT_GRACE_MS`       | 100 ms     | 重启时给刚被结束的进程一次落 `.exit` 的机会，是重读一次，不是等待工作                                                                          |
| `SHELL_COMMAND_BYTES`       | 32768 B    | 旧版 harness 的命令长度上限，且命令本就是服务端有界的工具参数                                                                                  |
| `SHELL_WORKDIR_BYTES`       | 4096 B     | 与设备路径的既有上限一致                                                                                                                       |
| `SHELL_STDIN_BYTES`         | 65536 B    | 一次 `write` 与一个工具输入的上限一致                                                                                                          |
| `SHELL_LOG_BYTES`           | 65536 B    | 一页 `log` 与一个结果同量级                                                                                                                    |
| `SHELL_TIMEOUT_MAX_MS`      | 3600000 ms | 超过一小时的是用户没让 Bot 盯的常驻进程；需要常驻就用后台加 `kill`                                                                             |
| `SHELL_ELEVATION_PROMPT_MS` | 120000 ms  | 提权命令的**授权对话框**等待上限，两分钟：够用户走回电脑输密码，又短于服务端兜底；对话批准、提权进程写标记后才开始计时，已启动的命令不受它限制 |
| `SHELL_JUSTIFICATION_CHARS` | 300        | `justification` 的字符上限，与服务端同值；是一句给用户看的话，不是备注；设备端拒绝服务端也会拒绝的手工构造命令                                 |

## 七、不做

管理员提权由 `elevated` 参数承担（见第四节 4.1），不再另设连接器或页面；Linux 与手机上的终端、命令白名单与改写、伪终端（PTY）与交互式全屏程序。

## 八、未验证

- Windows 真机：`ShellExecuteExW` 的 `runas` 弹窗与 `ERROR_CANCELLED` 拒绝路径、提权进程的输出文件捕获、`taskkill /T` 结束提权进程树；本次在本机做了 `cargo check --target x86_64-pc-windows-msvc`（只编译不链接）和一个只依赖 `windows-sys` 的独立目标核对，未在 Windows 真机运行。
- macOS 真机：`osascript … with administrator privileges` 的弹窗、`with prompt` 原因文本是否如预期显示、拒绝/超时两种结果、提权进程的 `elevated.pid`/`kill`。单元测试只用假提权实现，未弹过一次真对话框。
- 服务端 `computer_shell` / `computer_shell_job` 的工具 schema、策略、`【事件 · 终端】` 与提权错误码透传；本轮只做客户端一侧（服务端在 `agent/elevate-server` 的 231771157 提交实现）。

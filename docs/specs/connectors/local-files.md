# 读取文件（`local-files`）与修改文件（`computer-control`）

> 状态：已上线（桌面端，2026-11-16）；工具 V2 的服务端契约见服务端实现；桌面端实现已补充，实际设备验收尚未完成，约定见 `reviews/20261120-connector-authorization-interaction/TOOLS-V2.md`。按 [01-连接器开发规范](../01-连接器开发规范.md) 编写。完整的任务和验收记录见 `features/connectors-tasks.md`（C01–C07）。

## 一、用户故事

1. 让 Bot 找到并读出我电脑里某份文件，帮我总结或回答问题。
2. 让 Bot 帮我新建或修改一份文本文件，改错了能恢复。

## 二、平台事实

| 项       | 事实                                                                                | 出处                                                             |
| -------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 执行位置 | 桌面客户端的 Rust 原生代码，云端只下发命令                                          | 源码：`yonder-client/apps/desktop/src-tauri/src/local_files*.rs` |
| 范围     | 当前系统账号本来就能访问的范围；不提权，不在接入时自动扫描整盘                      | 现状                                                             |
| 平台     | 清单写了 macOS、Windows、Linux；**发布流程只出 macOS 和 Windows**，Linux 属于半接线 | `manifests/local-files.ts`；`desktop-release.yml`                |
| 原生 IPC | Rust 实际文件操作已验证；Tauri/WKWebView 原生 IPC、系统权限弹窗和物理设备没有实测   | `features/connectors-tasks.md`                                   |
| 搜索实现 | V2 内容搜索使用 `ignore` 和 `regex`，不支持反向引用和环视；Windows 实机待验证       | TOOLS-V2 §3                                                      |

## 三、清单

两份清单都是 `kind: "device"`、`hidden: false`、`defaultEnabled: false`、`folder: null`、`events: {}`（不订阅事件）。`local-files` 的能力是 `query`，`computer-control` 是 `act`。

## 四、工具

| 工具                                               | 连接器           | 说明                                                                                                                         |
| -------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `local_files_list`                                 | local-files      | 列一个目录，最多 200 条，只有名字和类型                                                                                      |
| `local_files_read`                                 | local-files      | 按行读文本（`offset`/`limit`，1 到 2000 行），返回 `startLine`/`endLine`/`totalLines` 和**整个文件**的 SHA-256               |
| `local_files_grep`                                 | local-files      | 在文件内容里搜正则或字面量（`query`、`literal`、`glob`、`caseSensitive`、`limit`），遵守 `.gitignore`，跳过二进制            |
| `local_files_search`                               | local-files      | 按文件名子串找，广度优先、按路径排序，最多 200 条；`includeIgnored`/`includeHidden` 可放开 `.gitignore` 与隐藏项             |
| `local_files_index`                                | local-files      | 在起始目录下有界建路径索引，字段与 `search` 相同                                                                             |
| `computer_files_create`                            | computer-control | 创建时不覆盖已有文件                                                                                                         |
| `computer_files_edit`                              | computer-control | 必须带读到的哈希；整文件 `content` 或局部 `oldString`/`newString`（`replaceAll`）两种互斥写法，局部替换结果带 `replacements` |
| `computer_files_delete` / `computer_files_restore` | computer-control | 删除可恢复，删除必须带哈希；恢复时不覆盖目标位置的文件                                                                       |

读与写是两个连接器：只授权「修改文件」时没有 `local_files_read`；修改一般已有文件需要先请求同设备读取授权。创建和恢复返回的哈希仍可用于随后修改。

### 4.1 读的返回形状

`read` 的 `content` 是返回的行用 `\n` 连接；`startLine`/`endLine` 是这次返回的第一行和最后一行（1 起，空文件 `startLine: 1`、`endLine: 0`），`totalLines` 是整个文件的行数。`truncated` 为真表示后面还有内容，模型用 `endLine + 1` 作为下一次的 `offset`。`hash` 是整个文件的 SHA-256（流式计算），所以只读了一部分也能安全地做局部替换。

越界 offset 返回空正文，startLine 为所请求 offset，endLine 为 offset - 1，truncated 为 false。末尾换行不额外产生一行；空行可返回空正文但行数为一。单行超过 65536 字节返回 `line_too_long`；文件整体超过读取上限返回 `too_large`，无法分页处理。每页正文、行数和哈希必须来自同一次一致读取，读取中变化返回 `conflict`；跨页哈希变化时重新读取。

### 4.3 工具版本 7：大文件、超长单行、二进制和 grep

设备报告 `toolsVersion` 至少为 7 时（服务端常量 `FILE_READ_TOOLS_VERSION` 是读取侧新契约的下限；桌面端上报的 `TOOLS_VERSION` 由 `connector_tools.rs` 统一给出，终端占用 6，读取侧为 7，两端必须同时改），读取侧多出以下契约；更早的设备沿用上文，服务端不向它们提供这些参数，也拒绝它们回执里出现这些字段。

- `read` 不再有文件体积上限，流式读取，整个文件的 SHA-256 仍随每页返回，编辑照旧用它。新增 `byteOffset`（0 起的字节位置，与 `offset` 互斥）；每页返回 `startByte`/`endByte`（本页正文在文件里的字节范围），落在多字节字符中间的 `byteOffset` 顺延到下一个字符边界（最多 3 字节）。
- 单行超过 65536 字节时不再返回 `line_too_long`：返回这一行按字符边界截下的前缀，`lineTruncated: true`、`lineBytes`（整行字节数）和 `truncated: true`，模型以 `endByte` 作为下一次的 `byteOffset` 接着读。
- 二进制文件（开头 64 KiB 内有 NUL，或开头是已知的二进制格式头）返回 `binary_file`，附 `size`（字节数）和 `fileType`（`sqlite`、`pdf`、`zip`、`gzip`、`png`、`jpeg`、`gif`，认不出为 `unknown`）。设备不解析这些格式，工具说明让模型告诉用户需要 `sqlite3`、`jq` 这类终端工具。非 UTF-8 文本仍返回 `unsupported_file`。
- `grep` 不再跳过大文件或长行：长行按 64 KiB 窗口逐段匹配（相邻窗口重叠 4 KiB），命中项附 `byteOffset`（该行在文件里的字节位置加命中处）和 `column`（命中处在该行中的字节位置），`text` 是命中处附近的片段。新增 `output: "files"`，只返回 `files: [{ path, count }]`，`matches` 为空；`binaryFilesSkipped` 统计未搜索的二进制文件。
- `search` 可以只给 `glob`、不给 `query`，即按路径模式找文件；不另设 glob 工具。
- 哈希不做缓存：`read` 本来就要扫完整个文件才能给出 `totalLines`，缓存只省下哈希计算，却要处理失效和内存，不值得。

### 4.2 改的两种写法

- 整文件替换：`{ content, expectedHash }`，`content` 不超过 65536 字节。
- 局部替换：`{ oldString, newString, replaceAll?, expectedHash }`。`oldString` 必须恰好出现一次（`replaceAll` 为真时全部替换），两边各不超过 65536 字节且互不相同。找不到返回 `no_match`，出现多次且没有 `replaceAll` 返回 `multiple_matches`。

局部替换拒绝空 oldString 和 NUL，允许空 newString，按非重叠匹配计数；多次匹配错误可附少量候选行号。哈希针对原始字节，保留 BOM、未修改字节与权限位；多行按原文件换行匹配，新增行使用主导换行。拒绝符号链接和只读文件；提交前检查目标身份和写权限，其他 ACL 属性不承诺保留，失败清理临时文件。读写共享输入体积上限，replaceAll 输出也须限额；delete/restore 仍限制 64 KiB。

写入仍是临时文件加重命名，重命名前再核对一次哈希；失败返回 `conflict`，原文件不变。局部替换结果的 `replacements` 是替换次数；整文件重写不返回该字段。

## 五、授权与生命周期

- 绑定设备的稳定 id，两台同名电脑互不合并（C01）。
- 扩大到整机范围、开启修改能力，都必须在目标设备本机确认；旧的文件夹授权保持原范围（`service.ts`）。
- 断开、退出登录、会话撤销之后，迟到的结果一律拒绝（C06）。
- `grep` 归「读取文件」连接器（`operationAllowed`），没有修改能力的连接也能用。

## 六、常量和理由

| 常量                               | 值                                     | 它保护什么                                                                                               |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 单次返回的正文                     | 65536 字节 UTF-8，按行边界截断         | 一次工具结果不吃掉整轮上下文                                                                             |
| 单次替换的 `oldString`/`newString` | 65536 字节 UTF-8                       | 同一次写入要产出的正文不会超过一个结果的大小                                                             |
| `read` 的 `limit`                  | 1 到 2000 行，默认 2000                | 行数上限；实际返回仍受 65536 字节约束，大文件靠 `offset` 往后翻                                          |
| 可读文件体积上限                   | 32 MiB；版本 7 起只约束 `edit`         | 限制编辑时输入、输出内存；版本 7 的 `read` 流式读取，没有体积上限；这是资源上界，不是耗时保证            |
| 二进制判断读取的开头               | 65536 字节（`SNIFF_BYTES`）            | 与读取的分块同大，判断不多读一次盘；版本 7 起                                                            |
| grep 长行窗口                      | 64 KiB，相邻窗口重叠 4 KiB             | 内存只放一个窗口；重叠大于正则最长 500 字符，跨窗口的常见命中不会漏；版本 7 起                           |
| 内容搜索的正则长度                 | 500 字符                               | 过长的表达式是写错了，不是搜索                                                                           |
| 内容搜索的返回                     | 最多 200 条，每条 `text` 最多 300 字符 | 结果大小；`truncated` 让模型知道不完整                                                                   |
| 文件名搜索的 `query`               | 200 字符（既有值）                     | 同上，保持旧上限                                                                                         |
| `search`/`index` 的返回            | 最多 200 条                            | 结果大小；V2 去掉了「访问 1000 个条目就停」，还须遵守取消、到期时间及桌面端扫描预算                      |
| 命令兜底时限                       | 30 分钟（`COMMAND_BACKSTOP_MS`）       | 调用方的取消信号永远不来、或设备收不到取消通知时，命令不会一直挂着。正常情况下命令跟随运行的取消信号结束 |

V2 扫描必须限制访问或读取量、队列内存、每设备并发和工作时限（早于命令到期以留出回传时间）；grep 还须限制单文件、单行和正则编译大小，每行判断一次。read/edit 固定缓冲并检查取消与文件增长。桌面端每设备进程最多同时运行 1 条扫描，工作时限 15 秒且在命令到期前留 2 秒回传；最多访问 100,000 项，队列、待处理项及候选合计最多 10,000 条路径；忽略规则文件累计最多读 1 MiB，以免过滤规则本身耗尽扫描资源。grep 每次最多读 256 MiB（版本 7 起不再有单文件 8 MiB 的上限）、单行最多 64 KiB、编译正则最多 1 MiB，匹配载荷最多 128 KiB；这些上界分别约束磁盘工作量、内存与 512 KiB 回执。32 MiB 的读写限制同时约束编辑输入和输出；这些是保守资源限制，尚无吞吐或耗时实测。同步 I/O 遇慢盘或网络挂载不能保证即时中断。truncated 的扫描结果须给 `stopReason`（`results` 或 `budget`），取消返回错误。候选必须在授权范围内安全打开，只读普通文件，跳过符号链接、目录联接和 `.yonder-trash`。

## 七、不做

本机 MCP（C10）、图片与 PDF 读取、一次改多文件的补丁、手机和 Web 上的文件能力。

终端命令（C08）原先列在这里，2026-11-28 起改为已做：它是 `computer-control` 的独立能力 `terminal`，协议、授权、转后台和重启核对见 [terminal.md](terminal.md)。

## 八、验收

见 `features/connectors-tasks.md` 的验收记录，以及 `reviews/connector-review-20261116/`；V2 的验收证据放在 `reviews/20261120-connector-authorization-interaction/`。

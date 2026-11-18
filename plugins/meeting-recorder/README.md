# Meeting recorder (M1)

独立的原生录音插件，与聊天短语音按钮分开。桌面使用 CPAL 采集设备默认麦克风，原生线程保存 4 秒 PCM16 WAV；没有 WebView 内存录音或无麦克风时的合成回退。移动端由 Swift/Kotlin 持有原生采集与后台生命周期。

`ownerId` 是当前 `person.id` 对应的本机归属键，**不是服务端鉴权凭据**。只有主窗口可以调用，先 `set_owner` 再操作；命令的 owner 必须匹配已激活账号。账号变更先停止旧录音；磁盘中的旧文件不转移到新账号。

## 命令

命令前缀为 `plugin:meeting-recorder|`，参数为 camelCase：

- `set_owner({ownerId: string | null})`、`get_state({ownerId})`。
- `start({ownerId,title})`、`stop({ownerId,recordingId})`。
- `read_audio({ownerId,recordingId,segmentIndex})` 返回单段 WAV 的二进制 `ArrayBuffer`。
- 桌面 `start` 可附 `conversationId`，在开始时持久绑定 Bot 会话；旧索引缺该字段仍可读取，不偷偷绑定当前聊天。
- 桌面 `configure_upload({ownerId,baseUrl,accessToken})` 仅在内存提供当前访问凭据；只允许 HTTPS 或 loopback HTTP，不接受 URL 凭据、查询或 fragment。
- `get_upload_jobs({ownerId})` 查看本机队列；`queue_upload({ownerId,recordingId,conversationId})` 显式整理旧记录/中断记录或重排失败上传。移动端本轮不调用这三个桌面上传命令。

录音控制还提供 `pause({ownerId,recordingId})` 和 `resume({ownerId,recordingId})`。暂停只作用于当前活跃录音，保存当前片段，继续沿用同一录音；重启后恢复为中断的旧录音不能继续。状态返回 `{supported,activeId,audioLevel,paused,pauseSupported,recordings}`。`audioLevel` 是最近采集缓冲区的峰值振幅，范围 0–1，空闲或暂停时为 0。记录包含 `id,ownerId,title,state,startedAt,endedAt,durationMs,savedDurationMs,sampleRate,channels,segments,error`；时间戳是 Unix 毫秒，`state` 为 `recording|ended|interrupted`，片段为 `{index,durationMs,byteLength}`。

原生采集、保存与队列不依赖页面存活。录音中关闭桌面窗口会隐藏而非退出，录音时出现最小托盘入口可打开、结束或退出。明确退出先保存尾段；强杀/异常重启后读取记录将其标为 `interrupted`，不会重新打开麦克风或续录。

音频先写临时文件、同步、原子改名，再保存索引；macOS 额外使用 `F_FULLFSYNC` 请求存储设备刷新缓存。恢复扫描独立 WAV，处理“音频已保存而索引未更新”的窗口。保存失败立即结束采集并返回错误，已有 WAV 不删除。断电尾部损失仍须各端实际验证，不能从这些调用推导零丢失。

## 隔离检查

使用已配置网络的 Cargo；`--target-dir` 可指向现有 Tauri 产物缓存以复用编译。测试创建自己的临时目录，不用生产账号、系统钥匙串或已有会议录音。

```sh
cargo test --manifest-path plugins/meeting-recorder/Cargo.toml
cargo build --manifest-path plugins/meeting-recorder/Cargo.toml --example recorder_probe
```

示例 `recorder_probe fixture PRIVATE_DIRECTORY` 每 4 秒写一次明确标注的合成 PCM，外部强杀后用 `recorder_probe inspect PRIVATE_DIRECTORY` 恢复并验证每段 WAV。合成输入只存在于此示例，验证持久保存/恢复，不代表真实麦克风或断电验收。

`recorder_probe capture PRIVATE_DIRECTORY SECONDS` 使用真实默认麦克风（1～7200 秒），不修改权限；拒绝或未授权时应报告真实失败。启动之前确保用户已授权录制本次测试样本。

隐藏原生 IPC 试验 App 位于 `scripts/native-meeting-test/`：

```sh
cargo build --manifest-path scripts/native-meeting-test/Cargo.toml
NATIVE_MEETING_TEST_ROOT=/private/tmp/yonder-native-meeting-qa PATH_TO_NATIVE_MEETING_TEST
```

通过 stdin 按行发送 JSON，例如：

```json
{
	"id": "1",
	"op": "eval",
	"source": "window.__TAURI_INTERNALS__.invoke('plugin:meeting-recorder|set_owner',{ownerId:'qa_native'})"
}
```

支持 `eval`、`inspect`、`close`、`quit`。窗口默认隐藏，不激活用户应用、不输入键鼠、不改 TCC。用真实麦克风 `start` 后发送 `close`、等待持久段、再 `get_state/read_audio/stop`，才是原生窗口关闭后的实际采集证据；无权限时原样保留失败，不替换成合成音频。

重复执行完整的隐藏宿主回归：

```sh
python3 scripts/native-meeting-test/run.py --binary PATH_TO_NATIVE_MEETING_TEST --root PRIVATE_QA_PARENT
```

每次在给定私有目录下新建 `native-meeting-*` 子目录，保留 `report.json`、`transcript.json` 和验证用 WAV。检查真实 ready、后台录音、读取单段、结束、账号隔离、新 ID、强杀和重开恢复；finally 只清理本次进程。转储不包含音频 base64，真实样本留在私有 WAV 中。报告明确不覆盖实际断电、系统休眠/锁屏、2 小时和其他平台。

M2 桌面上传由原生线程与持久队列负责，不依赖 WebView 定时器。正常结束且开始时已绑定会话的录音自动创建云端记录、按服务端确认补传原始 WAV、提交处理。中断记录和无会话的旧记录仅在用户显式选择后排队。关闭窗口时若仍录音或有待上传任务则隐藏保活；明确退出允许中断队列，重开后补传，不续录。托盘与实际采集/上传状态同步。

上传会话凭据只在内存；切账号暂停旧队列，401 等待重新认证，新的会话可恢复上次进程留下的认证暂停状态。队列文件不保存 token。原生 HTTP 复用主壳已有的 reqwest/rustls + ring；云端转写/总结仍在服务端完成，原生层没有供应商凭据或模型调用。

隐藏宿主的 `run-upload.py` 接受明确合成 QA 的分段目录和私有认证 JSON，验证关窗后实际原生上传、真实处理、结果关联和重开后的同一任务；不会打开麦克风。`configure_upload` 的验收请求源码自动从 transcript 中屏蔽，不将 token 记入日志。

iOS/Android 这轮继续 M1 的后台采集/恢复；移动后台上传、完整系统 Live Activity 留后续平台验收。当前不提供暂停、续录或实时通话。

移动端存储检查：

```sh
swiftc plugins/meeting-recorder/ios/Sources/RecordingStore.swift plugins/meeting-recorder/ios/Tests/RecordingStoreCheck.swift -o /tmp/yonder-meeting-store-check
/tmp/yonder-meeting-store-check
```

这是合成 PCM 的保存/恢复检查，不代表 iOS 真机麦克风、锁屏或断电证据。Android 对应检查位于插件 `android/src/androidTest/`，需要隔离模拟器或真机执行。

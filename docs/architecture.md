# Yonder 客户端架构

本文件描述公开客户端仓库**当前代码**的形状和强制规则；代码变了就改这里。2026-11-18 按 main 核对过一次。

- 产品原则和设计稿由维护者单独管理；本文记录公开客户端的实现与分层约束。

## 两个仓库

| 仓库                                     | 内容                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `yonder-client`（本仓库，公开，GPL-3.0） | Web、macOS、Windows、iOS、Android 壳，微信小程序，协议类型，API 调用层，全部界面 |
| `yonder`（私有）                         | 云端 API、账号、聊天、额度、模型适配与计费、技能正文、数据库、部署               |

本仓库不放生产密钥、数据库地址、模型价格数值、平台供应商的地址或类别。
`packages/protocol` 和 `packages/api-client` 在两个仓库各有一份，必须保持一致，**以本仓库为准**；
改协议时两边同时改。默认服务端是 `https://yonder.zethai.cn`，自建只在构建时用 `VITE_API_BASE`。

## 分层

```
apps/web            装配：providers、路由、页面、输入框、预览、本机能力桥
  packages/ui/features/{auth, me, members, landing, legal, meetings}
  packages/ui/data          TanStack Query、实时连接、本地存储、偏好
  packages/ui/shell         三层导航、布局模式、手势
  packages/ui/components    原子组件
  packages/ui/tokens        设计变量（packages/ui/i18n 与它并列）
  packages/ui/auth-presentation   登录页表现层，Web 和小程序共用
  packages/ui/chat-presentation   聊天/附件/输入区表现与正文解析，Web 和小程序共用
  packages/ui/chat-model          无 React/CSS 的消息合并、连续发送者分组规则

packages/api-client ─▶ packages/protocol（不依赖任何包）
```

- 上层只能依赖下层；feature 之间互不依赖。每个包能依赖谁写在
  `tools/check-dependency-direction.mjs` 的 `LAYERS` 表里，新包必须先登记。
- 包只能从入口导入（`tools/check-entry-imports.mjs`）。
- 单文件 300 行警告、500 行失败（`tools/check-file-length.mjs`）。
- 文案必须同时有 `zh-CN` 和 `en`；颜色、尺寸、圆角只用 tokens；图标用 `lucide-react`。用哪个 token 和组件见 `docs/design-system.md`；`tools/check-ui-raw-values.mjs` 按基线拦新增原始值，`tools/check-tailwind-sources.mjs` 保证每个 UI 包都被 Tailwind 扫到。
- `ui/data` 与小程序消息状态都引用 `chat-model` 的纯规则；`ui/components` 与小程序头像也复用其中的首字、稳定配色和 BotFace 路径数据。数据层不为合并消息导入展示 CSS 或另一版本的 React。`chat-presentation` 兼容 React 18/19，DOM 与 Taro 分别提供元素和原生事件适配。

| feature            | 内容                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `auth`             | 登录、找回密码                                                                                                    |
| `me`               | 「我」的各个分区：账号与注销、隐私入口、Bot、额度与用量、模型、技能、设备、连接器、邀请、通用、关于；额度不足横幅 |
| `members`          | Bot 表单（新建和修改共用）、Bot 列表和详情、成员资料（真人和 Bot 同一套）、群资料和群管理、隐私三开关             |
| `meetings`         | 会议录音胶囊                                                                                                      |
| `landing`、`legal` | 落地页、协议和隐私                                                                                                |

## 应用和壳

| 目录                       | 内容                                                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                 | 唯一的页面实现。`src/app/` 是外框、弹层和输入框（草稿、补全、语音、录音、附件、拖放），`src/pages/` 是各页面，`src/preview/` 是 PDF、docx、图片预览，`src/lib/` 是平台和本机能力的适配，`src/updates/` 是桌面和 Android 更新 |
| `apps/desktop`             | Tauri 2 壳，同一份 `apps/web` 构建产物。`src-tauri/` 里有本机文件连接器（`local_files*.rs`）、联系人独立窗口、Android 更新；`tauri.ios.conf.json` / `tauri.android.conf.json` 是手机壳                                       |
| `apps/miniprogram`         | Taro 小程序，独立依赖和 lockfile，不在 npm workspaces 里；登录复用 `auth-presentation`，聊天复用 `chat-presentation` 与 `chat-model`，键盘/滚动/文件与预览由宿主适配                                                         |
| `plugins/meeting-recorder` | 会议录音 Tauri 插件（Rust 桌面采集、iOS、Android），4 秒分段 WAV、异常恢复；桌面原生持久上传队列不依赖 WebView，移动后台上传另列平台交付；界面在 `features/meetings`                                                         |

## 界面模型

- 三个标签：消息、任务、记忆（`packages/ui/shell/src/navigation/routes.ts` 的 `TABS`）。「我」不是标签，从左上角头像进入；桌面竖栏底部的设置按钮打开同一覆盖层，重复点击任一入口关闭并返回原页面，手机不显示该设置按钮。是 detail 层的分组设置页（`/me/:section`）。
- 层级从下到上：列表、内容（detail）、右侧栏（`ui/shell` 的 `SideLayers`，由 `AppShell` 的 `side` 统一管理）、弹窗（`Overlay`）。返回、Esc、滑动退出走同一个出口，按这个顺序一层层退：先退右侧栏里叠上去的页，再关右侧栏，再回到列表。手机和电脑是同一套顺序。
- 右侧栏放「看一个人或一个群」的资料：群资料、自己的 Bot 详情、别人的名片。宽屏和中屏是贴右边的抽屉（`--side-panel-width`），聊天仍在左边可见，点抽屉外关闭；窄窗和手机盖住聊天，左上角返回。从聊天打开会替换右侧栏的内容；从右侧栏里点成员会在栏里再叠一层。切换会话、标签或页面时右侧栏关闭。
- 弹窗只留给要用户确认或填写的事（确认删除、拉人、新建 Bot），渲染到 `document.body`，不受右侧栏位置影响。
- 布局模式由宽度决定（`layout-mode.ts`：`wide`、`medium`、`compact`、`mobile`）：宽屏三栏，中屏浮动列表，桌面窄窗保持桌面布局，手机单屏加底部 dock（标签和输入框在同一个容器）。手机必须是真正的手机布局，不是缩小的桌面。
- 登录页和落地页的最底层背景是 `ui/components` 的 `AmbientField`：浅色主题是窗光，深色是星轨，两者是 beste-ui 的 WebGL 着色器原样拷贝（MIT，在 `ambient/vendor/` 里，带 `LICENSE` 和 `SOURCE`），不进文件长度和格式检查。页面色按 `--ambient-veil` 盖在上面，浅色 0.9、深色 0.55。
- 会议录音没有独立页面或 Overlay：输入框上方的胶囊显示采集/保存和结束操作，点击原位展开/收起实际转写、纪要与回放；Bot 结果条目打开同一胶囊，界面生命周期不控制原生采集。
- 浏览器会议录音由 `apps/web/src/lib/browser-meeting-recorder.ts` 持有，与站内页面无关。安全上下文使用 MediaRecorder 采集，将完整录制片段解码为 PCM16 WAV，音频与索引一并提交 IndexedDB。桌面 Web 同一文档可在宿主允许时继续后台录制，移动 Web 页面隐藏时结束并标记中断。文档关闭、挂起或麦克风丢失时会尝试结束采集，重新打开只恢复已持久化的部分。正常结束后在当前页面上传已绑定会话的音频，服务端确认过的片段在重试时跳过。原生桌面持久上传队列与移动原生后台采集沿用插件。

### 页面

消息、任务、记忆列表在桌面与手机上都显示标题；标题与创建入口同排，分段筛选在下一排，统一使用移动端的大胶囊样式。

| 页面           | 路径或入口                                                     | 内容                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新用户引导     | `/setup/:step`，步骤 `you`、`bot`、`connect`                   | 你怎么称呼、给 Bot 起名选颜色、接入；这台设备没有可接的东西时去掉 `connect`。每步能跳过、后退，有进度点（`pages/setup/`）                                                                                                               |
| 消息           | `/messages`、`/messages/:conversationId`                       | 会话列表，自己的 Bot 置顶；顶部是额度不足横幅 `QuotaLowBanner`：写明哪个池用完、哪天重置，出口是「邀请好友得额度」和「查看用量」。对外额度用完不挡自己的聊天，所以不进横幅                                                              |
| 聊天里的来访条 | `pages/visit-bar.tsx`                                          | 和别人的 Bot 聊时显示试聊、待批准、被拒、需要自付等状态；主人一侧显示批准或拒绝                                                                                                                                                         |
| 任务           | `/tasks`（事项）、`/tasks/scheduled`（目标）、`/tasks/:taskId` | 「事项 \| 目标」两段。事项是子任务、定时执行、会议处理合成的一张清单，有详情和暂停、继续、取消；目标按「追踪」分组列出周期定时计划；事项加号把一句话填进主 Bot 的输入框草稿，目标加号菜单保留「新建目标」草稿入口及「新建定时任务」表单 |
| 记忆           | `/memory`、`/memory/about`、`/memory/files`                    | 时间线显示卡片的出处和可见级别，「了解」显示印象与近期，文件按路径组织。记忆文件支持编辑、版本历史、撤回和可见级别设置，设为公开需要确认。聊天里的记忆更新打开对应版本改动。小程序提供只读时间线和「了解」。                            |
| Bot 详情       | 右侧栏 `side-panel.tsx`，从聊天顶栏、成员行或「我 › Bot」进入  | 只开自己的 Bot：改名、换头像、删除（默认 Bot 不能删）。宽窗口是右侧抽屉，手机盖住聊天                                                                                                                                                   |
| 群资料         | 右侧栏 `side-panel.tsx`，只从群聊顶栏进入                      | 成员、群名；群主改名、拉人、移人、转让、解散，其他人退群；解散后只读并显示「该群聊已被解散」。点成员在右侧栏里再叠一层名片，返回回到群资料                                                                                              |
| 成员名片       | `/@对外号`，以及应用内的右侧栏                                 | 真人和 Bot 同一套资料组件；别人的 Bot 主按钮是「开始聊天」（`pages/visits/start-bot-chat-button.tsx`）。未登录也能看公开名片，由主人的隐私开关决定。React Router 不能匹配 `@` 开头的段，所以由 `member-card-route.tsx` 在路由之前先判断 |
| 我             | `/me`、`/me/:section`、`/me/:section/:page`                    | 见上面 `me` feature。注销是三步：发到本人手机的验证码、输入自己的对外号、确认按钮再等 3 秒；之后保留 7 天，期间登录即撤销                                                                                                               |
| 邀请           | 「我 › 邀请」                                                  | 邀请码、链接和一张可保存的邀请卡片图（`invite-share-card.tsx`），由主人自己转到微信、QQ                                                                                                                                                 |
| 价格           | `/pricing`，公开                                               | 只用公开接口（额度配置和价目表）生成，只显示「标准」「轻量」这类显示名，不写供应商和模型 id                                                                                                                                             |

公开路由：`/`（落地页）、`/download`、`/sign-in`、`/terms`、`/privacy`、`/pricing`、`/i/:code`（邀请）、`/@对外号`（名片）。

## 数据和缓存

- 服务端数据都经 `packages/ui/data` 的 hooks 读写，页面不直接调 `api-client`。
- 查询缓存持久化，`CACHE_VERSION` 变了就整体失效。草稿、未发送附件和发件箱存在 IndexedDB（`chat-cache`），重启不丢。
- 额度配置按版本缓存：服务端版本变了才重新拉，用户每次看额度不额外请求配置。客户端不写任何额度数字或价格。
- 实时事件走 `/v1/realtime` WebSocket，事件名和载荷在 `packages/protocol/src/realtime`。
- 来访会话可把一条已发送的文本转给主人。来访卡在主人主 Bot 会话和事项详情可处理，访客收到独立的结果消息。获准回复按原文展示。
- 失败一律显示真实原因（红色错误），不写成 Bot 的话。

## 还没做的

- 独立的对外资料库和每个 Bot 的 `social.md` 尚未接入。
- 「我 › 消息渠道」及 Bot 详情提供飞书授权入口和外部会话只读管理。管理页面和 Bot 消息卡共用接入组件，授权链接仅保存在组件内存，外部会话内容不写客户端持久缓存。
- 引导完成后 Bot 的打招呼消息和引导记录：页面走完直接进 `/messages`，服务端还没有对应接口。
- 购买入口：支付没开通，横幅和额度页都不放购买按钮。

## 验证

- 合入前跑 `npm run check`：Biome、`tsc -b`、Vitest、发布脚本测试、三个结构检查、Tailwind 来源和原始值检查、小程序检查。
- 涉及真实流程补 Playwright（`e2e/`）或原生测试（`scripts/native-*-test/`、`scripts/desktop-updater-test/`）。
- 不操作用户屏幕做验证。

## 文档放哪里

| 位置                    | 放什么                                       |
| ----------------------- | -------------------------------------------- |
| `docs/architecture.md`  | 本文件                                       |
| `docs/design-system.md` | tokens、组件目录、页面骨架和界面规则         |
| `docs/contracts/`       | 长期有效的行为约定（技能、语音输入、小程序） |
| `docs/operations/`      | 发版和缓存发布手册                           |
| `docs/third-party/`     | 第三方素材与许可登记                         |

一次性的评审和验收报告放在公开仓库之外。

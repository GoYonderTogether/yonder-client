# Yonder 客户端架构

本文件描述公开客户端仓库**当前代码**的形状和强制规则。产品与长期架构的权威来源是
`~/Notes/03-项目/Yonder/04-架构设计.md` 和 `架构/`（架构-12 前端分层、架构-13 文件夹结构）；
本文件只写这个仓库里已经存在的东西，代码变了就改这里。

## 两个仓库

| 仓库                                     | 内容                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `yonder-client`（本仓库，公开，GPL-3.0） | Web、macOS、Windows、iOS、Android 壳，微信小程序，协议类型，API 调用层，全部界面 |
| `yonder`（私有）                         | 云端 API、账号、聊天、额度、模型适配与计费、技能正文、数据库、部署               |

本仓库不放生产密钥、数据库地址、模型价格数值、平台供应商的地址或类别。
`packages/protocol` 和 `packages/api-client` 在两个仓库各有一份，必须保持一致；
改协议时两边同时改。默认服务端是 `https://yonder.zethai.cn`，自建只在构建时用 `VITE_API_BASE`。

## 分层

```
apps/web            装配：providers、路由、页面、输入框、预览、本机能力桥
  packages/ui/features/{auth, me, landing, legal, meetings}
  packages/ui/data          TanStack Query、实时连接、本地存储、偏好
  packages/ui/shell         三层导航、布局模式、手势
  packages/ui/components    原子组件
  packages/ui/tokens        设计变量（packages/ui/i18n 与它并列）
  packages/ui/auth-presentation   登录页表现层，Web 和小程序共用

packages/api-client ─▶ packages/protocol（不依赖任何包）
```

- 上层只能依赖下层；feature 之间互不依赖。每个包能依赖谁写在
  `tools/check-dependency-direction.mjs` 的 `LAYERS` 表里，新包必须先登记。
- 包只能从入口导入（`tools/check-entry-imports.mjs`）。
- 单文件 300 行警告、500 行失败（`tools/check-file-length.mjs`）。
- 文案必须同时有 `zh-CN` 和 `en`；颜色、尺寸、圆角只用 tokens；图标用 `lucide-react`。

## 应用和壳

| 目录                       | 内容                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                 | 唯一的页面实现。`src/app/` 是外框和输入框（草稿、补全、语音、录音、附件、拖放），`src/pages/` 是各页面，`src/preview/` 是 PDF、docx、图片预览，`src/lib/` 是平台和本机能力的适配，`src/updates/` 是桌面和 Android 更新 |
| `apps/desktop`             | Tauri 2 壳，同一份 `apps/web` 构建产物。`src-tauri/` 里有本机文件连接器（`local_files*.rs`）、联系人独立窗口、Android 更新；`tauri.ios.conf.json` / `tauri.android.conf.json` 是手机壳                                 |
| `apps/miniprogram`         | Taro 小程序，独立依赖和 lockfile，不在 npm workspaces 里；登录页复用 `auth-presentation`                                                                                                                               |
| `plugins/meeting-recorder` | 会议录音 Tauri 插件（Rust 桌面采集、iOS、Android），4 秒分段 WAV、异常恢复；界面在 `features/meetings`                                                                                                                 |

## 界面模型

- 三个标签：消息、任务、记忆（`packages/ui/shell/src/navigation/routes.ts` 的 `TABS`）。「我」不是标签，是 detail 层的分组设置页。
- 三层：tab、detail、overlay。返回、Esc、滑动退出走同一个出口。
- 布局模式由宽度决定（`layout-mode.ts`：`wide`、`medium`、`compact`、`mobile`）：宽屏三栏，中屏浮动列表，桌面窄窗保持桌面布局，手机单屏加底部 dock（标签和输入框在同一个容器）。手机必须是真正的手机布局，不是缩小的桌面。
- 公开路由：`/`（落地页）、`/download`、`/sign-in`、`/terms`、`/privacy`、`/i/:code`（邀请）。

## 数据和缓存

- 服务端数据都经 `packages/ui/data` 的 hooks 读写，页面不直接调 `api-client`。
- 查询缓存持久化，`CACHE_VERSION` 变了就整体失效。草稿、未发送附件和发件箱存在 IndexedDB（`chat-cache`），重启不丢。
- 实时事件走 `/v1/realtime` WebSocket，事件名和载荷在 `packages/protocol/src/realtime`。

## 验证

- 合入前跑 `npm run check`：Biome、`tsc -b`、Vitest、发布脚本测试、三个结构检查、小程序检查。
- 涉及真实流程补 Playwright（`e2e/`）或原生测试（`scripts/native-*-test/`、`scripts/desktop-updater-test/`）。
- 不操作用户屏幕做验证。

## 文档放哪里

| 位置                   | 放什么                                       |
| ---------------------- | -------------------------------------------- |
| `docs/architecture.md` | 本文件                                       |
| `docs/contracts/`      | 长期有效的行为约定（技能、语音输入、小程序） |
| `docs/operations/`     | 发版和缓存发布手册                           |
| `docs/third-party/`    | 第三方素材与许可登记                         |

一次性的评审和验收报告不进仓库，放在仓库外的 `~/Documents/yonder/reviews/<日期>-<主题>/`。

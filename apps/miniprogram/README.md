# Yonder 微信小程序

Taro 4.3.3、React 18.3.1，独立依赖目录。构建上报版本直接读取仓库根 `package.json.version`，与其他客户端共享版本。现有 Web 和 Tauri 继续使用 React 19；小程序不引入它们的 DOM 组件或整包 `ui-data`。

## 本机运行

在客户端仓库根目录先安装共享开发工具，再安装小程序依赖：

```sh
npm ci
npm ci --prefix apps/miniprogram
npm run check:miniprogram
npm run build:miniprogram
```

开发监听：`npm run dev:miniprogram`。构建前自动从 `packages/ui/tokens` 提取微信可用的设计变量，保持颜色、间距和圆角一致。

微信开发者工具导入 **apps/miniprogram 目录**，`project.config.json` 的 `miniprogramRoot` 已指向 `dist/`。仓库使用 `touristappid` 占位，源码编译不需要 AppID；本次官方工具的原生自动化对此返回 `APPID_ERROR`。有开发权限的真实 AppID 就绪后再做微信宿主和真机验收；当前无 AppID 时使用下方本机界面预览。

默认 API 为 `https://yonder.zethai.cn`。本机隔离服务可在构建时指定：

```sh
YONDER_MINI_API_BASE=http://127.0.0.1:8090 npm run build:miniprogram
```

本机开发时，微信开发者工具可关闭“校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”以连接 loopback；这个设置仅用于本机，不是正式配置。

正式使用时将 AppID 填入本地项目设置，配置 `request`、`uploadFile`、`downloadFile` 的 HTTPS 合法域名和 `socket` 的 WSS 合法域名。`downloadFile` 需包含签名下载实际使用的私有媒体域和公开头像域。AppSecret、模型密钥和生产凭据不得进入客户端。

默认入口为微信登录：`wx.login` 的临时 code 交给服务端验证，已绑定账号直接登录；未绑定时取得短时一次性 ticket，用户再通过原生 `getPhoneNumber` 按钮授权手机号，由服务端关联已有账号或注册并绑定微信。身份冲突不会静默合并账号。服务端未配置微信能力时明确返回不可用；H5 预览不会模拟微信登录成功，可切换到手机号验证码或密码登录。

新账号可主动选择头像、填写昵称，也可稍后完善。手机号授权、头像选择、昵称填写与产品条款/微信隐私授权分别处理，不能假定一次登录即可静默取得全部资料。解绑、换绑和其他客户端发起微信验证的流程已列入后续方案，本轮登录试点尚未实现这些管理入口。

## 本机界面预览

没有有效 AppID 时，可用 Taro 官方 H5 目标查看同一套页面并连接真实本机测试后端；它是开发预览，不是微信宿主或真机验收。

```sh
npm run build:preview --prefix apps/miniprogram
npm run serve:preview --prefix apps/miniprogram
```

打开 `http://127.0.0.1:8098`。预览产物位于 `preview/dist`，代理将 HTTP 与 WebSocket 转发至已运行的本机测试后端 `127.0.0.1:8097`。如后端使用其他端口，可设置 `YONDER_PREVIEW_BACKEND_PORT`。默认小程序构建仍输出 `dist` 并连接官方 HTTPS；两种产物互不覆盖。

H5 使用官方选图、上传与下载实现；仅对浏览器文件字节和 blob URL 生命周期做宿主适配。官方 H5 SDK 未实现录音管理器，因此预览不展示录音入口，微信目标保留原生录音。

## 复用与平台适配

- 直接复用 `@yonder/protocol`、`@yonder/api-client`、法律文案及 `markdown-to-jsx` 的纯解析器。
- 登录页与现有 Web/iOS/Android 共用 `@yonder/auth-presentation` 的外框、标题、间距、条款/操作布局和控件视觉样式；DOM 与 Taro 分别适配宿主元素、输入事件、原生授权按钮和安全区。共享包兼容 React 18/19，不导入整套浏览器组件。
- 聊天页实际消费 `@yonder/chat-presentation` 的连续发送者分组、气泡、附件与上传缩略图、输入区、正文解析配置和流式文本展示；`@yonder/chat-model` 提供不依赖 React/CSS 的消息合并、分组、头像配色与 BotFace 几何。原 Web/Tauri 消费同一实现，DOM 与微信文件/滚动/键盘能力各有适配。
- `ApiClient` 继续负责 endpoint、Bearer、refresh token 轮换、并发刷新、错误结构和请求重试；`src/lib/transport.ts` 仅将其最小 fetch 接口接到微信 request/uploadFile。
- 图片先查本地文件，未命中才向业务 API 鉴权并签名，随后直连媒体域下载。发给媒体域的请求不带业务 Bearer。头像使用稳定版本 URL 与原有上传入口。其他文件继续沿用各自的授权下载和宿主预览。
- 微信 socket 沿用服务端实时事件。前台恢复后重新验证账号并补拉页面数据；传输中断不会被当作会话撤销。
- access token 只在内存，refresh token 按 API 基址分开存于小程序隔离存储，切换本机测试与官方服务不会互发旧凭据，语言和设备偏好仍共享。不宣称具备 OS Keychain 的硬件保护。退出时清理账号草稿、发件箱、私有媒体和本端临时文件。语言等设备偏好保留。
- 小程序页面使用原生移动导航、胶囊避让、底部安全区、微信文件选择及录音，不携带桌面分栏或响应式逻辑。

## 聊天与图片

聊天历史与时间线遵守 [数据和缓存](../../docs/architecture.md#数据和缓存)。按 API 基址和账号隔离历史快照，先显示已缓存页，再按事件、游标和过期状态更新。消息按服务端 id、clientNonce 和 version 合并，保留已收到的生成状态。发送失败保留可重试内容，停止和重试沿用现有 API。消息 POST 进行中沿用原客户端禁用发送的行为。

附件上限与当前 Web 一致：总计 10 件，每件 20 MiB。微信图片单次按平台上限选择，可分批添加。移除上传会中止请求，失败可重试，异步回调受账号和会话归属约束。聊天和时间线列表按可见范围取缩略图，主动预览才请求原图。同一图片的并发请求合并，缩略图和原图分别缓存在 `USER_DATA_PATH`，受容量、文件数和账号边界约束。H5 开发预览使用临时路径。

聊天页单独管理消息区的可用高度与底部安全区。微信宿主监听键盘/窗口变化并避免双重抬升；H5 使用 `visualViewport` 和 CSS 安全区。原生 textarea、ScrollView 与预览行为仍需有效 AppID 下的微信宿主验收，浏览器或隔离 WebView 的结果不能替代它。

## 检查

`npm run check:miniprogram` 执行独立 React 类型检查、原生网络适配与导航边界回归；仓库 `npm run check` 也包含它。CI 会安装独立依赖、检查并编译小程序。真实后端集成测试和微信宿主验证的具体证据以本轮交付记录为准，编译成功不代表已完成真机或平台审核。

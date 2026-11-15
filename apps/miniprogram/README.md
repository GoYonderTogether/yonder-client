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

正式使用时将 AppID 填入本地项目设置，配置 `request`、`uploadFile`、`downloadFile` 的 HTTPS 合法域名和 `socket` 的 WSS 合法域名，包含实际文件域名。AppSecret、模型密钥和生产凭据不得进入客户端。当前工程不实现微信身份登录，沿用 Yonder 手机号验证码及密码账号。

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
- `ApiClient` 继续负责 endpoint、Bearer、refresh token 轮换、并发刷新、错误结构和请求重试；`src/lib/transport.ts` 仅将其最小 fetch 接口接到微信 request/uploadFile。
- 图片与文件下载携带授权，转为微信本地路径；头像使用原有字节上传接口。附件并非公开 URL。
- 微信 socket 沿用服务端实时事件。前台恢复后重新验证账号并补拉页面数据；传输中断不会被当作会话撤销。
- access token 只在内存，refresh token 按 API 基址分开存于小程序隔离存储，切换本机测试与官方服务不会互发旧凭据，语言和设备偏好仍共享。不宣称具备 OS Keychain 的硬件保护。退出时清理账号草稿、发件箱及本客户端下载的临时文件；语言等设备偏好保留。
- 小程序页面使用原生移动导航、胶囊避让、底部安全区、微信文件选择及录音，不携带桌面分栏或响应式逻辑。

## 检查

`npm run check:miniprogram` 执行独立 React 类型检查、原生网络适配与导航边界回归；仓库 `npm run check` 也包含它。CI 会安装独立依赖、检查并编译小程序。真实后端集成测试和微信宿主验证的具体证据以本轮交付记录为准，编译成功不代表已完成真机或平台审核。

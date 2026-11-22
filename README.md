# Yonder Client

Yonder 的官方客户端：Web、macOS、Windows、Android 和 iOS。

微信小程序适配位于 [`apps/miniprogram`](apps/miniprogram/README.md)，使用独立的 Taro/React 依赖，共用现有协议和 API。当前供本机验证，尚未发布；构建、微信开发者工具导入和环境配置见该目录说明。

本仓库以 **GPL-3.0-only** 开源。你可以使用、修改和构建自己的客户端，也可以连接 Yonder 官方服务或兼容的自建服务。修改后公开分发的客户端需要遵守同一许可证并提供对应源代码。

Yonder 名称、标志、官方托管服务及官方签名安装包不由本许可证授权。官方发布由未至之境（武汉）科技有限公司管理。

## 使用官方服务

官方网页使用同源 API，**不需要填写服务器地址**。本源码构建的桌面和移动客户端默认连接 [yonderbot.net](https://yonderbot.net)；已发布的旧客户端仍连接 [yonder.zethai.cn](https://yonder.zethai.cn)。安装包仍可从[下载页](https://yonder.zethai.cn/download)获取。

iPhone 使用 [TestFlight 公测](https://testflight.apple.com/join/8C5Y9KHQ)。

## 从源码构建

需要 Node.js 22.19 或更高版本。

```bash
npm ci
npm run check
npm run build
```

开发 Web：

```bash
npm run dev:web
```

开发桌面壳：

```bash
npm run dev --prefix apps/desktop
```

本地开发通过 `YONDER_API_PROXY` 指定 Vite 代理目标，默认 `http://127.0.0.1:8090`。请勿将生产密钥写入源码、`.env` 或提交记录。

## 自建服务端

**服务端实现不在这个仓库。**这里只有客户端、协议类型和 API 调用层。自建时需要自行提供兼容的服务端。

桌面或移动客户端构建时指定服务端地址：

```bash
VITE_API_BASE=https://bot.example.com npm run build
npm run build --prefix apps/desktop
```

`VITE_API_BASE` 是**构建配置**，不是运行时用户设置。修改地址后应重新构建并使用新的客户端数据目录，避免把不同服务的会话和缓存混在一起。公网地址必须使用 HTTPS，不能包含用户名、密码或查询参数；本地开发允许 `localhost` 和 `127.0.0.1` 的 HTTP。

兼容服务端需要提供：

- `/v1` HTTP API 及同源实时 WebSocket；
- `/files` 上传文件访问；
- 对 Web 自建部署，合适的 CORS、Secure Cookie 与反向代理配置；最简单的办法是让 Web 和 API 同源。

未设置 `VITE_API_BASE` 时，官方行为不变：Web 同源，桌面/移动 Release 使用官方服务端。

## 仓库边界

公开：`apps/web`、`apps/desktop`、协议类型、API 客户端、UI、品牌资源和发布工具。

私有：账号、短信、邀请与额度业务、云端 Bot、模型供应商密钥与价格、生产数据库、部署配置和官方发布凭证。

## 验证

```bash
npm run check
npm run build
npx playwright install --with-deps chromium
npm run e2e
```

公开仓库的浏览器测试覆盖落地页、下载、协议和未登录导航，不需要私有云端或真实账号。私有服务端的完整数据库及云端端到端测试在私有仓库进行。

发布流程见 [docs/operations/release.md](docs/operations/release.md)。官方发布所需的签名和上传凭证只保存在 GitHub Actions secrets 中； fork 没有这些凭证时仍可进行普通构建和测试。

## 许可证

[GNU General Public License v3.0](LICENSE)。

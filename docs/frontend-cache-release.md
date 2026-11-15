# 前端缓存第一批

## 本批契约

本批以已提交的 main 为基础，保留现有 React、Vite、React Router、TanStack Query 和 Storage 分层，只调整代码加载与可重建查询快照的保存时机。

- 公开路由和 AppFrame 按需加载；任务、记忆和模型设置分别延迟加载。
- 加载失败限制在对应页面区域；切换路由可恢复错误区域，用户确认后才刷新页面，沿用既有草稿生命周期。
- 查询快照以一秒窗口合并，到实际保存时才序列化；持续更新仍定期写入。
- 退出、换号会取消排队写入；Provider 卸载保存最后快照，StrictMode 重新激活后可继续保存。
- 快照结构、缓存版本和 24 小时 maxAge 保持不变。浏览器突然关闭时，最后一秒尚未保存的服务器快照可能丢失，之后从服务器恢复。
- 不新增依赖或业务功能。本批不迁移 IndexedDB、不改变登录策略、不增加离线 Service Worker。

## 部署配套

生产配置来源在私有服务端仓库的 `deploy/nginx-yonder-web.conf` 和 `deploy/yonder-web-deploy`，对应提交 `460debce`。

HTML、SPA 回退、版本文件与现有 SW 脚本重新校验，保留 ETag / 304。内容 hash 资源保留一年 immutable，由共享 assets 目录提供；执行器在切换当前版本前保存本版资源，同名但内容不同会拒绝发布。旧 release 的回滚保留规则保持不变，共享资源不随旧 release 清理。

该配套已经单独完成生产配置语法检查和 HTTP 验证。每次应用发布后，仍应对发布前记录的旧资源逐项核对状态码、MIME 和 SHA-256，确认响应不是 SPA HTML；缺失 assets 应返回 404。

## 验证和发布

在固定提交的验证检出中运行项目既有检查，不使用持续变化的共享工作树打包：

```sh
npm ci
npm run check
npm run build -w @yonder/web -- --manifest
npx playwright test e2e/chunk-loading.spec.ts
```

浏览器测试隔离 API、WebSocket 和外部网络，检查公开入口不会请求受保护功能 chunk、进入功能时才加载、登录表单及聊天草稿在既有导航路径中保留。性能实测另用真实生产会话，只记录数值，不发送消息或采集聊天正文。

发布沿用 `docs/release.md` 的 CI、Release 和 Web deploy 流程，以线上版本及提交核对部署结果。共享工作树中的其他任务修改保留给后续提交。

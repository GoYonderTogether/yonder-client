# Yonder 客户端工作约定

这是公开客户端仓库，负责 Web、macOS、Windows、Android、iOS。

- 当前唯一主线是 `main`；不从旧 worktree 或 `~/Archive` 复制实现。
- 前端交互、页面细节、下载、更新和四端壳都在这里改。
- 云端业务、数据库、模型密钥、生产环境配置在私有 `~/Documents/yonder/yonder`，不要移入本仓库。
- 遵守 `docs/architecture.md` 和 `docs/design/`；分层、入口导入和文件长度检查必须通过。
- 页面不放不能交互的解释性文字，不放示例用户、示例消息、假模型或假数据。
- 每个用户可见文案都有 `zh-CN` 与 `en`，颜色、尺寸、圆角只用 tokens，图标使用 `lucide-react`。
- 不操作用户屏幕做验证；用单元测试、浏览器自动化、adb、隔离原生测试和 GitHub Actions。
- 发版前读取最新 `origin/main` 并快进同步，保留他人的并行修改。
- 完成改动跑 `npm run check`；原生更新功能可运行 `python3 scripts/desktop-updater-test/run.py`。

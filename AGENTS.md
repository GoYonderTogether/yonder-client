# Yonder 客户端工作约定

这是公开客户端仓库，负责 Web、macOS、Windows、Android、iOS。

- 当前唯一主线是 `main`；不从旧 worktree 或 `~/Archive` 复制实现。
- 前端交互、页面细节、下载、更新和四端壳都在这里改。
- 云端业务、数据库、模型密钥、生产环境配置在私有 `~/Documents/yonder/yonder`，不要移入本仓库。
- 遵守 `docs/architecture.md`；分层、入口导入和文件长度检查必须通过。一次性评审和验收报告不放进 `docs/`，放在仓库外 `~/Documents/yonder/reviews/`。
- 页面不放不能交互的解释性文字，不放示例用户、示例消息、假模型或假数据。
- 每个用户可见文案都有 `zh-CN` 与 `en`，颜色、尺寸、圆角只用 tokens，图标使用 `lucide-react`。
- 不操作用户屏幕做验证；用单元测试、浏览器自动化、adb、隔离原生测试和 GitHub Actions。
- 发版前读取最新 `origin/main` 并快进同步，保留他人的并行修改。
- 完成改动跑 `npm run check`；原生更新功能可运行 `python3 scripts/desktop-updater-test/run.py`。

## 多 Agent 并行开发

- `main` 是唯一集成分支。并行任务从最新 `origin/main` 建独立 worktree 和临时**本地**任务分支，例如：`git fetch origin main && git worktree add -b agent/<任务ID> ../<仓库>-<任务ID> origin/main`。不要在日常主目录切分支，不建 fork，不为常规任务推远端分支或开 PR。
- 开工先声明任务 ID、负责人和要改的目录或文件。共用文件、接口或迁移编号由一个任务负责，依赖任务排顺序。前后端配套改动用同一个任务 ID，并写明兼容顺序和联调结果。
- 本地先验证、再提交、最后汇报。只暂存自己负责的文件，检查 `git diff --cached`，不要 `git add -A`、覆盖别人的改动或重写远端历史。提交前把一个独立任务整理为一个提交；未完成代码只有在默认关闭且不引入不兼容变更时才可进 main。
- 在干净的任务 worktree 运行 `node scripts/agent-land.mjs -- sh -c 'npm ci && npm ci --prefix apps/miniprogram --no-audit --no-fund && npm run check'`（macOS/Linux）。它按同一仓库串行，将你的提交接到当前远端 main，在独立工作区验证组合结果，成功后普通快进推送。锁不跨克隆；远端先前进时不得强推，重新运行并验证。只在任务明确允许合入远端时运行。
- 冲突或组合测试失败由当前任务 Agent 负责。工具不改写你的任务分支；先在自己的 worktree 对齐最新 `origin/main`、解冲突或修失败测试，再重跑。不要回退其他任务来帮自己过关。暂不解决的任务保留本地分支及提交，不阻塞其他独立任务。
- 推送后报告：任务 ID｜远端提交链接｜验证结果｜待验收项。界面改动尽量附验证截图或预览链接。没有推上去就明确标记「未推送」，并给任务分支与提交 SHA。验证远端结果前保留任务目录和分支。
- 任务 Agent 不手动发版、不追同一个 CI 红灯。流水线/签名问题由发布负责人处理，业务问题由原任务负责人处理；交接后才换人，不并行修同一处。合入、CI 通过、产物可下载、生产上线是四个状态。

## 发版与测试（2026-11-24 起）

- 当前使用正式版号发出的都是开发测试版，不代表生产验收。先发版，完整 CI 在发布后异步反馈；开发迭代目标 3–5 分钟，不以各端分发完成为前提。
- 发版 Agent 触发后交给 Dot，不重复盯构建、部署或 CI。Dot 核验每个开发版的实际可用状态并通知 Zoran；iOS 只有确认该准确版本已能在 TestFlight 更新才通知，不把上传成功当作可更新。
- Dot 负责用最小改动修复 CI 和产品回归，不删减功能、不顺手重构。严重产品或功能冲突、需要设计取舍的问题交给 Zoran；Mac 上的 Claude/Codex Agent 负责新功能。
- 发版前在本机跑的测试最多 3 分钟（`npm run check` 这一类）。端到端测试、原生测试等更长的测试不在本机跑、不挡发版，交给 GitHub 的常规 CI 在发版后异步跑，CI 红了按 bug 修。
- 发版直接执行 `gh workflow run release.yml -R GoYonderTogether/yonder-client -f ref=main`，不加 `require_ci`，不等 CI。

## 预览与正式发版

- 预览按完整提交 SHA 构建并验证，保留上一个完整可验收版本。可把等待中的候选替换为较新提交；不要因每次推送而反复中断正在打包的预览。预览必须标注实际 SHA，不冒充最新 main。
- 预览下载、保留期限和签名边界见 [预览流程](docs/operations/internal-preview.md)。只有完整 CI 成功且该次产物仍存在才可验收。未正式签名、公证或验证更新链路的包，不能标为可自动更新；预览不写正式更新源、下载入口、TestFlight 或生产 Web。
- 正式发布使用当前远端 main 的完整快照，不择取单个改动；跨端协议变更必须用相配的前后端提交联调。

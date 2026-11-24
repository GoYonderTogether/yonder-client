# 标志资产

- 界面 Logo 直接叠在所在界面的背景上。白底和其他浅色底用 [黑色标志](assets/svg/yonder-mark-black.svg)，深色底用 [反白标志](assets/svg/yonder-mark-white.svg)。两个 SVG 的标志外都透明，几何源文件为 `src/yonder-mark.js`。
- 应用图标使用 [白色圆角底板版](assets/png/yonder-app-icon-1024.png)。黑色 Y 放在白色圆角底板内，底板外全透明。[系统裁切素材](assets/png/yonder-tile-ink-1024.png)由 iOS 打包流程读取，使用铺满的白底交给系统成形。

运行 `node brand/scripts/build.mjs` 可重建 `assets/`、`apps/web/public/` 和 Android 自适应启动器的前景图，需要 Playwright 和 Chrome（或 Playwright 浏览器）。[一起预览两种资产](assets/preview.html)。

# 标志资产

`src/yonder-mark.js` 保存选定标志的正形与反白几何。浅色底使用 `assets/svg/yonder-mark-black.svg`，深色底使用 `assets/svg/yonder-mark-white.svg`；`assets/svg/yonder-mark.svg` 为 `currentColor` 母版。名称尚未确定，不使用字标。

运行 `node brand/scripts/build.mjs` 可重建 `assets/` 和 `apps/web/public/` 的图标；需要已安装的 Playwright 和 Chrome（或 Playwright 浏览器）。`assets/preview.html` 可直接打开预览。16px 使用原始正形，通道可能压缩。

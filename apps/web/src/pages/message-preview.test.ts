import { expect, test } from "vitest";
import { messagePreview } from "./message-preview.ts";

test.each([
	["**重要提醒**：请看 [使用说明](https://example.org)", "重要提醒：请看 使用说明"],
	["# 标题\n\n- 第一项\n- **第二项**", "标题 第一项 第二项"],
	["| 项目 | 内容 |\n| --- | --- |\n| 一 | 二 |", "项目 内容 一 二"],
	["`inline`\n\n```js\nlet x = 1\n```", "inline let x = 1"],
	["前 ![图片](https://example.org/image.png) 后", "前 后"],
	["<script>alert(1)</script>\n\n原文", "<script>alert(1)</script> 原文"],
])("extracts plain text from Markdown", (body, expected) => {
	expect(messagePreview(body)).toBe(expected);
});

import { expect, test } from "vitest";
import { documentPreview, messagePreview } from "./message-preview.ts";

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

test.each([
	["", ""],
	["# 印象\n\n---\n\n![图片](https://example.org/image.png)", ""],
	["# 印象\n\n**先说结论**，再看[详情](https://example.org)。", "先说结论，再看详情。"],
	["<script>alert(1)</script>\n\n正文 <b>强调</b>", "正文"],
	["简".repeat(200), `${"简".repeat(180)}…`],
])("extracts a bounded document snippet without the title or raw markup", (body, expected) => {
	expect(documentPreview(body)).toBe(expected);
});

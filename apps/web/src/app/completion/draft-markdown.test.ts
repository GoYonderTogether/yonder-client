import { expect, test } from "vitest";
import { draftMarkdownMarks } from "./draft-markdown.ts";

test("draft preview marks only supported literal source ranges without parsing code", () => {
	const input = "# 标题 **重点**\r\n- 项目\n  2. 有序\n`**代码**`\n~~~js\n# 不是标题\n~~~\n__加粗__";
	const spans = draftMarkdownMarks(input).map(({ start, end, className }) => [input.slice(start, end), className]);
	expect(spans).toEqual([
		["#", "composer-draft-syntax"],
		["标题 **重点**\r", "composer-draft-heading"],
		["**", "composer-draft-syntax"],
		["重点", "composer-draft-strong"],
		["**", "composer-draft-syntax"],
		["-", "composer-draft-syntax"],
		["2.", "composer-draft-syntax"],
		["__", "composer-draft-syntax"],
		["加粗", "composer-draft-strong"],
		["__", "composer-draft-syntax"],
	]);
});

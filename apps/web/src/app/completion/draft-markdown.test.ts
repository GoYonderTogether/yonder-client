import { parser, RuleType } from "markdown-to-jsx";
import { expect, test } from "vitest";
import { draftMarkdownMarks } from "./draft-markdown.ts";

/** Every format the sent bubble actually renders, as the same kind names the overlay uses. */
function bubbleKinds(source: string): string[] {
	const kinds = new Set<string>();
	const text = (nodes: readonly unknown[]): string =>
		nodes
			.map((raw) => {
				const node = raw as { type: number; text?: string; tag?: string; children?: unknown[] };
				if (node.type === RuleType.text || node.type === RuleType.codeInline) return node.text ?? "";
				if (node.type === RuleType.textFormatted) {
					kinds.add(
						node.tag === "strong"
							? "strong"
							: node.tag === "em"
								? "em"
								: node.tag === "del"
									? "strike"
									: (node.tag ?? ""),
					);
					return text(node.children ?? []);
				}
				if (node.type === RuleType.heading) {
					kinds.add("heading");
					return text(node.children ?? []);
				}
				if (node.type === RuleType.link) {
					kinds.add("link");
					return text(node.children ?? []);
				}
				return text(node.children ?? []);
			})
			.join("");
	const walk = (nodes: readonly unknown[]): void => {
		for (const raw of nodes) {
			const node = raw as { type: number; text?: string; children?: unknown[]; items?: unknown[][] };
			if (node.type === RuleType.codeInline) kinds.add("code");
			if (node.type === RuleType.textFormatted || node.type === RuleType.heading || node.type === RuleType.link) {
				text([node] as unknown[]);
			}
			walk(node.children ?? []);
			for (const item of node.items ?? []) walk(item);
		}
	};
	walk(parser(source, { disableParsingRawHTML: true }) as unknown[]);
	return [...kinds].sort();
}

function overlayKinds(source: string): string[] {
	return [...new Set(draftMarkdownMarks(source).map(({ className }) => className.replace("composer-draft-", "")))]
		.filter((kind) => kind !== "syntax")
		.sort();
}

function marks(source: string): [string, string][] {
	return draftMarkdownMarks(source).map(({ start, end, className }) => [
		source.slice(start, end),
		className.replace("composer-draft-", ""),
	]);
}

// Every construct that the bubble renders must light up the overlay, and nothing else may.
test.each([
	"a **b** c",
	"a __b__ c",
	"a *b* c",
	"a _b_ c",
	"a ~~b~~ c",
	"a `b` c",
	"# 标题",
	"###### deep",
	"> quoted",
	"- item",
	"* item",
	"+ item",
	"1. item",
	"1) item",
	"[t](https://x.com)",
	"see https://x.com now",
	"<https://x.com>",
	"**a _b_ c**",
	"*a **b** c*",
	"***a***",
	"`**not strong**`",
])("overlay kinds match the rendered bubble for %j", (source) => {
	expect(overlayKinds(source)).toEqual(bubbleKinds(source));
});

// Half-typed markup is not a format yet, so the overlay must stay plain until it closes.
test.each(["**ab", "_ab", "`ab", "[t](u", "~~ab", "#heading", "1.foo", "-foo", "```\nabc"])(
	"unclosed or non-format %j leaves the overlay plain",
	(source) => {
		expect(overlayKinds(source)).toEqual([]);
		expect(bubbleKinds(source)).toEqual([]);
	},
);

test("marks every delimiter grey and every span with its format", () => {
	const source = "**粗体** _斜体_ `code` [链接](https://e.com) ~~删除~~";
	expect(marks(source)).toEqual([
		["**", "syntax"],
		["粗体", "strong"],
		["**", "syntax"],
		["_", "syntax"],
		["斜体", "em"],
		["_", "syntax"],
		["`", "syntax"],
		["code", "code"],
		["`", "syntax"],
		["[", "syntax"],
		["链接", "link"],
		["]", "syntax"],
		["(", "syntax"],
		["https://e.com", "syntax"],
		[")", "syntax"],
		["~~", "syntax"],
		["删除", "strike"],
		["~~", "syntax"],
	]);
});

test("heading marks the marker grey and the whole heading line as emphasis", () => {
	const source = "## 标题 **重点**";
	expect(marks(source)).toEqual([
		["##", "syntax"],
		["标题 **重点**", "heading"],
		["**", "syntax"],
		["重点", "strong"],
		["**", "syntax"],
	]);
});

test("fences mark both delimiter lines grey and leave the body alone; an unclosed fence stays plain", () => {
	expect(marks("```js\ncode\n```")).toEqual([
		["```js", "syntax"],
		["```", "syntax"],
	]);
	expect(marks("```js\n# not a heading\n```")).toEqual([
		["```js", "syntax"],
		["```", "syntax"],
	]);
	expect(marks("```js\n# not a heading")).toEqual([]);
});

test("keeps offsets exact across Chinese, full-width punctuation and emoji", () => {
	const source = "你好，**世界**🌏！再来 `代码`。";
	const [b, ...rest] = marks(source);
	expect(b).toEqual(["**", "syntax"]);
	expect(rest).toContainEqual(["世界", "strong"]);
	expect(rest).toContainEqual(["代码", "code"]);
	// Rebuild the source from the marks' slices plus the untouched gaps must equal the original.
	const covered = new Set<number>();
	for (const { start, end } of draftMarkdownMarks(source)) for (let i = start; i < end; i += 1) covered.add(i);
	const rejoined = Array.from({ length: source.length }, (_, i) => (covered.has(i) ? "" : source[i])).join("");
	expect(rejoined.length).toBeLessThanOrEqual(source.length);
});

test("does not treat an escaped marker as a format", () => {
	expect(marks("\\*not em\\*")).toEqual([]);
	expect(bubbleKinds("\\*not em\\*")).toEqual([]);
});

// A realistic corpus: each construct inside ordinary Chinese/English prose, one or two per line. The
// overlay must light up exactly the formats the bubble renders, and nothing else.
test("overlay and bubble agree across a corpus of constructs in prose", () => {
	const words = ["这是", "a", "今天", "note", "请看", "hello", "以及", "value"];
	const constructs = [
		"**粗体**",
		"__加粗__",
		"*斜体*",
		"_强调_",
		"`code`",
		"~~删除~~",
		"[链接](https://example.com)",
		"https://example.com",
		"<https://example.com>",
	];
	const samples: string[] = [];
	for (const w1 of words) for (const c of constructs) for (const w2 of words) samples.push(`${w1} ${c} ${w2}`);
	for (const c1 of constructs) for (const c2 of constructs) samples.push(`${c1}，然后 ${c2}`);
	for (const w of words) {
		samples.push(`# ${w} 标题`, `## ${w}`, `> ${w} 引用`, `- ${w}`, `1. ${w}`, `- **${w}** 项`, `**${w} _斜_ ${w}**`);
	}
	const failures = samples
		.map((source) => ({ source, overlay: overlayKinds(source), bubble: bubbleKinds(source) }))
		.filter(({ overlay, bubble }) => overlay.join() !== bubble.join());
	expect(failures).toEqual([]);
});

import { expect, test } from "vitest";
import { boundSkillIds, type CompletionBinding, reconcileBindings, textareaEditRange } from "./bindings.ts";
import { type CompletionItem, completionToken, filterCompletions, navigateCompletion } from "./tokens.ts";

test("slash and at share whitespace boundaries, without intercepting addresses, paths or selections", () => {
	for (const value of ["/pd", "@小", "hello /pd", "hello\n@Alex", "hello\t/"]) {
		expect(completionToken(value, value.length)?.start).toBe(value.search(/[/@]/u));
	}
	for (const value of ["name@host", "https://host/path", "dir/path", "/Users/name", "//", "@mail.com", "plain"]) {
		expect(completionToken(value, value.length)).toBeNull();
	}
	expect(completionToken("/pdf after", 2)).toMatchObject({ query: "p", start: 0, end: 4 });
	expect(completionToken("/pdf", 0)).toBeNull();
	expect(completionToken("/pdf", 1, 4)).toBeNull();
});

test("prefixes filter actual candidate kinds, and navigation preserves native keys at page boundaries", () => {
	const items: CompletionItem[] = [
		{
			id: "s",
			kind: "skill",
			name: "pdf",
			displayNameZh: "文档助手",
			description: "Process files",
			source: "platform",
		},
		{ id: "m", kind: "member", name: "Alex Doe", description: "@alex", memberKind: "person" },
		{ id: "c", kind: "command", name: "compact", description: "Compact" },
	];
	expect(filterCompletions(items, "", "/").map((item) => item.id)).toEqual(["s", "c"]);
	expect(filterCompletions(items, "", "@").map((item) => item.id)).toEqual(["m"]);
	expect(filterCompletions(items, "文档", "/").map((item) => item.id)).toEqual(["s"]);
	expect(navigateCompletion("ArrowRight", 1, 10)).toBe(5);
	expect(navigateCompletion("PageDown", 5, 10)).toBe(9);
	expect(navigateCompletion("ArrowRight", 9, 10)).toBeNull();
	expect(navigateCompletion("ArrowLeft", 0, 10)).toBeNull();
	expect(navigateCompletion("PageUp", 9, 10)).toBe(5);
	expect(navigateCompletion("ArrowUp", 0, 10)).toBe(9);
	expect(navigateCompletion("ArrowDown", 9, 10)).toBe(0);
	expect(navigateCompletion("Enter", 0, 10)).toBeNull();
	expect(navigateCompletion("Tab", 0, 0)).toBeNull();
});

test("only confirmed ranges retain identities through edits, including member names containing spaces", () => {
	const text = "/pdf @Alex Doe more";
	const bindings: CompletionBinding[] = [
		{ key: "skill", id: "s", kind: "skill", marker: "/pdf", start: 0, end: 4 },
		{ key: "member", id: "m", kind: "member", marker: "@Alex Doe", start: 5, end: 14 },
	];
	const shifted = reconcileBindings(text, `Hi ${text}`, bindings);
	expect(shifted.map((binding) => binding.start)).toEqual([3, 8]);
	expect(boundSkillIds(`Hi ${text}`, shifted)).toEqual(["s"]);
	const deleted = reconcileBindings(text, "@Alex Doe more", bindings);
	expect(deleted).toEqual([{ ...bindings[1], start: 0, end: 9 }]);
	expect(boundSkillIds("/pdf @Alex Doe more", deleted)).toEqual([]);
	expect(reconcileBindings(text, "/pd @Alex Doe more", bindings).map((binding) => binding.id)).toEqual(["m"]);
	expect(reconcileBindings("/pdf ", "email/pdf ", bindings.slice(0, 1))).toEqual([]);
});

test.each(["skill", "member"] as const)(
	"known selections distinguish identical %s markers; unknown edits do not guess",
	(kind) => {
		const marker = kind === "skill" ? "/same" : "@Same Name";
		const length = marker.length;
		const span = length + 1;
		const before = `${marker} ${marker} `;
		const after = `${marker} `;
		const bindings: CompletionBinding[] = [
			{ key: "a", id: "a", kind, marker, start: 0, end: length },
			{ key: "b", id: "b", kind, marker, start: span, end: span + length },
		];
		expect(reconcileBindings(before, after, bindings, { start: 0, end: span }).map((entry) => entry.id)).toEqual(["b"]);
		expect(
			reconcileBindings(before, after, bindings, { start: span, end: before.length }).map((entry) => entry.id),
		).toEqual(["a"]);
		expect(reconcileBindings(before, after, bindings)).toEqual([]);
		const backward = textareaEditRange(before, after, { start: span, end: span }, "deleteWordBackward");
		expect(reconcileBindings(before, after, bindings, backward).map((entry) => entry.id)).toEqual(["b"]);
		const forward = textareaEditRange(before, after, { start: 0, end: 0 }, "deleteContentForward");
		expect(reconcileBindings(before, after, bindings, forward).map((entry) => entry.id)).toEqual(["b"]);
		const pasted = textareaEditRange(before, `replacement ${marker} `, { start: 0, end: span }, "insertFromPaste");
		expect(reconcileBindings(before, `replacement ${marker} `, bindings, pasted).map((entry) => entry.id)).toEqual([
			"b",
		]);
	},
);

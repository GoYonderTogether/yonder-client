import type { Run } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { runSources } from "./run-sources.ts";

const run: Run = { id: "r", conversationId: "c", messageId: "m", userMessageId: "u", status: "completed" };

test("extracts real source metadata without modifying run records", () => {
	const source = { title: "A", url: "https://example.com/a", site: "Example" };
	const value = {
		...run,
		activity: [
			{ label: "Read", sources: [source] },
			{ label: "Read again", sources: [source, { ...source, title: "B" }] },
		],
	};
	const before = JSON.stringify(value);
	expect(runSources(value)).toEqual([source, { ...source, title: "B" }]);
	expect(JSON.stringify(value)).toBe(before);
	expect(runSources(null)).toEqual([]);
});

test("invalid or executable source URLs do not produce actionable entries", () => {
	const value = {
		...run,
		activity: [
			{
				label: "Search",
				sources: [
					"javascript:alert(1)",
					"invalid",
					"https://",
					"https:// /path",
					"https://example.com/\\path",
					"data:text/plain,test",
					"https://example.com",
				].map((url) => ({
					title: "Page",
					url,
				})),
			},
		],
	};
	expect(runSources(value).map((source) => source.url)).toEqual(["https://example.com"]);
});

test("keeps HTTPS sources when the mini-program runtime has no URL constructor", () => {
	vi.stubGlobal("URL", undefined);
	try {
		const source = { title: "Page", url: "https://example.com/path?q=1#section" };
		expect(runSources({ ...run, activity: [{ label: "Search", sources: [source] }] })).toEqual([source]);
	} finally {
		vi.unstubAllGlobals();
	}
});

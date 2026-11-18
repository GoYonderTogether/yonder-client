import type { MemoryFileSummary } from "@yonder/protocol";
import { describe, expect, test } from "vitest";
import { diffLines } from "./memory-diff.tsx";
import { groupFiles } from "./memory-file-list.tsx";
import { memoryFileRoute } from "./memory-navigation.ts";
import { measure, relativeTime } from "./memory-who.ts";

const summary = (path: string, updatedAt = "2026-11-18T00:00:00Z"): MemoryFileSummary => ({
	path,
	title: path.split("/").at(-1) ?? path,
	kind: "note",
	visibility: "private",
	updatedAt,
	updatedBy: "user",
	updatedByName: null,
	userEdited: false,
	draft: false,
});

describe("the file list", () => {
	test("groups by what files are, newest first, and leaves the /me files to 「了解」", () => {
		const groups = groupFiles(
			[
				summary("/me/印象.md"),
				summary("/notes/小林.md", "2026-11-17T00:00:00Z"),
				summary("/notes/项目.md", "2026-11-18T00:00:00Z"),
				summary("/sources/会议/2026-11-18-周会.md"),
				summary("/digests/week/2026-W47.md"),
				summary("/digests/day/2026-11-18.md"),
				summary("/public/资料.md"),
			],
			(key) => key,
		);
		expect(groups.map((group) => group.key)).toEqual([
			"notes",
			"sources:会议",
			"digests:day",
			"digests:week",
			"public",
		]);
		expect(groups[0]?.files.map((file) => file.path)).toEqual(["/notes/项目.md", "/notes/小林.md"]);
		expect(groups[1]?.title).toBe("会议");
	});
});

describe("routes", () => {
	test("the /me files open 「了解」; every other file has its own page", () => {
		expect(memoryFileRoute("/me/近期.md")).toBe("/memory/about");
		expect(memoryFileRoute("/notes/a b.md")).toBe(`/memory/files/${encodeURIComponent("/notes/a b.md")}`);
	});
});

describe("the editor count", () => {
	test("measures the way the server does", () => {
		expect(measure("你好😀", { length: 3000, unit: "characters" })).toBe(3);
		expect(measure("你好", { length: 65536, unit: "bytes" })).toBe(6);
	});
});

describe("the diff", () => {
	test("marks added and removed lines and keeps unchanged ones", () => {
		expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "added", text: "B" },
			{ kind: "removed", text: "b" },
			{ kind: "same", text: "c" },
			{ kind: "added", text: "d" },
		]);
	});
});

describe("relative time", () => {
	const now = new Date("2026-11-18T12:00:00Z");
	test("says just now, then minutes, hours and days, then a date", () => {
		expect(relativeTime("2026-11-18T11:59:30Z", now, "en", "just now")).toBe("just now");
		expect(relativeTime("2026-11-18T11:55:00Z", now, "en", "just now")).toBe("5 minutes ago");
		expect(relativeTime("2026-11-15T12:00:00Z", now, "en", "just now")).toBe("3 days ago");
		expect(relativeTime("2026-11-01T12:00:00Z", now, "en", "just now")).toBe("Nov 1");
	});
});

import type { MemoryFileSummary } from "@yonder/protocol";
import { describe, expect, test } from "vitest";
import { diffLines } from "./memory-diff.tsx";
import { groupFiles } from "./memory-file-list.tsx";
import { summarizeGroups } from "./memory-home.tsx";
import {
	archivedEntries,
	archivedFolderName,
	archivedOriginalPath,
	fileGroup,
	groupFolderPath,
	memoryFileParent,
	memoryFileRoute,
	memoryFolderNames,
	readMemoryView,
} from "./memory-view.ts";
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
	test("groups by what files are, newest first, and leaves the card's /me files out", () => {
		const groups = groupFiles(
			[
				summary("/me/impression.md"),
				summary("/notes/小林.md", "2026-11-17T00:00:00Z"),
				summary("/notes/项目.md", "2026-11-18T00:00:00Z"),
				summary("/sources/recordings/2026-11/18-周会.md"),
				summary("/digests/week/2026-W47.md"),
				summary("/digests/day/2026-11-18.md"),
				summary("/public/资料.md"),
			],
			(key) => key,
		);
		expect(groups.map((group) => group.key)).toEqual([
			"notes",
			"sources:recordings",
			"digests:day",
			"digests:week",
			"public",
		]);
		expect(groups[0]?.files.map((file) => file.path)).toEqual(["/notes/项目.md", "/notes/小林.md"]);
		expect(groups[1]?.title).toBe("recordings");
	});
});

describe("folder names come from the server", () => {
	test("each group names its own folder, and the server's name wins over the path", () => {
		expect(groupFolderPath("notes")).toBe("/notes");
		expect(groupFolderPath("sources:引入")).toBe("/sources/引入");
		expect(groupFolderPath("digests:day")).toBe("/digests/day");
		expect(groupFolderPath("archived")).toBe("/archive");
		expect(groupFolderPath("unknown")).toBeNull();

		// The server holds the system folders' names per language and the owner's own labels.
		const name = memoryFolderNames([
			{ path: "/notes", displayName: "Notes" },
			{ path: "/people", displayName: "People" },
			{ path: "/projects/", displayName: "手上的事" },
			{ path: "/sources", displayName: "Sources" },
			{ path: "/sources/引入", displayName: "引入" },
		]);
		expect(name("/notes")).toBe("Notes");
		expect(name("/projects/")).toBe("手上的事");
		// A folder the server has not named yet still reads by its last segment.
		expect(name("/notes/项目")).toBe("项目");

		// A group's files keep the server's headings rather than a key the app used to translate.
		const groups = groupFiles([summary("/notes/a.md"), summary("/sources/引入/b.md")], (key) => key, name);
		expect(groups.map((group) => group.heading)).toEqual(["Notes", "Sources"]);
		expect(groups[1]?.title).toBe("引入");

		// An archived folder is named by the live folder it came from.
		expect(archivedFolderName("notes", name)).toBe("Notes");
	});
});

describe("routes", () => {
	test("every file has its own page; back goes to its group, AI profile files back to the private overview", () => {
		expect(memoryFileRoute("/notes/a b.md")).toBe(`/memory/files/${encodeURIComponent("/notes/a b.md")}`);
		expect(memoryFileParent("/sources/recordings/x.md")).toBe(`/memory/g/${encodeURIComponent("sources:recordings")}`);
		expect(memoryFileParent("/me/recent.md")).toBe("/memory/about");
		expect(fileGroup("/me/impression.md")).toBeNull();
	});

	test("the URL names the view", () => {
		expect(readMemoryView(null, null)).toEqual({ kind: "home" });
		expect(readMemoryView("timeline", null)).toEqual({ kind: "timeline" });
		expect(readMemoryView("g", "notes")).toEqual({ kind: "group", group: "notes" });
		expect(readMemoryView("files", "/notes/a.md")).toEqual({ kind: "file", path: "/notes/a.md" });
		expect(readMemoryView("about", null)).toEqual({ kind: "about" });
	});
});

describe("the home's groups", () => {
	test("count files and drafts per group, in a fixed order, with the card's files left out", () => {
		const draft = { ...summary("/public/草稿.md"), draft: true };
		expect(
			summarizeGroups([
				summary("/me/impression.md"),
				summary("/public/资料.md"),
				draft,
				summary("/sources/recordings/a.md"),
				summary("/notes/a.md"),
				summary("/digests/day/2026-11-18.md"),
			]),
		).toEqual([
			{ group: "notes", files: 1, drafts: 0 },
			{ group: "sources:recordings", files: 1, drafts: 0 },
			{ group: "digests", files: 1, drafts: 0 },
			{ group: "public", files: 2, drafts: 1 },
		]);
	});
});

describe("archived files", () => {
	test("form their own group last, and are kept out of notes, sources, summaries and public", () => {
		const groups = groupFiles(
			[
				summary("/notes/活着的.md"),
				summary("/archive/notes/旧笔记.md"),
				summary("/archive/sources/recordings/旧会议.md"),
				summary("/archive/public/旧资料.md"),
			],
			(key) => key,
		);
		expect(groups.map((group) => group.key)).toEqual(["notes", "archived"]);
		expect(groups[0]?.files.map((file) => file.path)).toEqual(["/notes/活着的.md"]);
		expect(groups[1]?.files.map((file) => file.path)).toEqual([
			"/archive/notes/旧笔记.md",
			"/archive/sources/recordings/旧会议.md",
			"/archive/public/旧资料.md",
		]);
	});

	test("a file under /archive belongs to the archived group, keeps its original path, and goes back there", () => {
		expect(fileGroup("/archive/notes/a.md")).toBe("archived");
		expect(archivedOriginalPath("/archive/notes/a.md")).toBe("/notes/a.md");
		expect(archivedOriginalPath("/notes/a.md")).toBeNull();
		expect(memoryFileParent("/archive/projects/a.md")).toBe(`/memory/g/${encodeURIComponent("archived/projects")}`);
	});

	test("the folded list shows the folders it came from and the files archived from the root", () => {
		expect(
			archivedEntries([
				summary("/archive/notes/a.md"),
				summary("/archive/sources/recordings/b.md"),
				summary("/archive/notes/c.md", "2026-11-19T00:00:00Z"),
				summary("/archive/根文件.md"),
				summary("/notes/live.md"),
			]),
		).toEqual({
			folders: ["notes", "sources"],
			files: [expect.objectContaining({ path: "/archive/根文件.md" })],
		});
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

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { MemoryFileContent, MemoryFileSummary } from "@yonder/protocol";
import { createMemoryStorage, DataProvider } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { type ReactNode, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { ArchivedGroup } from "./memory-archive.tsx";
import { MemoryFilePage } from "./memory-file.tsx";

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

const content = (file: MemoryFileSummary, body = "正文"): MemoryFileContent => ({
	...file,
	content: body,
	version: 1,
	sources: [],
	limit: { length: 65536, unit: "bytes" },
	links: [],
});

/**
 * The folder names the server gives (D1): system folders in the reader's language, and a folder the
 * owner made under its own name. The app never writes these down; it reads them from here.
 */
const FOLDER_NAMES: Record<string, string> = {
	"/notes": "Notes",
	"/sources": "Sources",
	"/sources/会议": "会议",
	"/digests": "Summaries",
	"/public": "Public",
	"/archive": "Archived",
	"/people": "People",
	"/projects": "Projects",
};

/** A tiny server: the file list, each file's content, the folder names, `/me`, and a move's answer. */
function serve(files: MemoryFileSummary[], options: { move?: (body: unknown) => Response } = {}) {
	return vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
		const target = new URL(url);
		if (target.pathname === "/v1/auth/refresh") return Response.json({ accessToken: "archived-memory-test" });
		if (target.pathname === "/v1/me") return Response.json({ member: { id: "person" }, bot: { id: "bot" } });
		if (target.pathname === "/v1/memory/files") return Response.json({ items: files, folders: [] });
		if (target.pathname === "/v1/memory/folders")
			return Response.json({
				items: Object.entries(FOLDER_NAMES).map(([path, displayName]) => ({ path, displayName })),
			});
		if (target.pathname === "/v1/memory/files/move" && init.method === "POST") {
			return options.move ? options.move(JSON.parse(String(init.body))) : Response.json({ ok: true });
		}
		if (target.pathname === "/v1/memory/files/content" && init.method !== "PUT") {
			const path = target.searchParams.get("path") ?? "";
			const found = files.find((file) => file.path === path);
			if (found) return Response.json(content(found));
			return Response.json({ code: "not_found", message: "not found" }, { status: 404 });
		}
		return Response.json({ ok: true });
	});
}

let path = "";
function Where() {
	const location = useLocation();
	useEffect(() => {
		path = location.pathname;
	}, [location.pathname]);
	return null;
}

function show(children: ReactNode, at = "/memory") {
	return render(
		<DataProvider baseUrl="http://memory.test" appVersion="test" clientKind="web" storage={createMemoryStorage()}>
			<I18nextProvider i18n={createI18n("en")}>
				<MemoryRouter initialEntries={[at]}>
					{children}
					<Where />
				</MemoryRouter>
			</I18nextProvider>
		</DataProvider>,
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	path = "";
});

test("the archived group is folded, exists only while something is archived, and opens its files", async () => {
	serve([
		summary("/archive/notes/旧笔记.md"),
		summary("/archive/sources/会议.md"),
		summary("/archive/根文件.md"),
		summary("/notes/live.md"),
	]);
	show(<ArchivedGroup />);
	const toggle = await screen.findByRole("button", { name: "Archived" });
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	// Folded: nothing inside is drawn until it opens.
	expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
	expect(screen.queryByRole("button", { name: "旧笔记.md" })).toBeNull();
	toggle.click();
	const notes = await screen.findByRole("button", { name: "Notes" });
	expect(notes).toBeVisible();
	expect(screen.getByRole("button", { name: "Sources" })).toBeVisible();
	// A file archived straight from the root has no folder and is a row itself.
	expect(screen.getByRole("button", { name: /根文件\.md/ })).toBeVisible();
	// A folder keeps the original path it was archived from.
	notes.click();
	await waitFor(() => expect(path).toBe(`/memory/g/${encodeURIComponent("archived/notes")}`));
});

test("a file archived from the root opens on its own page rather than in the side panel", async () => {
	serve([summary("/archive/根文件.md"), summary("/notes/live.md")]);
	show(<ArchivedGroup />);
	(await screen.findByRole("button", { name: "Archived" })).click();
	const file = await screen.findByRole("button", { name: /根文件\.md/ });
	file.click();
	await waitFor(() => expect(decodeURIComponent(path)).toBe("/memory/files//archive/根文件.md"));
});

test("an empty archive draws nothing", async () => {
	serve([summary("/notes/live.md")]);
	const { container } = show(<ArchivedGroup />);
	await screen.findByRole("button", { name: "Archived" }).catch(() => undefined);
	// Give the query a moment to settle, then the group must not exist.
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(screen.queryByRole("button", { name: "Archived" })).toBeNull();
	expect(container.querySelector("section")).toBeNull();
});

test("an archived file reads read-only: its content, its author, and no edit, delete or visibility", async () => {
	const archived = summary("/archive/notes/旧笔记.md");
	serve([archived]);
	show(<MemoryFilePage path={archived.path} onDeleted={() => undefined} />);
	const article = await screen.findByRole("heading", { name: "旧笔记.md" });
	expect(screen.getByText("正文")).toBeVisible();
	expect(screen.getByText(/Updated by/)).toBeVisible();
	// Archiving is the reversible way to put content away; its page shows nothing that changes it.
	expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	expect(screen.queryByRole("button", { name: /Visibility/ })).toBeNull();
	expect(within(article.closest("article") as HTMLElement).queryByRole("img", { name: /Public|Secret/ })).toBeNull();
});

test("restore moves the file back to the path it was archived from, then opens it there", async () => {
	const archived = summary("/archive/notes/旧笔记.md");
	const moves: unknown[] = [];
	serve([archived], {
		move: (body) => {
			moves.push(body);
			return Response.json({ ok: true });
		},
	});
	show(<MemoryFilePage path={archived.path} onDeleted={() => undefined} />);
	// One action, and it is the reversible one.
	await screen.findByRole("heading", { name: "旧笔记.md" });
	const restore = screen.getByRole("button", { name: "Restore" });
	expect(screen.queryAllByRole("button")).toHaveLength(1);
	restore.click();
	await waitFor(() => expect(moves).toEqual([{ from: "/archive/notes/旧笔记.md", to: "/notes/旧笔记.md" }]));
	await waitFor(() => expect(decodeURIComponent(path)).toBe("/memory/files//notes/旧笔记.md"));
});

test("a restore the server refuses with 409 says a file already exists at the original path", async () => {
	const archived = summary("/archive/notes/旧笔记.md");
	serve([archived], {
		move: () =>
			Response.json(
				{
					error: {
						code: "conflict_version",
						message: "memory move refused: exists",
						messageKey: "errors.conflict_version",
						requestId: "req",
						traceId: "trace",
					},
				},
				{ status: 409 },
			),
	});
	show(<MemoryFilePage path={archived.path} onDeleted={() => undefined} />);
	await screen.findByRole("heading", { name: "旧笔记.md" });
	screen.getByRole("button", { name: "Restore" }).click();
	const alert = await screen.findByRole("alert");
	expect(alert).toHaveTextContent("A file already exists at the original path");
	expect(path).toBe("/memory");
});

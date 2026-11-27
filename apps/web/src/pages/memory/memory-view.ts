import type { MemoryFileSummary, MemoryFolderSummary } from "@yonder/protocol";

/**
 * What the memory tab shows, read from the URL (24 第二节, 11-19 layout): the home (private profile entry, recent,
 * all groups), the whole timeline, one group of files, or one file. Kept free of React and data so
 * the frame can read it without loading the memory page.
 */
export type MemoryView =
	| { kind: "home" }
	| { kind: "timeline" }
	| { kind: "about" }
	| { kind: "group"; group: string; directory?: string }
	| { kind: "file"; path: string };

export const ABOUT_PATHS = ["/me/impression.md", "/me/recent.md", "/me/profile.md"] as const;
export const MEMORY_ABOUT_PATH = "/memory/about";

export function isAboutMemoryFile(path: string): boolean {
	return ABOUT_PATHS.some((candidate) => candidate === path);
}

export function readMemoryView(selection: string | null, sub: string | null): MemoryView {
	if (selection === "about" && !sub) return { kind: "about" };
	if (selection === "timeline") return { kind: "timeline" };
	if (selection === "g" && sub) {
		const [group, ...folders] = sub.split("/");
		if (group) return { kind: "group", group, ...(folders.length ? { directory: folders.join("/") } : {}) };
	}
	if (selection === "files" && sub) return { kind: "file", path: sub };
	return { kind: "home" };
}

/**
 * Archived files live under this prefix with their original path kept, so `/notes/a.md` becomes
 * `/archive/notes/a.md` and comes back by dropping the prefix (WAVE2 2026-11-25 §2).
 */
export const MEMORY_ARCHIVE_PREFIX = "/archive/";

export function isArchivedMemoryFile(path: string): boolean {
	return path.startsWith(MEMORY_ARCHIVE_PREFIX);
}

/**
 * The group a file belongs to: notes, one group per connector folder, summaries, public, or the
 * archived files under `/archive/`. The two `/me` private files sit under the AI profile and belong
 * to no group.
 */
export function fileGroup(path: string): string | null {
	if (isArchivedMemoryFile(path)) return "archived";
	if (path.startsWith("/notes/")) return "notes";
	if (path.startsWith("/digests/")) return "digests";
	if (path.startsWith("/public/")) return "public";
	const source = /^\/sources\/([^/]+)\//.exec(path)?.[1];
	return source ? `sources:${source}` : null;
}

export function isInlineMemoryGroup(group: string): boolean {
	return group === "notes" || group === "digests" || group === "sources:recordings";
}

export function showsMemoryBack(view: MemoryView): boolean {
	if (view.kind === "group" && !view.directory) return false;
	const group = view.kind === "group" ? view.group : view.kind === "file" ? fileGroup(view.path) : null;
	return group !== null && isInlineMemoryGroup(group);
}

export function groupPrefix(group: string): string | null {
	if (group === "archived") return MEMORY_ARCHIVE_PREFIX;
	if (group === "notes" || group === "digests" || group === "public") return `/${group}/`;
	return group.startsWith("sources:") ? `/sources/${group.slice("sources:".length)}/` : null;
}

/** What an archived file's path was before it was archived, e.g. `/notes/a.md` for `/archive/notes/a.md`. */
export function archivedOriginalPath(path: string): string | null {
	if (!isArchivedMemoryFile(path)) return null;
	const original = path.slice(MEMORY_ARCHIVE_PREFIX.length - 1);
	return original === "/" ? null : original;
}

/** How an archived folder is named: the live folder it came from keeps the name it has elsewhere. */
export function archivedFolderName(folder: string, folderName: (path: string) => string): string {
	return folderName(`/${folder}`);
}

/**
 * The archived part of the file list: the folders it was archived from, mirroring the original path
 * (a note at `/notes/a.md` is archived at `/archive/notes/a.md`), then files archived from the
 * space's own root. Newest first.
 */
export function archivedEntries(files: readonly MemoryFileSummary[]): {
	folders: string[];
	files: MemoryFileSummary[];
} {
	const folders = new Set<string>();
	const root: MemoryFileSummary[] = [];
	for (const file of files) {
		if (!isArchivedMemoryFile(file.path)) continue;
		const [name, ...rest] = file.path.slice(MEMORY_ARCHIVE_PREFIX.length).split("/");
		if (name && rest.length) folders.add(name);
		else root.push(file);
	}
	return {
		folders: [...folders].toSorted((a, b) => a.localeCompare(b)),
		files: root.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
	};
}

export const memoryGroupRoute = (group: string) => `/memory/g/${encodeURIComponent(group)}`;
export const memoryFileRoute = (path: string) => `/memory/files/${encodeURIComponent(path)}`;
export const memoryFolderRoute = (group: string, directory: string) => memoryGroupRoute(`${group}/${directory}`);

export function memoryFileParent(path: string): string {
	if (isAboutMemoryFile(path)) return MEMORY_ABOUT_PATH;
	const group = fileGroup(path);
	if (!group) return "/memory";
	const prefix = groupPrefix(group);
	const directory = prefix && path.slice(prefix.length, path.lastIndexOf("/"));
	return directory && group !== "digests" ? memoryFolderRoute(group, directory) : memoryGroupRoute(group);
}

/** Direct links, app Back and Escape follow the visible directory levels. */
export function memoryDetailParent([selection, value]: readonly string[]): string {
	if (selection === "files" && value) return memoryFileParent(value);
	const separator = selection === "g" && value ? value.lastIndexOf("/") : -1;
	return separator >= 0 && value ? memoryGroupRoute(value.slice(0, separator)) : "/memory";
}

/**
 * The folder a group's files live in (D1, README 2026-11-25 第 6.2 节). A group names a folder and
 * its name comes from the server, never from a string here: `notes` is `/notes`, `sources:meeting`
 * is `/sources/meeting`, `digests:day` is `/digests/day`.
 */
export function groupFolderPath(group: string): string | null {
	if (group === "archived") return MEMORY_ARCHIVE_PREFIX.replace(/\/$/u, "");
	if (group === "notes" || group === "digests" || group === "public") return `/${group}`;
	if (group.startsWith("digests:")) return `/digests/${group.slice("digests:".length)}`;
	return group.startsWith("sources:") ? `/sources/${group.slice("sources:".length)}` : null;
}

/** A path's own last segment, for a folder the server has not named (it always names its system ones). */
export function pathLastSegment(path: string): string {
	const trimmed = path.replace(/\/+$/u, "");
	return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
}

/**
 * The names the server gave each folder, as a lookup: the memory page reads every heading from it so
 * a system folder reads in the owner's language and a renamed one keeps their word.
 */
export function memoryFolderNames(folders: readonly MemoryFolderSummary[]): (path: string) => string {
	const names = new Map(folders.map(({ path, displayName }) => [path.replace(/\/+$/u, "") || "/", displayName]));
	return (path) => names.get(path.replace(/\/+$/u, "") || "/") ?? pathLastSegment(path);
}

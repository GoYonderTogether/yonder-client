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

export const ABOUT_PATHS = ["/me/印象.md", "/me/近期.md", "/me/画像.md"] as const;
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
 * The group a file belongs to: notes, one group per connector folder, summaries, public. The two
 * `/me` private files sit under the AI profile and belong to no group.
 */
export function fileGroup(path: string): string | null {
	if (path.startsWith("/notes/")) return "notes";
	if (path.startsWith("/digests/")) return "digests";
	if (path.startsWith("/public/")) return "public";
	const source = /^\/sources\/([^/]+)\//.exec(path)?.[1];
	return source ? `sources:${source}` : null;
}

export function groupPrefix(group: string): string | null {
	if (group === "notes" || group === "digests" || group === "public") return `/${group}/`;
	return group.startsWith("sources:") ? `/sources/${group.slice("sources:".length)}/` : null;
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

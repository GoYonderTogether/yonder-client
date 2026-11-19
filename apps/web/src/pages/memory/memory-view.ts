/**
 * What the memory tab shows, read from the URL (24 第二节, 11-19 layout): the home (card, recent,
 * all groups), the whole timeline, one group of files, or one file. Kept free of React and data so
 * the frame can read it without loading the memory page.
 */
export type MemoryView =
	| { kind: "home" }
	| { kind: "timeline" }
	| { kind: "group"; group: string }
	| { kind: "file"; path: string };

export function readMemoryView(selection: string | null, sub: string | null): MemoryView {
	if (selection === "timeline") return { kind: "timeline" };
	if (selection === "g" && sub) return { kind: "group", group: sub };
	if (selection === "files" && sub) return { kind: "file", path: sub };
	return { kind: "home" };
}

/**
 * The group a file belongs to: notes, one group per connector folder, summaries, public. The two
 * `/me` files sit on the back of the card and belong to no group.
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

/** Where back from a file goes: its group, or the home for the card's own two files. */
export function memoryFileParent(path: string): string {
	const group = fileGroup(path);
	return group ? memoryGroupRoute(group) : "/memory";
}

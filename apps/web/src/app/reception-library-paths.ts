import type { MemoryFolderSummary, SocialLibraryFolder } from "@yonder/protocol";
import { useMemoryFolders } from "@yonder/ui-data";
import { memoryFolderNames, pathLastSegment } from "../pages/memory/memory-view.ts";
import { receptionSettingsPath } from "./settings-navigation.ts";

/**
 * What a folder is called on the reception page (D1, README 2026-11-25 第 6.2 节). The name comes
 * from the server — a system folder's own name in the owner's language, or the owner's own label —
 * and a folder the owner made keeps the name it was given, which is the library's own `name`.
 */
export function receptionFolderLabel(folder: SocialLibraryFolder, folderName: (path: string) => string): string {
	return folder.path ? folderName(folder.path) : folder.name;
}

/** The folder names a page needs, from the memory folder list. */
export function receptionFolderNames(folders: readonly MemoryFolderSummary[] | undefined) {
	return memoryFolderNames(folders ?? []);
}

/**
 * The reception page's one way to read a folder's name. A folder it shows always has a path (the
 * library is built from file paths), and the server has named every folder a file sits in; a folder
 * with no path yet, or one the list has not reached, keeps the library's own name.
 */
export function useReceptionFolderName(): (folder: SocialLibraryFolder) => string {
	const folders = useMemoryFolders();
	const name = memoryFolderNames(folders.data?.items ?? []);
	return (folder) => (folder.path ? name(folder.path) : folder.name || pathLastSegment(folder.id));
}

export function receptionWritablePath(path: string | undefined): boolean {
	return !path || path === "/notes" || path.startsWith("/notes/") || path.startsWith("/public/");
}

export function receptionFolderTrail(folders: readonly SocialLibraryFolder[], id: string | null | undefined) {
	const trail: SocialLibraryFolder[] = [];
	const visited = new Set<string>();
	while (id && !visited.has(id)) {
		visited.add(id);
		const folder = folders.find((item) => item.id === id);
		if (!folder) break;
		trail.unshift(folder);
		id = folder.parentFolderId;
	}
	return trail;
}

export function receptionFolderPath(trail: readonly SocialLibraryFolder[], documentId?: string) {
	const segments = trail.flatMap(({ id }) => ["folder", id]);
	return receptionSettingsPath(
		...segments,
		...(documentId ? [...(segments.length ? [] : ["document"]), documentId] : []),
	);
}

import type { SocialLibraryFolder } from "@yonder/protocol";
import { receptionSettingsPath } from "./settings-navigation.ts";

export function receptionFolderLabel(folder: SocialLibraryFolder, t: (key: string) => string): string {
	switch (folder.path) {
		case "/notes":
			return t("memory.notesFolder");
		case "/sources":
			return t("memory.sourcesFolder");
		case "/digests":
			return t("memory.digestsFolder");
		case "/me":
			return t("memory.aboutMe");
		default:
			return folder.name;
	}
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

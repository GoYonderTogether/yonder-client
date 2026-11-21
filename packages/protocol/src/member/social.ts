export interface SocialLibraryFolder {
	id: string;
	path?: string;
	name: string;
	parentFolderId: string | null;
}

export interface SocialLibraryDocument {
	id: string;
	path?: string;
	folderId: string | null;
	title: string;
	content: string;
	updatedAt: string;
}

export interface SocialLibraryDraft {
	id: string;
	path?: string;
	folderId?: string | null;
	content: string;
	createdAt: string;
}

export interface SocialLibrary {
	folders: SocialLibraryFolder[];
	documents: SocialLibraryDocument[];
	drafts: SocialLibraryDraft[];
}

export type SocialLibraryChange =
	| { kind: "save_folder"; id?: string; name: string; parentFolderId?: string | null }
	| { kind: "remove_folder"; id: string }
	| { kind: "save_document"; id?: string; folderId: string | null; title: string; content: string }
	| { kind: "remove_document"; id: string }
	| { kind: "review_draft"; id: string; approve: true; folderId: string | null; title: string }
	| { kind: "review_draft"; id: string; approve: false };

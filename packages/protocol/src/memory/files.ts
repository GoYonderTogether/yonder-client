import type { Timestamp } from "../common/error.ts";
import type { MemoryVisibility } from "./memory.ts";

export type MemoryFileKind =
	| "impression"
	| "recent"
	| "profile"
	| "proactive"
	| "note"
	| "archive"
	| "digest"
	| "public";

/**
 * Who last wrote a file, as stored: `user`, `system`, `router`, `bot:<memberId>`,
 * `checkpoint:<runId>`, `digest:<runId>` (23 第七节).
 */
export type MemoryFileAuthor = string;

export interface MemoryFileSummary {
	path: string;
	title: string;
	kind: MemoryFileKind;
	visibility: MemoryVisibility;
	updatedAt: Timestamp;
	updatedBy: MemoryFileAuthor;
	/**
	 * The writer's display name (23 §18): the Bot's for `bot:`, the main Bot's for `checkpoint:` and
	 * `digest:`, the connector's for `router`; null for `user` and `system`.
	 */
	updatedByName: string | null;
	/** The owner edited it by hand; Bots may only append until the owner lifts this. */
	userEdited: boolean;
	/** A Bot wrote it under `/public` and the owner has not published it yet. */
	draft: boolean;
}

/** One event a file was written from, with where it can be opened. */
export interface MemoryFileSource {
	eventId: string;
	/** The connector id: `chat`, `subtask`, `schedule`, `meeting`, … */
	connector: string;
	title: string;
	conversationId?: string;
	meetingId?: string;
	itemId?: string;
}

/**
 * The longest body the server accepts for this file (23 7.5): characters for the two `/me` files,
 * which go into every turn, and bytes for the rest. The editor shows it while the owner types.
 */
export interface MemoryFileLimit {
	length: number;
	unit: "characters" | "bytes";
}

/**
 * One folder in the file space, as the list names it (D1, README 2026-11-25 第 6.2 节): the path a
 * tool takes and the name the owner reads. The server decides the name — a system folder's own
 * name in the owner's language, or the name the owner gave it — so the app never writes one down.
 */
export interface MemoryFolderSummary {
	/** The folder path without a trailing slash, e.g. `/people` or `/notes/photos/2026-11`. */
	path: string;
	/** The name to show: an owner label, a system name in the owner's language, or the last segment. */
	displayName: string;
}

/** GET /v1/memory/files */
export interface MemoryFileList {
	items: MemoryFileSummary[];
	/**
	 * Every folder the items sit in, with its display name. A folder under `/archive` keeps its
	 * original path's name, so the archived list reads the way the live one did.
	 */
	folders: MemoryFolderSummary[];
}

/**
 * GET /v1/memory/folders — every folder the account knows, live and archived, for a client that
 * shows a folder before a file in it exists. A client with the file list already has the same
 * names for the folders its files sit in.
 */
export interface MemoryFolderList {
	items: MemoryFolderSummary[];
}

/** GET /v1/memory/files/content */
export interface MemoryFileContent extends MemoryFileSummary {
	content: string;
	version: number;
	sources: MemoryFileSource[];
	limit: MemoryFileLimit;
	/** Resolved absolute memory paths linked from the Markdown. */
	links: string[];
	/** Preserve relative links when a file has been moved to a different directory. */
	linkBasePath?: string;
}

export interface MemoryFileRevision {
	version: number;
	content: string;
	by: string;
	at: Timestamp;
}

/** GET /v1/memory/files/revisions */
export interface MemoryFileRevisionList {
	items: MemoryFileRevision[];
}

/** PUT /v1/memory/files/content */
export interface UpdateMemoryFileRequest {
	path: string;
	content: string;
	expectedVersion: number;
}

/** PATCH /v1/memory/files/visibility */
export interface UpdateMemoryFileVisibilityRequest {
	path: string;
	visibility: MemoryVisibility;
}

/** PATCH /v1/memory/files/protection: lift 「你改过」 so Bots may rewrite the file again. */
export interface UpdateMemoryFileProtectionRequest {
	path: string;
	userEdited: false;
}

/** POST /v1/memory/files/move: one file, or one folder prefix. */
export interface MoveMemoryFileRequest {
	from: string;
	to: string;
}

/** POST /v1/memory/files/revert */
export interface RevertMemoryFileRequest {
	path: string;
	/** The version whose content to restore. */
	version: number;
}

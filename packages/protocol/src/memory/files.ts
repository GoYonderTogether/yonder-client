import type { Timestamp } from "../common/error.ts";
import type { MemoryVisibility } from "./memory.ts";

export type MemoryFileKind = "impression" | "recent" | "note" | "archive" | "digest" | "public";

export interface MemoryFileSummary {
	path: string;
	title: string;
	kind: MemoryFileKind;
	visibility: MemoryVisibility;
	updatedAt: Timestamp;
	userEdited: boolean;
}

/** GET /v1/memory/files */
export interface MemoryFileList {
	items: MemoryFileSummary[];
}

/** GET /v1/memory/files/content */
export interface MemoryFileContent extends MemoryFileSummary {
	content: string;
	version: number;
	/** IDs of the events this file cites. */
	sources: string[];
	/** Resolved absolute memory paths linked from the Markdown. */
	links: string[];
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

/** POST /v1/memory/files/revert */
export interface RevertMemoryFileRequest {
	path: string;
	/** The version whose content to restore. */
	version: number;
}

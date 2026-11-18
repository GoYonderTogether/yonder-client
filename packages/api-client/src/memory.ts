import type {
	MemoryDayPage,
	MemoryEntry,
	MemoryFileContent,
	MemoryFileList,
	MemoryFileRevisionList,
	RevertMemoryFileRequest,
	UpdateMemoryFileRequest,
	UpdateMemoryFileVisibilityRequest,
	UpdateMemoryRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

const filesPath = "/v1/memory/files";

export function memoryEndpoints(client: ApiClient) {
	return {
		/**
		 * Newest days first; pass the previous page's `nextCursor` for older days. `timeZone` is the
		 * device's IANA zone, which decides which calendar day an event belongs to.
		 */
		memoryDays(cursor?: string, timeZone?: string): Promise<MemoryDayPage> {
			const query: string[] = [];
			if (cursor) query.push(`cursor=${encodeURIComponent(cursor)}`);
			if (timeZone) query.push(`tz=${encodeURIComponent(timeZone)}`);
			const search = query.join("&");
			return client.request(`/v1/memory/days${search ? `?${search}` : ""}`);
		},
		updateMemory(id: string, patch: UpdateMemoryRequest): Promise<MemoryEntry> {
			return client.request(`/v1/memory/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
		},
		deleteMemory(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/memory/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
		memoryFiles(prefix?: string): Promise<MemoryFileList> {
			return client.request(prefix ? `${filesPath}?prefix=${encodeURIComponent(prefix)}` : filesPath);
		},
		memoryFile(path: string): Promise<MemoryFileContent> {
			return client.request(`${filesPath}/content?path=${encodeURIComponent(path)}`);
		},
		updateMemoryFile(body: UpdateMemoryFileRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/content`, { method: "PUT", body });
		},
		updateMemoryFileVisibility(body: UpdateMemoryFileVisibilityRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/visibility`, { method: "PATCH", body });
		},
		deleteMemoryFile(path: string): Promise<{ ok: true }> {
			return client.request(`${filesPath}?path=${encodeURIComponent(path)}`, { method: "DELETE" });
		},
		memoryFileRevisions(path: string): Promise<MemoryFileRevisionList> {
			return client.request(`${filesPath}/revisions?path=${encodeURIComponent(path)}`);
		},
		revertMemoryFile(body: RevertMemoryFileRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/revert`, { method: "POST", body });
		},
	};
}

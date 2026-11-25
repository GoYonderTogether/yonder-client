import type {
	MemoryDayPage,
	MemoryEntry,
	MemoryFileContent,
	MemoryFileList,
	MemoryFileRevisionList,
	MemoryFolderList,
	MemoryOrganizationResponse,
	MoveMemoryFileRequest,
	OwnerUnderstandingResponse,
	RevertMemoryFileRequest,
	ReviewMemoryOrganizationRequest,
	UpdateMemoryFileProtectionRequest,
	UpdateMemoryFileRequest,
	UpdateMemoryFileVisibilityRequest,
	UpdateMemoryRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

const filesPath = "/v1/memory/files";
const organizationPath = "/v1/me/social/organization";

export function memoryEndpoints(client: ApiClient) {
	return {
		memoryUnderstanding(signal?: AbortSignal): Promise<OwnerUnderstandingResponse> {
			return client.request("/v1/memory/understanding", signal ? { signal } : undefined);
		},
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
		/** Every folder the account has, with the name the owner reads (D1, README 2026-11-25 6.2). */
		memoryFolders(): Promise<MemoryFolderList> {
			return client.request("/v1/memory/folders");
		},
		memoryOrganization(): Promise<MemoryOrganizationResponse> {
			return client.request(organizationPath);
		},
		reviewMemoryOrganization(body: ReviewMemoryOrganizationRequest): Promise<MemoryOrganizationResponse> {
			return client.request(organizationPath, { method: "POST", body });
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
		updateMemoryFileProtection(body: UpdateMemoryFileProtectionRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/protection`, { method: "PATCH", body });
		},
		deleteMemoryFile(path: string): Promise<{ ok: true }> {
			return client.request(`${filesPath}?path=${encodeURIComponent(path)}`, { method: "DELETE" });
		},
		memoryFileRevisions(path: string): Promise<MemoryFileRevisionList> {
			return client.request(`${filesPath}/revisions?path=${encodeURIComponent(path)}`);
		},
		moveMemoryFile(body: MoveMemoryFileRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/move`, { method: "POST", body });
		},
		revertMemoryFile(body: RevertMemoryFileRequest): Promise<{ ok: true }> {
			return client.request(`${filesPath}/revert`, { method: "POST", body });
		},
	};
}

import type { MemoryDayPage, MemoryEntry, UpdateMemoryRequest } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function memoryEndpoints(client: ApiClient) {
	return {
		/**
		 * Newest days first; pass the previous page's `nextCursor` for older days. `timeZone` is the
		 * device's IANA zone, which decides which calendar day an event belongs to.
		 */
		memoryDays(cursor?: string, timeZone?: string): Promise<MemoryDayPage> {
			const query = new URLSearchParams();
			if (cursor) query.set("cursor", cursor);
			if (timeZone) query.set("tz", timeZone);
			const search = query.toString();
			return client.request(`/v1/memory/days${search ? `?${search}` : ""}`);
		},
		updateMemory(id: string, patch: UpdateMemoryRequest): Promise<MemoryEntry> {
			return client.request(`/v1/memory/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
		},
		deleteMemory(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/memory/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
	};
}

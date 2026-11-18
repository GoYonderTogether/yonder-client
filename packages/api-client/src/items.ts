import type { ItemDetail, ItemListResponse, ItemSummary } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** The items page: one merged list over the sources, its detail, and a subtask's lifecycle. */
export function itemEndpoints(client: ApiClient) {
	return {
		items(cursor?: string, options: { limit?: number; botId?: string } = {}): Promise<ItemListResponse> {
			const query = new URLSearchParams();
			if (cursor) query.set("cursor", cursor);
			if (options.limit !== undefined) query.set("limit", String(options.limit));
			if (options.botId) query.set("botId", options.botId);
			const search = query.toString();
			return client.request(`/v1/items${search ? `?${search}` : ""}`);
		},
		item(id: string): Promise<ItemDetail> {
			return client.request(`/v1/items/${encodeURIComponent(id)}`);
		},
		cancelItem(id: string): Promise<ItemSummary> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/cancel`, { body: {} });
		},
		pauseItem(id: string): Promise<ItemSummary> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/pause`, { body: {} });
		},
		resumeItem(id: string): Promise<ItemSummary> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/resume`, { body: {} });
		},
		transferItem(id: string, botId: string): Promise<ItemSummary> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/transfer`, { body: { botId } });
		},
	};
}

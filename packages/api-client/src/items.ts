import type { ItemDetail, ItemListResponse, ItemSummary } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** The items page: one merged list over the sources, its detail, and a subtask's lifecycle. */
export function itemEndpoints(client: ApiClient) {
	function items(
		cursor?: string,
		options: { limit?: number; botId?: string; activeSubtasks?: boolean } = {},
		signal?: AbortSignal,
	): Promise<ItemListResponse> {
		const query = new URLSearchParams();
		if (cursor) query.set("cursor", cursor);
		if (options.limit !== undefined) query.set("limit", String(options.limit));
		if (options.botId) query.set("botId", options.botId);
		if (options.activeSubtasks) query.set("activeSubtasks", "1");
		const search = query.toString();
		return client.request(`/v1/items${search ? `?${search}` : ""}`, signal ? { signal } : {});
	}
	return {
		items,
		async activeBotSubtasks(botId: string, signal?: AbortSignal): Promise<ItemSummary[]> {
			const active: ItemSummary[] = [];
			let cursor: string | undefined;
			do {
				const page = await items(cursor, { botId, activeSubtasks: true, limit: 100 }, signal);
				active.push(...page.items);
				cursor = page.nextCursor ?? undefined;
			} while (cursor);
			return active;
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

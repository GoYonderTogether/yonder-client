import type {
	CreateItemResponse,
	ItemDetail,
	ItemListResponse,
	ItemSessionResponse,
	ItemSummary,
	SendMessageRequest,
	UpdateItemRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** The items page: one merged list over the sources, its detail, and a subtask's lifecycle. */
export function itemEndpoints(client: ApiClient) {
	function items(
		cursor?: string,
		options: {
			limit?: number;
			botId?: string;
			activeSubtasks?: boolean;
			/** `"only"` is the folded 已归档 section; `true` is the same filter expressed as a flag. */
			archived?: "only" | boolean;
		} = {},
		signal?: AbortSignal,
	): Promise<ItemListResponse> {
		const query = new URLSearchParams();
		if (cursor) query.set("cursor", cursor);
		if (options.limit !== undefined) query.set("limit", String(options.limit));
		if (options.botId) query.set("botId", options.botId);
		if (options.activeSubtasks) query.set("activeSubtasks", "1");
		// The server accepts both spellings: `archived=only` is HEAD's folded section, `archived=1` is
		// the row-level archive filter. Send each caller's own spelling through unchanged.
		if (options.archived) query.set("archived", options.archived === "only" ? "only" : "1");
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
		openItemSession(id: string): Promise<ItemSessionResponse> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/session`, { body: {} });
		},
		renameItemSession(id: string, title: string): Promise<ItemSessionResponse> {
			return client.request(`/v1/items/${encodeURIComponent(id)}/session`, { method: "PATCH", body: { title } });
		},
		updateItem(id: string, body: UpdateItemRequest): Promise<{ ok: true }> {
			return client.request(`/v1/items/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},
		deleteItem(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/items/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
		updateUpcomingItem(id: string, body: UpdateItemRequest): Promise<{ ok: true }> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}/item`, { method: "PATCH", body });
		},
		deleteUpcomingItem(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}/item`, { method: "DELETE" });
		},
		createItem(body: SendMessageRequest): Promise<CreateItemResponse> {
			return client.request("/v1/items", { body, idempotencyKey: body.clientNonce });
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

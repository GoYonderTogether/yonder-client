import type { Conversation } from "./chat.ts";

/**
 * The item list (16-3 事项与 Bot 分工 第八节): one user-visible list merged from the three records
 * that already carry an owner and a lifecycle — a Bot's subtask, one firing of a schedule, and a
 * meeting's processing. There is no items table; this is a read view over the sources.
 */

/** Where an item came from. The client does not group by it, but the detail view names it. */
export type ItemSource = "subtask" | "schedule_run" | "meeting" | "visit" | "conversation";

/**
 * The one state an item is in. It is the source's own stored state, not a derived one: `background`
 * is a presentation of `running`, and a source that cannot express a state does not produce it.
 */
export type ItemState = "running" | "waiting_user" | "paused" | "completed" | "failed" | "cancelled";

/** One line of an item: what it produced, or — while it runs — nothing yet. */
export interface ItemSummary {
	id: string;
	source: ItemSource;
	title: string;
	state: ItemState;
	/** The Bot that owns this item, as the source stores it. */
	botMemberId: string;
	conversationId: string;
	startedAt: string;
	/** Null while the item has not finished. */
	endedAt: string | null;
	/** What it produced, in the source's own words; null while it runs. */
	result: string | null;
	/**
	 * The real reason it failed or was cancelled, as the source records it — a code such as
	 * `run_error`, `schedule_missed` or `background_quota_exhausted`. Never a stand-in for a result.
	 */
	failureReason: string | null;
	waitingReason?: string;
}

/** One recorded step of the work. The detail view shows them in order. */
export interface ItemStep {
	kind: string;
	detail: Record<string, unknown> | null;
	at: string;
}

/** `GET /v1/items/:id`: everything the item page shows. */
export interface ItemDetail extends ItemSummary {
	outwardRequest?: import("./outward.ts").OutwardRequestCard;
	/** What was asked for; null for a source with no instruction (a meeting). */
	instruction: string | null;
	/** Empty when the source records no steps. */
	steps: ItemStep[];
	/** True only for a subtask: it is the source whose lifecycle the user may drive from here. */
	cancellable: boolean;
	pausable: boolean;
}

/**
 * `GET /v1/items?cursor=&limit=&botId=`: items newest first, across all three sources. The first
 * page is what the page shows; pass `nextCursor` for older items.
 */
export interface ItemListResponse {
	items: ItemSummary[];
	nextCursor: string | null;
}

export interface ItemSessionResponse {
	conversation: Conversation;
}

export interface CreateItemResponse extends ItemSessionResponse {
	item: ItemSummary;
}

/**
 * How an item reads on the page (16-3 事项与 Bot 分工 第二节、第八节): which day group it falls in,
 * which state word it shows, and — for a failure — the one reason the user is given. Pure rules,
 * so the page has no judgement of its own and the grouping can be tested on its own.
 */
import type { ItemSummary, Schedule } from "@yonder/protocol";

export type ItemGroup = "today" | "yesterday" | "earlier";

/** The translator shape a pure helper needs: one key, one sentence. */
export type Translate = (key: string) => string;

export interface ItemGroupSection {
	group: ItemGroup;
	items: ItemSummary[];
}

/**
 * The one word a row adds to an item (2026-11-24, Meta Muse as the reference): 等你 tells the owner
 * to answer in chat, 失败 carries the real reason on the row's line, 已暂停 is the Bot's own stop and
 * has no control. A running item says so as before; a finished one adds nothing.
 */
export function itemTrailingKey(item: ItemSummary): string | null {
	if (item.state === "waiting_user") return "tasks.itemStateWaitingUser";
	if (item.state === "failed") return "tasks.itemStateFailed";
	if (item.state === "paused") return "tasks.itemStatePaused";
	if (item.state === "running") return "tasks.itemStateRunning";
	return null;
}

/**
 * The one line under an item's title. A finished item shows its result; a failed or cancelled one
 * shows the real reason, never a stand-in sentence; a running one shows nothing to say yet.
 */
export function itemSummaryLine(item: ItemSummary): { kind: "result" | "failure" | "none"; text: string | null } {
	if (item.failureReason) return { kind: "failure", text: item.failureReason };
	if (item.result) return { kind: "result", text: item.result };
	return { kind: "none", text: null };
}

/**
 * Why a source's reason code reads to a user. The codes are the server's own; a code this table does
 * not know is shown as the failure class, never guessed at.
 */
export function itemFailureKey(reason: string | null): string {
	switch (reason) {
		case "background_quota_exhausted":
		case "background_quota_floor":
		case "main_quota_exhausted":
			return "chat.quotaBackgroundExhausted";
		case "coding_quota_exhausted":
			return "chat.quotaCodingExhausted";
		case "tools_quota_exhausted":
			return "chat.quotaToolsExhausted";
		case "schedule_missed":
			return "chat.scheduleMissed";
		case "idle_timeout":
			return "chat.idleTimeout";
		case "outward_expired":
			return "visits.relayExpired";
		case "outward_declined":
			return "visits.relayDeclined";
		case "outward_cancelled":
			return "visits.relayCancelled";
		case "tool_repeat":
			return "chat.toolRepeat";
		case "reply_protocol":
			return "chat.replyProtocol";
		case "subtask_burst":
			return "chat.subtaskBurst";
		case "cancelled":
		case "cancelled_by_bot":
			return "tasks.itemStateCancelled";
		case "process_interrupted":
		case "host_restarted":
			return "chat.runFailed";
		default:
			return "chat.runFailed";
	}
}

/** The local calendar day of an instant, as `YYYY-MM-DD` in the device's zone. */
export function localDay(instant: Date, timeZone?: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		...(timeZone ? { timeZone } : {}),
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

/** Which of the page's three groups an instant falls in; `now` is the device's clock. */
export function itemGroup(startsAt: string, now: Date, timeZone?: string): ItemGroup {
	const day = localDay(new Date(startsAt), timeZone);
	const today = localDay(now, timeZone);
	if (day === today) return "today";
	const yesterday = new Date(now.getTime());
	yesterday.setDate(yesterday.getDate() - 1);
	return day === localDay(yesterday, timeZone) ? "yesterday" : "earlier";
}

/**
 * The list as 今天 / 昨天 / 更早, each newest first, with empty groups left out. The server already
 * sends newest first; grouping preserves that order inside each section.
 */
export function groupItems(items: readonly ItemSummary[], now: Date, timeZone?: string): ItemGroupSection[] {
	const order: ItemGroup[] = ["today", "yesterday", "earlier"];
	const buckets = new Map<ItemGroup, ItemSummary[]>();
	for (const item of items) {
		const group = itemGroup(item.startedAt, now, timeZone);
		const bucket = buckets.get(group) ?? [];
		bucket.push(item);
		buckets.set(group, bucket);
	}
	return order.filter((group) => buckets.has(group)).map((group) => ({ group, items: buckets.get(group) ?? [] }));
}

/** How a grouped section's heading reads. */
export function itemGroupKey(group: ItemGroup): string {
	return group === "today" ? "tasks.itemsToday" : group === "yesterday" ? "tasks.itemsYesterday" : "tasks.itemsEarlier";
}

/**
 * The one action a live item offers (16 第五节: a single reason and a single action). A running or
 * waiting subtask can be stopped from here (2026-11-24). A paused one has no control — the Bot paused
 * it, and recovering it or handing it on is told to the Bot in chat. Finished items, and the other
 * two sources, offer nothing.
 */
export function itemActions(item: ItemSummary): { cancel: boolean } {
	const live = item.state === "running" || item.state === "waiting_user";
	return { cancel: item.source === "subtask" && live };
}

/** When an item started, in the reader's own hour format; the day heading says which day. */
export function itemTimeLabel(startsAt: string, locale: string): string {
	const at = new Date(startsAt);
	if (Number.isNaN(at.getTime())) return startsAt;
	return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/**
 * The one-off plans that have not run yet. A firing becomes an item only when it happens; until then
 * the plan itself is what the user is waiting for, so it is shown as an upcoming item.
 */
export function upcomingOneOffs(schedules: readonly Schedule[]): Schedule[] {
	return schedules
		.filter((plan) => plan.kind === "once" && plan.status === "active" && plan.nextRunAt !== null)
		.sort((left, right) => (left.nextRunAt ?? "").localeCompare(right.nextRunAt ?? ""));
}

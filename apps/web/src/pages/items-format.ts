/**
 * How an item reads on the page (16-3 事项与 Bot 分工 第二节、第八节): which day group it falls in,
 * which state word it shows, and — for a failure — the one reason the user is given. Pure rules,
 * so the page has no judgement of its own and the grouping can be tested on its own.
 */
import type { ItemState, ItemSummary, Schedule } from "@yonder/protocol";

export type ItemGroup = "today" | "yesterday" | "earlier";

/** The translator shape a pure helper needs: one key, one sentence. */
export type Translate = (key: string) => string;

export interface ItemGroupSection {
	group: ItemGroup;
	items: ItemSummary[];
}

/** The page's own label key for a state; a source's stored word is never shown as-is. */
export function itemStateKey(state: ItemState): string {
	switch (state) {
		case "running":
			return "tasks.itemStateRunning";
		case "waiting_user":
			return "tasks.itemStateWaitingUser";
		case "paused":
			return "tasks.itemStatePaused";
		case "completed":
			return "tasks.itemStateCompleted";
		case "failed":
			return "tasks.itemStateFailed";
		case "cancelled":
			return "tasks.itemStateCancelled";
	}
}

export function itemSourceKey(source: ItemSummary["source"]): string {
	if (source === "visit") return "tasks.itemSourceVisit";
	return source === "subtask"
		? "tasks.itemSourceSubtask"
		: source === "schedule_run"
			? "tasks.itemSourceSchedule"
			: "tasks.itemSourceMeeting";
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
 * The one action a blocked item offers (16 第五节: a single reason and a single action). A running
 * or paused subtask can be driven from here; the other sources are records and offer nothing.
 */
export function itemActions(item: ItemSummary): { pause: boolean; resume: boolean; cancel: boolean } {
	const cancellable =
		item.source === "subtask" && item.state !== "completed" && item.state !== "failed" && item.state !== "cancelled";
	return {
		pause: cancellable && (item.state === "running" || item.state === "waiting_user"),
		resume: cancellable && item.state === "paused",
		cancel: cancellable,
	};
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

/** The plus button's preset sentence, per tab (16-3 第十节). */
export function presetPhrase(scheduled: boolean): string {
	return scheduled ? "tasks.presetGoal" : "tasks.presetItem";
}

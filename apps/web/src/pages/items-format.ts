/**
 * How an item reads on the page (16-3 事项与 Bot 分工 第二节、第八节; 2026-11-26 反馈): the list is the
 * owner's view of what is running in the background and what is waiting for them, not a to-do list.
 * Every row is a title and one caption line — how it came to be, which Bot owns it, and when — and the
 * caption's last slot says the one thing the owner may need to know instead (a wait, a failure, a
 * pause). Pure rules, so the page has no judgement of its own and the grouping can be tested alone.
 */
import { type FailureTone, runFailureText } from "@yonder/chat-model";
import type { ItemSource, ItemSummary, Schedule } from "@yonder/protocol";

export type ItemGroup = "today" | "yesterday" | "earlier";

/** The two fixed sections above the day groups, plus the day groups themselves. */
export type ItemSectionGroup = "needs" | "active" | ItemGroup;

/** The translator shape a pure helper needs: one key, one sentence. */
export type Translate = (key: string) => string;

export interface ItemGroupSection {
	group: ItemGroup;
	items: ItemSummary[];
}

export interface ItemSection {
	group: ItemSectionGroup;
	items: ItemSummary[];
}

/**
 * The five things a row's leading icon can say. `cancelled` has no icon of its own: the run is over
 * and nothing more will happen, so it reads with the finished rows, and its own word stays in the
 * screen reader's label.
 */
export type ItemStateKind = "running" | "waiting" | "failed" | "paused" | "done";

export function itemStateKind(item: ItemSummary): ItemStateKind {
	if (item.state === "running") return "running";
	if (item.state === "waiting_user") return "waiting";
	if (item.state === "failed") return "failed";
	if (item.state === "paused") return "paused";
	return "done";
}

/**
 * The word a source reads as "how this line came to be". A recording, a task session and a subtask
 * are produced by different machinery, and the owner can only judge a row when it says which.
 */
export function itemSourceKey(source: ItemSource): string {
	if (source === "meeting") return "tasks.itemSourceMeeting";
	if (source === "conversation") return "tasks.itemSourceConversation";
	if (source === "subtask") return "tasks.itemSourceSubtask";
	if (source === "schedule_run") return "tasks.itemSourceSchedule";
	return "tasks.itemSourceVisit";
}

/**
 * The one word a row adds to an item (2026-11-24, Meta Muse as the reference): 等你 tells the owner
 * to answer in chat, 失败 carries the real reason on the row's line, 已暂停 is the Bot's own stop and
 * has no control. A running item says so as before; a finished one adds nothing. Kept for the detail
 * header, where the state is written out next to the icon.
 */
export function itemTrailingKey(item: ItemSummary): string | null {
	if (item.state === "waiting_user") return "tasks.itemStateWaitingUser";
	if (item.state === "failed") return "tasks.itemStateFailed";
	if (item.state === "paused") return "tasks.itemStatePaused";
	if (item.state === "running") return "tasks.itemStateRunning";
	return null;
}

/**
 * Why a source's reason code reads to a user. One table for the chat, the items and the mini program
 * (`runFailureText`); the codes this view alone meets are added here, and a code neither table knows
 * is the quiet failure line, never the code itself.
 */
export function itemFailure(reason: string | null, locale: string): { text: string; tone: FailureTone } {
	const zh = locale === "zh-CN";
	// States only an item reaches: cancelled, a visit that ended. The rest reads from one table.
	if (reason === "cancelled" || reason === "cancelled_by_bot")
		return { text: zh ? "已取消" : "Cancelled", tone: "quiet" };
	if (reason === "outward_expired") return { text: zh ? "请求已过期" : "Request expired", tone: "quiet" };
	if (reason === "outward_declined") return { text: zh ? "主人已拒绝请求" : "The owner declined", tone: "quiet" };
	if (reason === "outward_cancelled") return { text: zh ? "请求已取消" : "Request cancelled", tone: "quiet" };
	if (reason === "schedule_missed") return { text: zh ? "错过了执行时间" : "Missed its scheduled time", tone: "quiet" };
	if (reason === "run_error") return { text: zh ? "这次没有跑完" : "This run did not finish", tone: "quiet" };
	if (reason === "recording_task_failed" || reason === "meeting_result_unknown")
		return { text: zh ? "这次录音没有整理完成" : "This recording was not finished", tone: "quiet" };
	if (reason === "upstream_unavailable")
		return { text: zh ? "服务暂时不可用" : "The service is unavailable", tone: "action" };
	return runFailureText(reason, locale);
}

/**
 * Why a paused item stopped, in a sentence. A connector import pauses because the device went away;
 * it resumes by itself, so the row can say that rather than read like a failure.
 */
export function itemPause(reason: string | null, locale: string): string {
	const zh = locale === "zh-CN";
	if (reason === "device_offline") return zh ? "设备不在线，稍后会自动继续" : "Device offline; resumes by itself";
	if (reason) return zh ? "已暂停，稍后会自动继续" : "Paused; it will resume by itself";
	return zh ? "Bot 暂停了这件事" : "The Bot paused this";
}

/**
 * What a row says in place of the time when the owner is the one being waited on. A visitor's
 * question is already the row's title, so it is not repeated as the hint.
 */
export function itemWaitingText(item: ItemSummary, title: string, locale: string): string {
	const question = item.waitingReason?.trim();
	if (question && !title.includes(question)) return question;
	return locale === "zh-CN" ? "在等你回复或确认" : "Waiting for your reply";
}

/**
 * Titles the recording pipeline writes before a summary gives it a name
 * (`recordingTitleDefaults` on the server): 「录音笔记」, 「会议录音」 and their English forms,
 * optionally with a date or place after the colon. Such a row still names itself by its time.
 */
const PLACEHOLDER_TITLES = ["录音笔记", "会议录音", "Recording note", "Recording notes", "Meeting recording"];

export function isPlaceholderTitle(title: string): boolean {
	const trimmed = title.trim();
	return PLACEHOLDER_TITLES.some(
		(placeholder) =>
			trimmed === placeholder || trimmed.startsWith(`${placeholder}：`) || trimmed.startsWith(`${placeholder}:`),
	);
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

/** Which of the page's three day groups an instant falls in; `now` is the device's clock. */
export function itemGroup(startsAt: string, now: Date, timeZone?: string): ItemGroup {
	const day = localDay(new Date(startsAt), timeZone);
	const today = localDay(now, timeZone);
	if (day === today) return "today";
	const yesterday = new Date(now.getTime());
	yesterday.setDate(yesterday.getDate() - 1);
	return day === localDay(yesterday, timeZone) ? "yesterday" : "earlier";
}

/** Newest first; ids break a tie so the order never depends on the source query. */
function newestFirst(left: ItemSummary, right: ItemSummary): number {
	const diff = Date.parse(right.startedAt) - Date.parse(left.startedAt);
	return diff !== 0 && Number.isFinite(diff) ? diff : right.id.localeCompare(left.id);
}

/**
 * The list as 需要你 / 进行中 / 今天 / 昨天 / 更早 (2026-11-26). The two fixed sections are the whole
 * point of the page — what is waiting for the owner and what is running — so they come first and are
 * left out when empty; everything that has ended falls into its day. Each keeps newest first.
 */
export function sectionItems(items: readonly ItemSummary[], now: Date, timeZone?: string): ItemSection[] {
	const waiting = items.filter((item) => item.state === "waiting_user").sort(newestFirst);
	const running = items.filter((item) => item.state === "running").sort(newestFirst);
	const ended = items.filter((item) => item.state !== "waiting_user" && item.state !== "running");
	const sections: ItemSection[] = [];
	if (waiting.length > 0) sections.push({ group: "needs", items: waiting });
	if (running.length > 0) sections.push({ group: "active", items: running });
	sections.push(...groupItems(ended, now, timeZone));
	return sections;
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

/** How a section's heading reads. */
export function itemSectionKey(group: ItemSectionGroup): string {
	if (group === "needs") return "tasks.itemGroupWaiting";
	if (group === "active") return "tasks.itemGroupActive";
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
 * How long a running item has been going, in the reader's own unit words ("5 分钟" / "5 minutes").
 * Under a minute reads as 刚刚. The row refreshes this once a minute rather than ticking a timer.
 */
export function itemElapsed(startsAt: string, now: Date, locale: string): string {
	const start = Date.parse(startsAt);
	const justNow = locale === "zh-CN" ? "刚刚" : "just now";
	if (!Number.isFinite(start)) return justNow;
	const seconds = Math.max(0, Math.round((now.getTime() - start) / 1000));
	if (seconds < 60) return justNow;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return unit(locale, minutes, "minute");
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return unit(locale, hours, "hour");
	return unit(locale, Math.floor(hours / 24), "day");
}

function unit(locale: string, value: number, unit: "minute" | "hour" | "day"): string {
	return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
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

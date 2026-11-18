import type { ItemSummary } from "@yonder/protocol";
import { describe, expect, test } from "vitest";
import {
	groupItems,
	itemActions,
	itemFailureKey,
	itemGroup,
	itemStateKey,
	itemSummaryLine,
	itemTimeLabel,
	upcomingOneOffs,
} from "./items-format.ts";

const item = (extra: Partial<ItemSummary> = {}): ItemSummary => ({
	id: "run_1",
	source: "subtask",
	title: "查报销规则",
	state: "running",
	botMemberId: "bot_1",
	conversationId: "cnv_1",
	startedAt: "2026-11-17T02:00:00.000Z",
	endedAt: null,
	result: null,
	failureReason: null,
	...extra,
});

const NOON = new Date("2026-11-17T12:00:00.000Z");

describe("the day groups", () => {
	test("an item started today is 今天, yesterday is 昨天, and anything older is 更早", () => {
		expect(itemGroup("2026-11-17T02:00:00.000Z", NOON, "UTC")).toBe("today");
		expect(itemGroup("2026-11-16T20:00:00.000Z", NOON, "UTC")).toBe("yesterday");
		expect(itemGroup("2026-11-10T20:00:00.000Z", NOON, "UTC")).toBe("earlier");
	});

	test("the day is the reader's day, not UTC's", () => {
		// 02:00 UTC on the 17th is 10:00 on the 17th in Shanghai and 21:00 on the 16th in New York.
		expect(itemGroup("2026-11-17T02:00:00.000Z", NOON, "Asia/Shanghai")).toBe("today");
		expect(itemGroup("2026-11-17T02:00:00.000Z", NOON, "America/New_York")).toBe("yesterday");
	});

	test("grouping keeps the server's newest-first order inside each section and drops empty ones", () => {
		const sections = groupItems(
			[
				item({ id: "a", startedAt: "2026-11-17T05:00:00.000Z" }),
				item({ id: "b", startedAt: "2026-11-17T01:00:00.000Z" }),
				item({ id: "c", startedAt: "2026-11-09T01:00:00.000Z" }),
			],
			NOON,
			"UTC",
		);
		expect(sections.map((section) => section.group)).toEqual(["today", "earlier"]);
		expect(sections[0]?.items.map((entry) => entry.id)).toEqual(["a", "b"]);
		expect(sections[1]?.items.map((entry) => entry.id)).toEqual(["c"]);
	});
});

describe("what an item says", () => {
	test("every state has its own sentence key", () => {
		const states = ["running", "waiting_user", "paused", "completed", "failed", "cancelled"] as const;
		const keys = states.map((state) => itemStateKey(state));
		expect(new Set(keys).size).toBe(states.length);
		for (const key of keys) expect(key.startsWith("tasks.itemState")).toBe(true);
	});

	test("a result, a failure reason and nothing are three different lines", () => {
		expect(itemSummaryLine(item({ result: "做完了", state: "completed" }))).toEqual({
			kind: "result",
			text: "做完了",
		});
		// A failure's reason wins over any result the source also recorded.
		expect(itemSummaryLine(item({ state: "failed", result: "半截", failureReason: "run_error" }))).toEqual({
			kind: "failure",
			text: "run_error",
		});
		expect(itemSummaryLine(item())).toEqual({ kind: "none", text: null });
	});

	test("a reason code reads as a sentence, and an unknown one still reads as a failure", () => {
		expect(itemFailureKey("background_quota_exhausted")).toBe("chat.quotaBackgroundExhausted");
		expect(itemFailureKey("schedule_missed")).toBe("chat.scheduleMissed");
		expect(itemFailureKey("idle_timeout")).toBe("chat.idleTimeout");
		expect(itemFailureKey("tool_repeat")).toBe("chat.toolRepeat");
		expect(itemFailureKey("cancelled_by_bot")).toBe("tasks.itemStateCancelled");
		expect(itemFailureKey("what_is_this")).toBe("chat.runFailed");
		expect(itemFailureKey(null)).toBe("chat.runFailed");
	});

	test("a time is the reader's hour format", () => {
		expect(itemTimeLabel("2026-11-17T02:05:00.000Z", "en-GB")).toMatch(/^\d{2}:\d{2}$/);
		expect(itemTimeLabel("not-an-instant", "en-GB")).toBe("not-an-instant");
	});
});

describe("the actions an item offers", () => {
	test("a running subtask can be paused and cancelled; a paused one can be resumed", () => {
		expect(itemActions(item())).toEqual({ pause: true, resume: false, cancel: true });
		expect(itemActions(item({ state: "paused" }))).toEqual({ pause: false, resume: true, cancel: true });
	});

	test("a finished subtask offers nothing", () => {
		for (const state of ["completed", "failed", "cancelled"] as const)
			expect(itemActions(item({ state }))).toEqual({ pause: false, resume: false, cancel: false });
	});

	test("the other two sources are records, so the page cannot drive them", () => {
		for (const source of ["schedule_run", "meeting"] as const)
			expect(itemActions(item({ source }))).toEqual({ pause: false, resume: false, cancel: false });
	});
});

describe("the upcoming one-off plans", () => {
	const plan = (extra: Record<string, unknown>) =>
		({
			id: "sch_1",
			kind: "once",
			status: "active",
			nextRunAt: "2026-11-18T09:00:00.000Z",
			...extra,
		}) as unknown as Parameters<typeof upcomingOneOffs>[0][number];

	test("only a live one-off is upcoming, soonest first", () => {
		const upcoming = upcomingOneOffs([
			plan({ id: "b", nextRunAt: "2026-11-19T09:00:00.000Z" }),
			plan({ id: "a" }),
			plan({ id: "daily", kind: "daily" }),
			plan({ id: "paused", status: "paused" }),
			plan({ id: "ended", status: "ended" }),
		]);
		expect(upcoming.map((entry) => entry.id)).toEqual(["a", "b"]);
	});
});

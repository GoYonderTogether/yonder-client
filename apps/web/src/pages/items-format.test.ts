import type { ItemSummary } from "@yonder/protocol";
import { describe, expect, test } from "vitest";
import {
	groupItems,
	isPlaceholderTitle,
	itemActions,
	itemElapsed,
	itemFailure,
	itemGroup,
	itemPause,
	itemSectionKey,
	itemSourceKey,
	itemStateKind,
	itemTimeLabel,
	itemTrailingKey,
	itemWaitingText,
	sectionItems,
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

describe("the fixed sections above the days", () => {
	test("需要你 comes first, then 进行中, then the day groups; each is newest first", () => {
		const sections = sectionItems(
			[
				item({ id: "done", state: "completed", startedAt: "2026-11-17T08:00:00.000Z" }),
				item({ id: "wait-old", state: "waiting_user", startedAt: "2026-11-16T08:00:00.000Z" }),
				item({ id: "running", state: "running", startedAt: "2026-11-17T09:00:00.000Z" }),
				item({ id: "wait-new", state: "waiting_user", startedAt: "2026-11-17T10:00:00.000Z" }),
				item({ id: "failed", state: "failed", startedAt: "2026-11-17T07:00:00.000Z" }),
			],
			NOON,
			"UTC",
		);
		expect(sections.map((section) => section.group)).toEqual(["needs", "active", "today"]);
		expect(sections[0]?.items.map((entry) => entry.id)).toEqual(["wait-new", "wait-old"]);
		expect(sections[1]?.items.map((entry) => entry.id)).toEqual(["running"]);
		// Everything that has ended — completed, failed, paused, cancelled — belongs to its day.
		expect(sections[2]?.items.map((entry) => entry.id)).toEqual(["done", "failed"]);
	});

	test("an empty 需要你 or 进行中 group is left out entirely", () => {
		const sections = sectionItems([item({ id: "done", state: "completed" })], NOON, "UTC");
		expect(sections.map((section) => section.group)).toEqual(["today"]);
		expect(sectionItems([], NOON, "UTC")).toEqual([]);
	});

	test("a paused item is a day group, not a live section: no control drives it from here", () => {
		const sections = sectionItems([item({ id: "paused", state: "paused" })], NOON, "UTC");
		expect(sections.map((section) => section.group)).toEqual(["today"]);
	});

	test("the headings read 需要你 / 进行中 / 今天", () => {
		expect(itemSectionKey("needs")).toBe("tasks.itemGroupWaiting");
		expect(itemSectionKey("active")).toBe("tasks.itemGroupActive");
		expect(itemSectionKey("today")).toBe("tasks.itemsToday");
	});
});

describe("the state a row marks", () => {
	test("each state maps to one of the five marks; cancelled reads as finished", () => {
		expect(itemStateKind(item({ state: "running" }))).toBe("running");
		expect(itemStateKind(item({ state: "waiting_user" }))).toBe("waiting");
		expect(itemStateKind(item({ state: "failed" }))).toBe("failed");
		expect(itemStateKind(item({ state: "paused" }))).toBe("paused");
		expect(itemStateKind(item({ state: "completed" }))).toBe("done");
		expect(itemStateKind(item({ state: "cancelled" }))).toBe("done");
	});
});

describe("how a row says where it came from", () => {
	test("each source has its own word", () => {
		expect(itemSourceKey("meeting")).toBe("tasks.itemSourceMeeting");
		expect(itemSourceKey("conversation")).toBe("tasks.itemSourceConversation");
		expect(itemSourceKey("subtask")).toBe("tasks.itemSourceSubtask");
		expect(itemSourceKey("schedule_run")).toBe("tasks.itemSourceSchedule");
		expect(itemSourceKey("visit")).toBe("tasks.itemSourceVisit");
	});
});

describe("what an item says", () => {
	test("a reason code reads as a sentence, and an unknown one is the quiet failure", () => {
		expect(itemFailure("background_quota_exhausted", "zh-CN")).toEqual({ text: "后台额度已用完", tone: "action" });
		expect(itemFailure("idle_timeout", "zh-CN")).toEqual({ text: "Bot 长时间没有进展，已停下", tone: "quiet" });
		expect(itemFailure("cancelled_by_bot", "zh-CN")).toEqual({ text: "已取消", tone: "quiet" });
		expect(itemFailure("schedule_missed", "zh-CN")).toEqual({ text: "错过了执行时间", tone: "quiet" });
		// Our own machinery never shows its code, in either language.
		expect(itemFailure("reply_protocol", "zh-CN")).toEqual({ text: "这次没有回复", tone: "quiet" });
		expect(itemFailure("what_is_this", "en")).toEqual({ text: "No reply this time", tone: "quiet" });
		expect(itemFailure(null, "en")).toEqual({ text: "No reply this time", tone: "quiet" });
	});

	test("a pause names the device's reason in words, never its code", () => {
		expect(itemPause("device_offline", "zh-CN")).toBe("设备不在线，稍后会自动继续");
		expect(itemPause("device_offline", "en")).toBe("Device offline; resumes by itself");
		expect(itemPause(null, "zh-CN")).toBe("Bot 暂停了这件事");
	});

	test("a wait says what it waits for, without repeating a title that is already the question", () => {
		expect(itemWaitingText(item({ waitingReason: "等你确认预算" }), "整理账单", "zh-CN")).toBe("等你确认预算");
		expect(itemWaitingText(item({ waitingReason: "周四有空吗" }), "小王 · 周四有空吗", "zh-CN")).toBe(
			"在等你回复或确认",
		);
		expect(itemWaitingText(item(), "整理账单", "en")).toBe("Waiting for your reply");
	});

	test("a time is the reader's hour format", () => {
		expect(itemTimeLabel("2026-11-17T02:05:00.000Z", "en-GB")).toMatch(/^\d{2}:\d{2}$/);
		expect(itemTimeLabel("not-an-instant", "en-GB")).toBe("not-an-instant");
	});

	test("how long a run has been going reads in whole units", () => {
		expect(itemElapsed("2026-11-17T11:59:40.000Z", NOON, "zh-CN")).toBe("刚刚");
		expect(itemElapsed("2026-11-17T11:55:00.000Z", NOON, "zh-CN")).toBe("5分钟");
		expect(itemElapsed("2026-11-17T08:00:00.000Z", NOON, "en")).toBe("4 hours");
		expect(itemElapsed("2026-11-15T12:00:00.000Z", NOON, "en")).toBe("2 days");
	});
});

describe("a placeholder title", () => {
	test("the recording pipeline's defaults are recognised, with or without their detail", () => {
		expect(isPlaceholderTitle("录音笔记")).toBe(true);
		expect(isPlaceholderTitle("会议录音")).toBe(true);
		expect(isPlaceholderTitle("录音笔记：东湖")).toBe(true);
		expect(isPlaceholderTitle("Recording notes")).toBe(true);
		expect(isPlaceholderTitle("Meeting recording: East Lake")).toBe(true);
		expect(isPlaceholderTitle("与林远的融资沟通")).toBe(false);
		expect(isPlaceholderTitle("录音笔记整理工具")).toBe(false);
	});
});

describe("the actions an item offers", () => {
	test("a running or waiting subtask can be stopped; a paused one has no control", () => {
		expect(itemActions(item())).toEqual({ cancel: true });
		expect(itemActions(item({ state: "waiting_user" }))).toEqual({ cancel: true });
		expect(itemActions(item({ state: "paused" }))).toEqual({ cancel: false });
	});

	test("a finished subtask offers nothing", () => {
		for (const state of ["completed", "failed", "cancelled"] as const)
			expect(itemActions(item({ state }))).toEqual({ cancel: false });
	});

	test("the other two sources are records, so the page cannot drive them", () => {
		for (const source of ["schedule_run", "meeting"] as const)
			expect(itemActions(item({ source }))).toEqual({ cancel: false });
	});
});

describe("the one status word a row adds", () => {
	test("a wait, a failure, a pause and a run say so; a finished item adds nothing", () => {
		expect(itemTrailingKey(item({ state: "waiting_user" }))).toBe("tasks.itemStateWaitingUser");
		expect(itemTrailingKey(item({ state: "failed" }))).toBe("tasks.itemStateFailed");
		expect(itemTrailingKey(item({ state: "paused" }))).toBe("tasks.itemStatePaused");
		expect(itemTrailingKey(item({ state: "running" }))).toBe("tasks.itemStateRunning");
		for (const state of ["completed", "cancelled"] as const) expect(itemTrailingKey(item({ state }))).toBeNull();
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

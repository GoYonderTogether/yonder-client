import { expect, test } from "vitest";
import {
	formatMeetingTime,
	formatMeetingTranscript,
	meetingTranscriptParagraphs,
	meetingTranscriptSentences,
	parseMeetingTranscript,
} from "./transcript.ts";

const turn = (start: string, end: string, label: string, text: string) => `${start}–${end} ${label}：${text}`;

test("paragraphs merge one speaker's nearby sentences and keep every other boundary", () => {
	const stored = [
		turn("00:00:01.150", "00:00:02.650", "第1段说话人1", "先看一下进度。"),
		turn("00:00:04.000", "00:00:05.000", "第1段说话人1", "然后说结论。"),
		turn("00:00:05.500", "00:00:06.000", "第1段说话人2", "我来补充。"),
		// A pause over 3 s starts a new paragraph even from the same speaker.
		turn("00:00:10.000", "00:00:11.000", "第1段说话人2", "另外一件事。"),
		// A different batch reuses the same label and is a different speaker's numbering.
		turn("00:00:11.500", "00:00:12.000", "第2段说话人2", "新的批次。"),
	].join("\n");
	expect(formatMeetingTranscript(stored)).toBe(
		[
			"[00:01] 说话人 1：先看一下进度。 然后说结论。",
			"[00:05] 说话人 2：我来补充。",
			"[00:10] 说话人 2：另外一件事。",
			"[00:11] 说话人 2：新的批次。",
		].join("\n"),
	);
});

test("a paragraph stops at the character limit instead of becoming one long block", () => {
	const long = "甲".repeat(200);
	const stored = [
		turn("00:00:00.000", "00:00:01.000", "第1段说话人1", long),
		turn("00:00:01.000", "00:00:02.000", "第1段说话人1", "乙".repeat(50)),
	].join("\n");
	const paragraphs = meetingTranscriptParagraphs(parseMeetingTranscript(stored));
	expect(paragraphs).toHaveLength(2);
	expect(paragraphs[0]?.text).toBe(long);
	expect(paragraphs[1]?.text).toBe("乙".repeat(50));
});

test("an uncertain speaker leaves no label and never the placeholder", () => {
	const stored = [
		"第1段 · 说话人归属待确认",
		turn("00:00:01.000", "00:00:02.000", "归属待确认", "请保留原文。"),
		turn("00:00:02.500", "00:00:03.000", "归属待确认", "不要丢字。"),
		"12:30 复核原文。",
	].join("\n");
	// A sentence with no speaker identity shares one with nothing, so it stands alone; its words are
	// still whole, and the only thing dropped is the placeholder.
	expect(formatMeetingTranscript(stored)).toBe("[00:01] 请保留原文。\n[00:02] 不要丢字。\n12:30 复核原文。");
	expect(formatMeetingTranscript(stored)).not.toContain("归属待确认");
});

test("times past an hour keep their hour instead of wrapping minutes", () => {
	expect(formatMeetingTime(0)).toBe("00:00");
	expect(formatMeetingTime(61_000)).toBe("01:01");
	expect(formatMeetingTime(3_600_000)).toBe("1:00:00");
	expect(formatMeetingTime(4_201_000)).toBe("1:10:01");
	const stored = turn("01:10:01.000", "01:10:02.000", "第1段说话人1", "长谈继续。");
	expect(formatMeetingTranscript(stored)).toBe("[1:10:01] 说话人 1：长谈继续。");
});

test("a malformed time keeps the words but invents no paragraph time", () => {
	const stored = turn("00:00:05.000", "00:00:04.000", "第1段说话人1", "时间倒退。");
	expect(formatMeetingTranscript(stored)).toBe("时间倒退。");
	expect(meetingTranscriptSentences(stored, { fromMs: 0, toMs: 60_000 })).toEqual([]);
});

test("a sentence lookup answers by words or by overlapping range, with exact times", () => {
	const stored = [
		turn("00:00:01.000", "00:00:03.500", "第1段说话人1", "第一句包含关键词。"),
		turn("00:00:05.000", "00:00:07.000", "第1段说话人2", "第二句别的话。"),
		turn("00:00:09.000", "00:00:11.000", "第1段说话人1", "第三句也提到关键词。"),
	].join("\n");
	expect(meetingTranscriptSentences(stored, { text: "关键词" })).toMatchObject([
		{ startMs: 1000, endMs: 3500, text: "第一句包含关键词。" },
		{ startMs: 9000, endMs: 11_000, text: "第三句也提到关键词。" },
	]);
	expect(meetingTranscriptSentences(stored, { fromMs: 4000, toMs: 8000 })).toMatchObject([
		{ startMs: 5000, endMs: 7000, text: "第二句别的话。" },
	]);
	// Half-open ranges: a sentence starting at the range's end is outside it, one starting just inside is in.
	expect(meetingTranscriptSentences(stored, { fromMs: 0, toMs: 1000 })).toHaveLength(0);
	expect(meetingTranscriptSentences(stored, { fromMs: 0, toMs: 1001 })).toHaveLength(1);
	expect(meetingTranscriptSentences(stored, { fromMs: 11_001 })).toHaveLength(0);
	expect(meetingTranscriptSentences(stored, { text: "关键词", fromMs: 9000 })).toHaveLength(1);
});

test("photos stay at speech boundaries: paragraph time is the first sentence's start", () => {
	const stored = [
		turn("00:00:01.200", "00:00:03.600", "第1段说话人1", "A."),
		turn("00:00:04.300", "00:00:06.200", "第1段说话人1", "B."),
		turn("00:00:06.300", "00:00:07.100", "第1段说话人1", "C."),
	].join("\n");
	const paragraphs = meetingTranscriptParagraphs(parseMeetingTranscript(stored));
	expect(paragraphs).toMatchObject([
		{
			startMs: 1200,
			endMs: 7100,
			sentences: [
				{ startMs: 1200, endMs: 3600 },
				{ startMs: 4300, endMs: 6200 },
				{ startMs: 6300, endMs: 7100 },
			],
		},
	]);
	expect(formatMeetingTranscript(stored)).toBe("[00:01] 说话人 1：A. B. C.");
});

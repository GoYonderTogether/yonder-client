import type { Message } from "@yonder/protocol";
import { expect, test } from "vitest";
import { groupMessages, newestReadableMessage } from "./index.ts";

test("a Bot reply becomes readable when it finishes, after later messages have been read", () => {
	const human: Message = {
		id: "msg_human",
		conversationId: "cnv_test",
		senderId: "mem_friend",
		senderKind: "person",
		type: "text",
		body: "A later message",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-19T01:00:01.000Z",
		editedAt: null,
		streaming: false,
		version: 1,
	};
	const bot: Message = {
		...human,
		id: "msg_bot",
		senderId: "bot_test",
		senderKind: "bot",
		streaming: true,
		createdAt: "2026-11-19T01:00:00.000Z",
	};
	expect(newestReadableMessage([bot, human], "mem_reader")).toBe(human.id);
	expect(
		newestReadableMessage(
			[
				human,
				{
					...bot,
					streaming: false,
					body: "",
					readableAt: "2026-11-19T01:00:02.000Z",
					outwardRequest: { id: "owr_test", state: "answered", expiresAt: "2026-11-19T01:05:00.000Z", result: true },
				},
			],
			"mem_reader",
		),
	).toBe(bot.id);
	expect(
		newestReadableMessage([{ ...bot, streaming: false, readableAt: "2026-11-19T01:00:02.000Z" }, human], "mem_reader"),
	).toBe(bot.id);
});

test("only a capable renderer keeps a card-only Bot output and marks it readable after streaming", () => {
	const blank: Message = {
		id: "msg_card",
		conversationId: "cnv_test",
		senderId: "bot_test",
		senderKind: "bot",
		type: "text",
		body: "",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-19T01:00:02.000Z",
		editedAt: null,
		streaming: false,
		version: 2,
		run: {
			id: "run1",
			conversationId: "cnv_test",
			messageId: "msg_card",
			userMessageId: "msg_owner",
			status: "completed",
		},
	};
	const card = { ...blank, cardId: "acd_card" };
	const supported = { agentCards: true };
	expect(groupMessages([card])).toEqual([]);
	expect(newestReadableMessage([card], "mem_reader")).toBeUndefined();
	expect(groupMessages([card], false, supported)).toEqual([{ run: [card] }]);
	expect(newestReadableMessage([card], "mem_reader", supported)).toBe(card.id);
	for (const message of [blank, { ...blank, cardId: "not/a/card" }, { ...blank, streaming: true }]) {
		expect(groupMessages([message], false, supported)).toEqual([]);
		expect(newestReadableMessage([message], "mem_reader", supported)).toBeUndefined();
	}
	expect(newestReadableMessage([{ ...card, streaming: true }], "mem_reader", supported)).toBeUndefined();
});

test("a recording-only Bot message acknowledges its watermark only on a surface that renders it", () => {
	const recording: Message = {
		id: "msg_recording",
		conversationId: "cnv_test",
		senderId: "bot_test",
		senderKind: "bot",
		type: "text",
		body: "",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-19T01:00:02.000Z",
		editedAt: null,
		streaming: false,
		version: 1,
		meeting: { id: "mtg_note", title: "Recording note" },
	};
	expect(newestReadableMessage([recording], "mem_reader")).toBeUndefined();
	expect(newestReadableMessage([recording], "mem_reader", { recordingNotes: true })).toBe(recording.id);
	expect(newestReadableMessage([recording], "bot_test", { recordingNotes: true })).toBeUndefined();
	expect(
		newestReadableMessage([{ ...recording, streaming: true }], "mem_reader", { recordingNotes: true }),
	).toBeUndefined();
});

test("a visible task card advances the read cursor past an earlier Bot message", () => {
	const first: Message = {
		id: "msg_first",
		conversationId: "cnv_test",
		senderId: "bot_test",
		senderKind: "bot",
		type: "text",
		body: "Earlier",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-19T01:00:01.000Z",
		editedAt: null,
		streaming: false,
		version: 1,
	};
	const task = {
		...first,
		id: "msg_task",
		body: "",
		createdAt: "2026-11-19T01:00:02.000Z",
		taskSession: { id: "cnv_task", title: "Apple Calendar" },
	};
	expect(newestReadableMessage([first, task], "mem_reader")).toBe(first.id);
	expect(newestReadableMessage([first, task], "mem_reader", { taskSessions: true })).toBe(task.id);
	expect(newestReadableMessage([task], task.senderId, { taskSessions: true })).toBeUndefined();
	expect(newestReadableMessage([{ ...task, streaming: true }], "mem_reader", { taskSessions: true })).toBeUndefined();
	expect(
		newestReadableMessage([task, { ...first, id: "msg_new", createdAt: "2026-11-19T01:00:03.000Z" }], "mem_reader", {
			taskSessions: true,
		}),
	).toBe("msg_new");
});

const failed = (id: string, reason: string, createdAt: string, extra: Partial<Message> = {}): Message => ({
	id,
	conversationId: "cnv_test",
	senderId: "bot_test",
	senderKind: "bot",
	type: "text",
	body: "",
	attachments: [],
	replyToId: null,
	createdAt,
	editedAt: null,
	streaming: false,
	version: 1,
	run: {
		id: `run_${id}`,
		conversationId: "cnv_test",
		messageId: id,
		userMessageId: `usr_${id}`,
		status: "failed",
		failureReason: reason,
	},
	...extra,
});
const said = (id: string, createdAt: string): Message => ({
	...failed(id, "x", createdAt),
	senderId: "mem_owner",
	senderKind: "person",
	body: "再试一次",
	run: null,
});

test("three identical failures in a row are one line with a count, on the newest reply", () => {
	const blocks = groupMessages([
		failed("msg_1", "idle_timeout", "2026-11-23T01:00:00.000Z"),
		failed("msg_2", "idle_timeout", "2026-11-23T01:00:10.000Z"),
		failed("msg_3", "idle_timeout", "2026-11-23T01:00:20.000Z"),
	]);
	const runs = blocks.flatMap((block) => ("run" in block ? [block] : []));
	expect(runs).toHaveLength(1);
	expect(runs[0]?.run.map((message) => message.id)).toEqual(["msg_3"]);
	expect(runs[0]?.repeats?.get("msg_3")).toBe(3);
	expect(runs[0]?.repeats?.size).toBe(1);
});

test("a different reason, a message between, or a reply that said something breaks the run of failures", () => {
	const blocks = groupMessages([
		failed("msg_1", "idle_timeout", "2026-11-23T01:00:00.000Z"),
		failed("msg_2", "tool_repeat", "2026-11-23T01:00:05.000Z"),
		failed("msg_3", "tool_repeat", "2026-11-23T01:00:10.000Z"),
		said("msg_4", "2026-11-23T01:00:15.000Z"),
		failed("msg_5", "tool_repeat", "2026-11-23T01:00:20.000Z"),
		failed("msg_6", "tool_repeat", "2026-11-23T01:00:25.000Z", { body: "查到一半" }),
	]);
	const runs = blocks.flatMap((block) => ("run" in block ? [block] : []));
	expect(runs.map((block) => block.run.map((message) => message.id))).toEqual([
		["msg_1", "msg_3"],
		["msg_4"],
		["msg_5", "msg_6"],
	]);
	expect(runs[0]?.repeats?.get("msg_3")).toBe(2);
	expect(runs[0]?.repeats?.get("msg_1")).toBeUndefined();
	expect(runs[2]?.repeats).toBeUndefined();
});

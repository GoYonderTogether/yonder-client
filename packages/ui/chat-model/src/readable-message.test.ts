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

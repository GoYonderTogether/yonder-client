import type { Message } from "@yonder/protocol";
import { expect, test } from "vitest";
import { newestReadableMessage } from "./index.ts";

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

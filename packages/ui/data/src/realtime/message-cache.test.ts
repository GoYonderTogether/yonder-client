import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Message, MessagePage } from "@yonder/protocol";
import { expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { updateMessage, updateRun } from "./message-cache.ts";

test("nonce confirms one optimistic message and streaming updates replace one reply", () => {
	const client = new QueryClient();
	client.setQueryData(keys.messages.latest("c"), {
		pages: [{ items: [], nextCursor: null, hasMore: false }],
		pageParams: [undefined],
	});
	const base: Message = {
		id: "temp_n",
		conversationId: "c",
		senderId: "p",
		senderKind: "person",
		type: "text",
		body: "hello",
		attachments: [],
		replyToId: null,
		createdAt: "2026-01-01T00:00:00Z",
		editedAt: null,
		streaming: false,
		version: 0,
		clientNonce: "n",
	};
	updateMessage(client, { ...base, pending: true });
	updateMessage(client, { ...base, id: "m1", version: 1 });
	const reply: Message = {
		...base,
		id: "m2",
		senderKind: "bot",
		body: "one",
		clientNonce: null,
		streaming: true,
		version: 1,
	};
	updateMessage(client, reply);
	updateMessage(client, { ...reply, body: "one two", version: 2 });
	updateMessage(client, reply); // An older event must not rewind a streamed message.
	updateRun(client, {
		id: "r",
		conversationId: "c",
		messageId: "m2",
		userMessageId: "m1",
		status: "failed",
		failureReason: "model_not_configured",
	});
	const items = client.getQueryData<InfiniteData<MessagePage>>(keys.messages.latest("c"))?.pages[0]?.items;
	expect(items).toHaveLength(2);
	expect(items?.[0]?.id).toBe("m1");
	expect(items?.[1]?.body).toBe("one two");
	expect(items?.[1]?.run?.failureReason).toBe("model_not_configured");
});

test("an empty Bot placeholder does not hide the last visible message", () => {
	const client = new QueryClient();
	const key = keys.conversations.list();
	client.setQueryData(key, { items: [{ id: "c", lastMessageAt: null, lastMessage: null }] });
	const user: Message = {
		id: "m1",
		conversationId: "c",
		senderId: "person",
		senderKind: "person",
		type: "text",
		body: "hello",
		attachments: [],
		replyToId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		editedAt: null,
		streaming: false,
		version: 1,
	};
	const bot: Message = {
		...user,
		id: "m2",
		senderId: "bot",
		senderKind: "bot",
		body: "",
		createdAt: "2026-01-01T00:00:01.000Z",
		streaming: true,
	};
	updateMessage(client, user);
	updateMessage(client, bot);
	expect(client.getQueryData<{ items: { lastMessage: { body: string } }[] }>(key)?.items[0]?.lastMessage.body).toBe(
		"hello",
	);
	updateMessage(client, { ...bot, body: "answer", version: 2 });
	expect(client.getQueryData<{ items: { lastMessage: { body: string } }[] }>(key)?.items[0]?.lastMessage.body).toBe(
		"answer",
	);
});

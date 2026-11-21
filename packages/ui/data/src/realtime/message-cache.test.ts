import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Conversation, Message, MessagePage } from "@yonder/protocol";
import { expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "./events.ts";
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

test("tool activity survives later streamed messages and terminal run events", () => {
	const client = new QueryClient();
	const message: Message = {
		id: "reply",
		conversationId: "c",
		senderId: "bot",
		senderKind: "bot",
		type: "text",
		body: "a",
		attachments: [],
		replyToId: null,
		createdAt: "2026-01-01T00:00:00Z",
		editedAt: null,
		streaming: true,
		version: 1,
	};
	client.setQueryData(keys.messages.latest("c"), {
		pages: [{ items: [message], nextCursor: null, hasMore: false }],
		pageParams: [undefined],
	});
	const run = { id: "r", conversationId: "c", messageId: "reply", userMessageId: "u", status: "running" as const };
	updateRun(client, { ...run, activity: [{ label: "看了日历" }] });
	updateMessage(client, { ...message, version: 2, body: "ab", run });
	updateRun(client, { ...run, status: "completed" });
	const saved = client.getQueryData<InfiniteData<MessagePage>>(keys.messages.latest("c"))?.pages[0]?.items[0];
	expect(saved?.run?.activity).toEqual([{ label: "看了日历" }]);
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
	const voice = { durationMs: 1000 };
	updateMessage(client, { ...user, id: "m3", createdAt: "2026-01-01T00:00:02.000Z", body: null, voice });
	expect(client.getQueryData(key)).toMatchObject({ items: [{ lastMessage: { body: null, voice } }] });
});

test("a history clear invalidates old pages and prevents delayed messages from restoring the history or its preview", async () => {
	const client = new QueryClient();
	const listKey = keys.conversations.list();
	const historyKey = keys.messages.latest("c");
	const old: Message = {
		id: "last-before-clear",
		conversationId: "c",
		senderId: "p",
		senderKind: "person",
		type: "text",
		body: "old",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-20T00:00:01.000Z",
		editedAt: null,
		streaming: false,
		version: 1,
	};
	const pending = { ...old, id: "temp_pending", clientNonce: "pending", body: "unsent", pending: true };
	const previous: Conversation = {
		id: "c",
		kind: "direct",
		title: null,
		members: [],
		pinned: false,
		version: 1,
		unreadCount: 1,
		lastMessageAt: old.createdAt,
		lastMessage: { body: old.body, senderKind: old.senderKind, createdAt: old.createdAt },
	};
	const original = { items: [old, pending], nextCursor: old.id, hasMore: true };
	client.setQueryData(listKey, { items: [previous] });
	client.setQueryData(historyKey, {
		pages: [original, { ...original, items: [{ ...old, id: "older" }] }],
		pageParams: [undefined, old.id],
	});
	let finish: (page: MessagePage) => void = () => {};
	const request = client
		.fetchInfiniteQuery({
			queryKey: historyKey,
			initialPageParam: undefined,
			queryFn: () =>
				new Promise<MessagePage>((resolve) => {
					finish = resolve;
				}),
		})
		.catch(() => {});
	const historyClearedThrough = { messageId: old.id, createdAt: "2026-11-20T00:00:01.000041Z" };
	applyServerEvent(client, {
		type: "conversation.updated",
		eventId: "clear",
		at: old.createdAt,
		conversation: {
			...previous,
			lastMessageAt: null,
			lastMessage: null,
			unreadCount: 0,
			version: 2,
			historyClearedThrough,
		},
	});
	finish(original);
	await request;
	applyServerEvent(client, { type: "message.updated", eventId: "old", at: old.createdAt, message: old });
	expect(client.getQueryData(listKey)).toMatchObject({ items: [{ lastMessage: null, unreadCount: 0 }] });
	const current = client.getQueryData<InfiniteData<MessagePage>>(historyKey);
	expect(current?.pages).toEqual([{ items: [pending], nextCursor: null, hasMore: false, historyClearedThrough }]);
	const next = { ...old, id: "next", body: "next", createdAt: "2026-11-20T00:00:01.001Z" };
	applyServerEvent(client, { type: "message.created", eventId: "next", at: next.createdAt, message: next });
	expect(client.getQueryData(listKey)).toMatchObject({ items: [{ lastMessage: { body: "next" } }] });
	expect(client.getQueryData<InfiniteData<MessagePage>>(historyKey)?.pages[0]?.items).toEqual([pending, next]);
	client.clear();
});

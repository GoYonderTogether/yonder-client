// @vitest-environment jsdom
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Message, MessagePage } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { createPersister } from "../query/client.ts";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "../realtime/events.ts";
import { updateRun } from "../realtime/message-cache.ts";
import { createMemoryStorage } from "../storage/index.ts";
import { useDeleteMessage, useMessageFeedback } from "./message-actions.ts";

const data = vi.hoisted(() => ({
	api: { messageFeedback: vi.fn(), deleteMessage: vi.fn() },
	flushQueryCache: vi.fn(),
}));
vi.mock("../query/provider.tsx", () => ({ useApi: () => data.api, useData: () => data }));

const source: Message = {
	id: "source",
	conversationId: "chat",
	senderId: "bot",
	senderKind: "bot",
	type: "text",
	body: "original",
	attachments: [],
	replyToId: null,
	createdAt: "2026-11-27T00:00:00.000Z",
	editedAt: null,
	streaming: false,
	version: 1,
	feedback: "up",
};
const key = keys.messages.latest(source.conversationId);
const previewKey = keys.conversations.list();
const reply = {
	...source,
	id: "reply",
	replyToId: source.id,
	replyTo: { id: source.id, senderId: source.senderId, snippet: "original" },
};

function setup() {
	const client = new QueryClient();
	client.setQueryData(key, {
		pages: [{ items: [source, reply], nextCursor: null, hasMore: false }],
		pageParams: [undefined],
	});
	client.setQueryData(previewKey, {
		items: [{ id: source.conversationId, lastMessage: { body: source.body, createdAt: source.createdAt } }],
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return {
		client,
		wrapper,
		rows: () => client.getQueryData<InfiniteData<MessagePage>>(key)?.pages[0]?.items,
	};
}

test("feedback immediately replaces the selection and rolls back only that field on failure", async () => {
	const { client, wrapper, rows } = setup();
	let reject: (error: Error) => void = () => {};
	data.api.messageFeedback.mockImplementationOnce(() => new Promise((_, fail) => (reject = fail)));
	const hook = renderHook(() => useMessageFeedback(source.conversationId), { wrapper });
	act(() => hook.result.current.mutate({ messageId: source.id, value: "down" }));
	await waitFor(() => expect(rows()?.[0]?.feedback).toBe("down"));
	expect(data.api.messageFeedback).toHaveBeenCalledWith(source.id, "down");

	const run = {
		conversationId: source.conversationId,
		messageId: source.id,
		userMessageId: "prompt",
		id: "run",
		status: "completed" as const,
	};
	updateRun(client, run);
	reject(new Error("unavailable"));
	await waitFor(() => expect(hook.result.current.isError).toBe(true));
	expect(rows()?.[0]).toMatchObject({ feedback: "up", run });

	const { feedback: _feedback, ...cleared } = source;
	data.api.messageFeedback.mockResolvedValueOnce(cleared);
	act(() => hook.result.current.mutate({ messageId: source.id, value: null }));
	await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
	expect(rows()?.[0]).not.toHaveProperty("feedback");
	client.clear();
});

test("confirmed deletion removes the row, redacts the preview and quote, and persists before returning", async () => {
	const { client, wrapper, rows } = setup();
	const persister = createPersister(createMemoryStorage());
	const unsubscribe = persistQueryClientSubscribe({ queryClient: client, persister });
	data.flushQueryCache.mockImplementation(persister.flush);
	data.api.deleteMessage.mockResolvedValueOnce({ ok: true });
	const hook = renderHook(() => useDeleteMessage(source.conversationId), { wrapper });
	await act(async () => {
		await hook.result.current.mutateAsync(source.id);
	});
	expect(data.api.deleteMessage).toHaveBeenCalledWith(source.id);
	expect(rows()).toEqual([{ ...reply, replyTo: { ...reply.replyTo, snippet: "", missing: true } }]);
	expect(client.getQueryData(previewKey)).toMatchObject({ items: [{ lastMessage: null }] });
	const persisted = (await persister.restoreClient())?.clientState.queries.find(
		({ queryKey }) => queryKey[0] === "messages",
	);
	expect(persisted?.state.data).toMatchObject({ pages: [{ items: rows() }] });
	applyServerEvent(client, { type: "message.updated", eventId: "old", at: source.createdAt, message: source });
	expect(rows()).toHaveLength(1);
	unsubscribe();
	persister.dispose();
	client.clear();
});

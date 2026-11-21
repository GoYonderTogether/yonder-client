// @vitest-environment jsdom
import type { Message, ServerEvent } from "@yonder/protocol";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	messages: vi.fn(),
	conversations: vi.fn(),
	retry: vi.fn(),
	stop: vi.fn(),
	send: vi.fn(),
	rejectPendingWrites: false,
	subscribe: vi.fn(),
	owner: "a",
	store: new Map<string, unknown>(),
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: (key: string) => mock.store.get(key),
		setStorageSync: (key: string, value: unknown) => {
			if (mock.rejectPendingWrites && Array.isArray(value) && value.length) throw new Error("storage full");
			mock.store.set(key, value);
		},
	},
	useDidShow: () => {},
}));
vi.mock("../../lib/i18n", () => ({ t: (zh: string) => zh }));
vi.mock("../../lib/runtime", () => ({
	api: {
		messages: mock.messages,
		conversations: mock.conversations,
		retryMessage: mock.retry,
		stopMessage: mock.stop,
		sendMessage: mock.send,
	},
	newNonce: () => "nonce",
	subscribeEvents: mock.subscribe,
	useRealtimeRevision: () => 0,
	useSession: () => ({ status: "signed-in", me: { member: { id: mock.owner } } }),
}));

import { useChat } from "./use-chat";

let state: ReturnType<typeof useChat>;
function Probe({ id }: { id: string }) {
	state = useChat(id);
	return null;
}
const row: Message = {
	id: "old",
	conversationId: "one",
	senderId: "a",
	senderKind: "person",
	type: "text",
	body: "old",
	attachments: [],
	replyToId: null,
	createdAt: "2026-01-01",
	editedAt: null,
	streaming: false,
	version: 1,
};

test("coalesces initial history and ignores a late result from the old scope", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.store.clear();
	mock.messages.mockReset();
	mock.conversations.mockResolvedValue({ items: [] });
	let resolveOld: (value: unknown) => void = () => {};
	mock.messages
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveOld = resolve;
				}),
		)
		.mockResolvedValue({ items: [], nextCursor: null });
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	expect(mock.messages).toHaveBeenCalledTimes(1);
	mock.owner = "b";
	await act(async () => root.render(createElement(Probe, { id: "two" })));
	await act(async () => {
		resolveOld({ items: [row], nextCursor: null });
		await Promise.resolve();
	});
	expect(state.messages).toEqual([]);
	expect(state.conversation).toBeUndefined();
	await act(async () => root.unmount());
});

test("retries the original user message once for a failed run", async () => {
	mock.owner = "a";
	mock.store.clear();
	mock.messages.mockReset().mockResolvedValue({ items: [], nextCursor: null });
	mock.retry.mockReset();
	let finish: (value: unknown) => void = () => {};
	mock.retry.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	const failed: Message = {
		...row,
		senderKind: "bot",
		run: { id: "run", messageId: row.id, conversationId: "one", userMessageId: "original", status: "failed" },
	};
	let first: Promise<void> | undefined;
	await act(async () => {
		first = state.action(failed);
		void state.action(failed);
	});
	expect(mock.retry).toHaveBeenCalledTimes(1);
	expect(mock.retry).toHaveBeenCalledWith("original", "nonce");
	await act(async () => {
		finish({ message: row });
		await first;
	});
	await act(async () => root.unmount());
});

test("a queued, running, or streaming assistant reply cannot be stopped or retried by the chat action", async () => {
	mock.owner = "a";
	mock.store.clear();
	mock.messages.mockReset().mockResolvedValue({ items: [], nextCursor: null });
	mock.retry.mockClear();
	mock.stop.mockClear();
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	const assistant: Message = { ...row, senderKind: "bot" };
	const run = { id: "run", messageId: row.id, conversationId: "one", userMessageId: "original" };
	await act(async () => {
		await state.action({ ...assistant, run: { ...run, status: "queued" } });
		await state.action({ ...assistant, run: { ...run, status: "running" } });
		await state.action({ ...assistant, streaming: true });
	});
	expect(mock.stop).not.toHaveBeenCalled();
	expect(mock.retry).not.toHaveBeenCalled();
	await act(async () => root.unmount());
});

test("does not send or clear the user's draft if the outbox cannot be saved", async () => {
	mock.owner = "a";
	mock.store.clear();
	mock.messages.mockReset().mockResolvedValue({ items: [], nextCursor: null });
	mock.send.mockReset();
	mock.rejectPendingWrites = true;
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	let result: boolean | undefined;
	await act(async () => {
		result = await state.send("keep this", [], []);
	});
	expect(result).toBeUndefined();
	expect(mock.send).not.toHaveBeenCalled();
	expect(state.error).toContain("无法保存");
	mock.rejectPendingWrites = false;
	await act(async () => root.unmount());
});

test("coalesces the same older cursor while latest refresh and older page interleave", async () => {
	mock.owner = "a";
	mock.store.clear();
	mock.messages.mockReset();
	mock.messages.mockResolvedValueOnce({ items: [row], nextCursor: "older-1" });
	let finishOlder: (value: unknown) => void = () => {};
	mock.messages
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishOlder = resolve;
				}),
		)
		.mockResolvedValueOnce({ items: [row], nextCursor: "latest-cursor" });
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	expect(state.cursor).toBe("older-1");
	expect(state.hasFullHistory).toBe(false);
	let first: Promise<boolean> = Promise.resolve(false);
	let second: Promise<boolean> = Promise.resolve(false);
	await act(async () => {
		first = state.load(true);
		second = state.load(true);
	});
	expect(first).toBe(second);
	expect(state.olderLoading).toBe(true);
	await act(async () => {
		await state.load();
	});
	expect(state.cursor).toBe("older-1");
	await act(async () => {
		finishOlder({ items: [{ ...row, id: "earlier", createdAt: "2025-01-01" }], nextCursor: "older-2" });
		await first;
	});
	expect(state.cursor).toBe("older-2");
	expect(state.messages.map((message) => message.id)).toEqual(["earlier", "old"]);
	expect(state.olderLoading).toBe(false);
	expect(mock.messages).toHaveBeenCalledTimes(3);
	mock.messages.mockResolvedValueOnce({ items: [], nextCursor: null });
	await act(async () => {
		await state.load(true);
	});
	mock.messages.mockResolvedValueOnce({ items: [row], nextCursor: "latest-cursor" });
	await act(async () => {
		await state.load();
	});
	expect(state.cursor).toBe("latest-cursor");
	expect(state.hasFullHistory).toBe(true);
	await act(async () => root.unmount());
});

test("clears loaded pages on another device's reset without merging a late page or dropping pending outbox", async () => {
	mock.owner = "a";
	mock.store.clear();
	const failed = { ...row, id: "temp_unsent", clientNonce: "unsent" };
	mock.store.set("yonder.mini.outbox.a.one", [failed]);
	mock.messages.mockReset().mockResolvedValueOnce({ items: [row], nextCursor: "old-cursor" });
	let finishOlder: (page: unknown) => void = () => {};
	mock.messages.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishOlder = resolve;
			}),
	);
	const cutoff = { messageId: row.id, createdAt: "2026-01-01T00:00:00.000001Z" };
	// Only the authoritative response can order two database rows within the same millisecond.
	const surviving = { ...row, id: "same-millisecond", body: "sent after clear", createdAt: "2026-01-01T00:00:00.000Z" };
	mock.messages.mockResolvedValue({ items: [surviving], nextCursor: null, historyClearedThrough: cutoff });
	let emit: (event: ServerEvent) => void = () => {};
	mock.subscribe.mockImplementation((listener) => {
		emit = listener;
		return () => {};
	});
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(createElement(Probe, { id: "one" })));
	await act(async () => {
		void state.load(true);
	});
	await act(async () => {
		emit({
			type: "conversation.updated",
			eventId: "clear",
			at: row.createdAt,
			conversation: {
				id: "one",
				kind: "direct",
				title: null,
				members: [],
				pinned: true,
				unreadCount: 0,
				lastMessageAt: null,
				version: 2,
				historyClearedThrough: cutoff,
			},
		});
	});
	await act(async () => {
		finishOlder({ items: [row], nextCursor: "older-cursor" });
		emit({ type: "message.created", eventId: "old", at: row.createdAt, message: row });
	});
	expect(state.messages.map((message) => message.id)).toEqual([failed.id, surviving.id]);
	expect(state.cursor).toBeNull();
	expect(state.hasFullHistory).toBe(true);
	await act(async () => root.unmount());
	mock.subscribe.mockReset();
});

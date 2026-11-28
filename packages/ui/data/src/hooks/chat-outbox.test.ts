import { QueryClient } from "@tanstack/react-query";
import { ApiClient, ApiError, createEndpoints, type Endpoints } from "@yonder/api-client";
import { beforeEach, expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { outboxCacheKey } from "../storage/chat-cache.ts";
import { chatOutbox, type OutboxRecord, outgoingMessage, type SendInput } from "./chat-outbox.ts";

const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../storage/chat-cache.ts", async (original) => ({
	...(await original<typeof import("../storage/chat-cache.ts")>()),
	listChatCache: async (prefix: string) =>
		[...records.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value),
	readChatCache: async (key: string) => records.get(key),
	writeChatCache: async (key: string, record: unknown) => records.set(key, record),
	updateChatCache: async (key: string, apply: (value: unknown) => unknown) => {
		const value = apply(records.get(key));
		if (value === undefined) records.delete(key);
		else records.set(key, value);
		return value;
	},
	removeChatCache: async (key: string) => records.delete(key),
}));

const alice = { member: { id: "alice" } };
const first: SendInput = { type: "text", body: "A private draft", clientNonce: "first" };
function query() {
	const client = new QueryClient();
	client.setQueryData(keys.me(), alice);
	return client;
}

beforeEach(() => records.clear());

test("a 401 never replays the queued write using another account's refreshed cookie", async () => {
	let accessToken: string | null = "alice-token";
	const writes: RequestInit[] = [];
	const authenticated: string[] = [];
	const client = new ApiClient({
		baseUrl: "https://chat.test",
		appVersion: "test",
		clientKind: "web",
		tokens: {
			getAccessToken: () => accessToken,
			setAccessToken: (token) => {
				accessToken = token;
			},
		},
		async fetch(url, init) {
			if (url.endsWith("/auth/refresh")) return Response.json({ accessToken: "bob-token" });
			if (url.endsWith("/me")) {
				const member = new Headers(init.headers).get("authorization") === "Bearer alice-token" ? "alice" : "bob";
				authenticated.push(member);
				return Response.json({ member: { id: member } });
			}
			writes.push(init);
			return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
		},
	});
	const outbox = chatOutbox(query(), createEndpoints(client));
	const stop = outbox.start(
		() => client.accessToken,
		() => client.refreshSession({ throwOnUnavailable: true }),
	);
	try {
		await outbox.enqueue("shared-group", "alice", first);
		await vi.waitFor(() => expect(client.accessToken).toBe("bob-token"));
		outbox.resume();
		await vi.waitFor(() => expect(authenticated).toEqual(["alice", "bob"]));
		expect(writes).toHaveLength(1);
		expect(new Headers(writes[0]?.headers).get("authorization")).toBe("Bearer alice-token");
		expect(records.get(outboxCacheKey("alice", "shared-group", first.clientNonce))).toMatchObject({
			message: { pending: true, senderId: "alice" },
		});
	} finally {
		stop();
	}
});

test("a restarted outbox resumes the original file message and does not re-upload confirmed bytes", async () => {
	const sendMessage = vi.fn();
	sendMessage.mockRejectedValueOnce(
		new ApiError({ status: 503, code: "upstream_unavailable", message: "Temporarily unavailable" }),
	);
	sendMessage.mockImplementation(async (id, request) => ({
		message: { ...outgoingMessage(id, "alice", request), id: "server-message", version: 1, pending: false },
		clientNonce: request.clientNonce,
	}));
	const uploadAttachment = vi.fn().mockResolvedValue({ id: "uploaded" });
	const api = { me: async () => alice, sendMessage, uploadAttachment } as unknown as Endpoints;
	const firstOutbox = chatOutbox(query(), api);
	const stop = firstOutbox.start(
		() => "alice-token",
		async () => true,
	);
	const key = outboxCacheKey("alice", "shared-group", first.clientNonce);
	try {
		await firstOutbox.enqueue("shared-group", "alice", {
			...first,
			files: [{ nonce: "file-1", name: "reply.txt", kind: "file", mimeType: "text/plain", blob: new Blob(["bytes"]) }],
		});
		await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
	} finally {
		stop();
	}
	expect((records.get(key) as OutboxRecord).files[0]?.uploaded?.id).toBe("uploaded");

	const restarted = chatOutbox(query(), api);
	const stopRestarted = restarted.start(
		() => "alice-token",
		async () => true,
	);
	try {
		await vi.waitFor(() => expect(records.has(key)).toBe(false));
		expect(uploadAttachment).toHaveBeenCalledOnce();
		expect(sendMessage.mock.calls).toEqual([
			["shared-group", { ...first, attachmentIds: ["uploaded"] }, { retried: true }],
			["shared-group", { ...first, attachmentIds: ["uploaded"] }, { retried: true }],
		]);
	} finally {
		stopRestarted();
	}
});

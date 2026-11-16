import { expect, test } from "vitest";
import type { CachedMessage } from "./chat.ts";
import { mergeOutbox } from "./chat.ts";

test("server confirmations replace the same nonce while unconfirmed sends survive a history refresh", () => {
	const message = {
		id: "temp_1",
		clientNonce: "1",
		pending: true,
		attachments: [{ id: "att_1" }],
	} as unknown as CachedMessage;
	const confirmed = { ...message, id: "msg_1", pending: false };
	const retry = { ...message, id: "temp_2", clientNonce: "2" };
	const result = mergeOutbox([confirmed], [message, retry]);
	expect(result).toHaveLength(2);
	expect(result[0]?.id).toBe("msg_1");
	expect(result[1]).toMatchObject({
		clientNonce: "2",
		pending: false,
		sendFailed: true,
		attachments: [{ id: "att_1" }],
	});
});

test("a history refresh during a reconnect keeps an in-flight send as sending", () => {
	const inFlight = {
		id: "temp_1",
		clientNonce: "1",
		pending: true,
		attachments: [],
	} as unknown as CachedMessage;
	const result = mergeOutbox([], [inFlight], new Set(["1"]));
	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({ clientNonce: "1", pending: true, sendFailed: false });
});

test("an outbox entry whose request already failed is still shown as failed", () => {
	const settled = { id: "temp_2", clientNonce: "2", pending: true, attachments: [] } as unknown as CachedMessage;
	const result = mergeOutbox([], [settled], new Set());
	expect(result[0]).toMatchObject({ pending: false, sendFailed: true });
});

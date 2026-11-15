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

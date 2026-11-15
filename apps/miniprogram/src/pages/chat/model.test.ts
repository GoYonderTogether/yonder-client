import type { Message } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { mergeMessages, updateRun } from "./model";

const message = (id: string, version = 1, clientNonce?: string): Message => ({
	id,
	version,
	clientNonce,
	conversationId: "c",
	senderId: "u",
	senderKind: "person",
	type: "text",
	body: id,
	attachments: [],
	replyToId: null,
	createdAt: "2026-11-15T00:00:00Z",
	editedAt: null,
	streaming: false,
});
describe("mini chat reconciliation", () => {
	it("deduplicates an optimistic send and rejects an older realtime payload", () => {
		const optimistic = message("temp_n", 0, "n");
		const accepted = message("real", 2, "n");
		expect(mergeMessages([optimistic], [accepted, message("real", 1)])).toEqual([accepted]);
	});
	it("keeps an older page and a newly streamed message together", () => {
		const current = message("current");
		const older = { ...message("older"), createdAt: "2026-11-14T00:00:00Z" };
		expect(mergeMessages([current], [older]).map((row) => row.id)).toEqual(["older", "current"]);
	});
	it("updates only the message that owns a run", () => {
		const run = { id: "r", conversationId: "c", messageId: "real", userMessageId: "u", status: "completed" as const };
		expect(
			updateRun([{ ...message("real"), streaming: true }, message("other")], run).map((row) => row.streaming),
		).toEqual([false, false]);
	});
});

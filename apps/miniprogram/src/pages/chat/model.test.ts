import type { Message } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { conversationTitle, directPartner, groupChatMessages, mergeMessages, updateRun } from "./model";

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

it("retains a received run when a newer message snapshot omits it", () => {
	const run = { id: "r", conversationId: "c", messageId: "real", userMessageId: "u", status: "completed" as const };
	const previous = { ...message("real", 2), run };
	const next = { ...message("real", 3), body: "final", run: null };
	expect(mergeMessages([previous], [next])[0]).toMatchObject({ body: "final", run });
});

describe("runs in the message list", () => {
	const row = (id: string, senderId: string, type: "text" | "system" = "text") => ({ id, senderId, type });
	it("keeps a system line alone between the runs around it", () => {
		const runs = groupChatMessages([row("a", "u"), row("b", "u"), row("s", "u", "system"), row("c", "u")]);
		expect(runs.map((run) => run.map((item) => item.id))).toEqual([["a", "b"], ["s"], ["c"]]);
	});
	it("does not let two adjacent system lines share a run", () => {
		const runs = groupChatMessages([row("s1", "u", "system"), row("s2", "u", "system")]);
		expect(runs.map((run) => run.map((item) => item.id))).toEqual([["s1"], ["s2"]]);
	});
	it("still groups two messages from the same sender", () => {
		expect(groupChatMessages([row("a", "u"), row("b", "u")]).length).toBe(1);
	});
});

describe("who a chat is about", () => {
	const member = (memberId: string, displayName: string, role?: string) => ({ memberId, displayName, role });
	it("skips an observer when naming a direct chat and its title", () => {
		const members = [member("me", "Me", "member"), member("watcher", "Watcher", "observer"), member("bob", "Bob")];
		expect(directPartner(members, "me")?.memberId).toBe("bob");
		expect(conversationTitle(members, "me")).toBe("Bob");
	});
	it("does not assume one other member", () => {
		const members = [member("me", "Me"), member("bob", "Bob"), member("ann", "Ann")];
		expect(conversationTitle(members, "me")).toBe("Bob、Ann");
	});
});

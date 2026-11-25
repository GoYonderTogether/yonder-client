import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "./events.ts";

function row(id: string) {
	return {
		id,
		conversationId: "c",
		senderId: "bot",
		senderKind: "bot" as const,
		type: "text" as const,
		body: id === "kept" ? "hello" : "",
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-26T00:00:00Z",
		editedAt: null,
		streaming: id === "blank",
		version: 1,
	};
}

describe("message.removed", () => {
	test("a withdrawn reply row leaves the open history, keeps the rest, and refreshes the list", () => {
		const client = new QueryClient();
		const history = keys.messages.latest("c");
		client.setQueryData(history, { pages: [{ items: [row("kept"), row("blank")] }], pageParams: [undefined] });
		client.setQueryData(keys.conversations.list(), { items: [] });
		applyServerEvent(client, {
			type: "message.removed",
			eventId: "removed-event",
			at: "2026-11-26T00:00:01Z",
			conversationId: "c",
			messageId: "blank",
		});
		const after = client.getQueryData<{ pages: { items: { id: string }[] }[] }>(history);
		expect(after?.pages[0]?.items.map((item) => item.id)).toEqual(["kept"]);
		expect(client.getQueryState(keys.conversations.list())?.isInvalidated).toBe(true);
		client.clear();
	});

	test("a withdrawn row in a conversation that is not open creates no history cache", () => {
		const client = new QueryClient();
		applyServerEvent(client, {
			type: "message.removed",
			eventId: "removed-closed",
			at: "2026-11-26T00:00:01Z",
			conversationId: "closed",
			messageId: "blank",
		});
		expect(client.getQueryData(keys.messages.latest("closed"))).toBeUndefined();
		client.clear();
	});
});

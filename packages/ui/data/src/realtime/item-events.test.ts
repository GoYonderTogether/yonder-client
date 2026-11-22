import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "./events.ts";

test("task mutations refresh only the affected task and conversation history", () => {
	const client = new QueryClient();
	const changed = [
		keys.items.list(null),
		keys.items.detail("meeting"),
		keys.items.session("task"),
		keys.messages.latest("task"),
		keys.messages.page("task", "older"),
	];
	const unrelated = [keys.items.detail("other"), keys.messages.latest("other")];
	for (const key of [...changed, ...unrelated]) client.setQueryData(key, {});
	applyServerEvent(client, {
		type: "conversation.state_changed",
		eventId: "archived",
		at: "2026-11-21T00:00:00Z",
		conversationId: "task",
		itemId: "meeting",
	});
	for (const key of changed) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
	for (const key of unrelated) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
	client.clear();
});

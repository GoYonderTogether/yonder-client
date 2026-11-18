import { QueryClient } from "@tanstack/react-query";
import type { FriendRequest } from "@yonder/protocol";
import { expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "./events.ts";
import { writeFriendRequest } from "./friend-request-cache.ts";

const pending = { id: "request", status: "pending", version: 1 } as FriendRequest;
test("accept updates both request views and stale events cannot undo it after contact deletion", () => {
	const client = new QueryClient();
	client.setQueryData(keys.friendRequests.list(), { items: [pending] });
	writeFriendRequest(client, pending);
	const accepted = { ...pending, status: "accepted", version: 2, acceptedAt: "2026-11-18T00:00:00Z" } as FriendRequest;
	applyServerEvent(client, {
		type: "friend_request.updated",
		eventId: "event",
		at: "2026-11-18T00:00:00Z",
		request: accepted,
	});
	client.setQueryData(keys.contacts(), { items: [] });
	writeFriendRequest(client, pending);
	expect(client.getQueryData(keys.friendRequests.detail("request"))).toEqual({ request: accepted });
	expect(client.getQueryData(keys.friendRequests.list())).toEqual({ items: [accepted] });
});

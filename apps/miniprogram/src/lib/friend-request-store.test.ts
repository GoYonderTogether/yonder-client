import type { FriendRequest } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { createFriendRequestStore, friendRequestStore } from "./friend-request-store";

const pending = { id: "request", status: "pending", version: 1 } as FriendRequest;
const accepted = { ...pending, status: "accepted", version: 2 } as FriendRequest;
test("two views update together and stale HTTP or reconnect snapshots never undo socket acceptance", () => {
	const store = createFriendRequestStore();
	const contacts = vi.fn();
	const notifications = vi.fn();
	store.subscribe(contacts);
	store.subscribe(notifications);
	store.merge([pending]);
	store.merge([accepted]);
	store.merge([]);
	store.merge([pending]);
	expect(store.snapshot()).toEqual([accepted]);
	expect(contacts).toHaveBeenCalledTimes(4);
	expect(notifications).toHaveBeenCalledTimes(4);
	// Removing a relationship is deliberately not an operation on historic requests.
	expect(store.snapshot()[0]?.status).toBe("accepted");
});
test("account switch exposes no previous user's requests, including late HTTP completion", () => {
	const old = friendRequestStore("alice");
	old.merge([pending]);
	const next = friendRequestStore("bob");
	old.merge([accepted]);
	expect(next.snapshot()).toEqual([]);
	expect(friendRequestStore("bob")).toBe(next);
});

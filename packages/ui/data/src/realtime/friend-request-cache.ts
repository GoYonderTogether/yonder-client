import type { QueryClient } from "@tanstack/react-query";
import type { FriendRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
export function writeFriendRequest(client: QueryClient, request: FriendRequest) {
	client.setQueryData<{ request: FriendRequest }>(keys.friendRequests.detail(request.id), (old) =>
		old && old.request.version > request.version ? old : { request },
	);
	client.setQueryData<{ items: FriendRequest[] }>(keys.friendRequests.list(), (old) => ({
		items: old?.items.some((item) => item.id === request.id)
			? old.items.map((item) => (item.id === request.id && item.version <= request.version ? request : item))
			: [request, ...(old?.items ?? [])],
	}));
	if (request.status === "accepted") void client.invalidateQueries({ queryKey: ["member-profile"] });
	void client.invalidateQueries({ queryKey: keys.contacts() });
}

/** A list snapshot can arrive after a newer socket event, including during the first fetch. */
export function mergeFriendRequestList(client: QueryClient, incoming: { items: FriendRequest[] }) {
	const known = client.getQueryData<{ items: FriendRequest[] }>(keys.friendRequests.list());
	const items = new Map(incoming.items.map((request) => [request.id, request]));
	for (const request of known?.items ?? []) {
		const existing = items.get(request.id);
		if (!existing || existing.version < request.version) items.set(request.id, request);
	}
	for (const [id, request] of items) {
		const detail = client.getQueryData<{ request: FriendRequest }>(keys.friendRequests.detail(id));
		if (detail && detail.request.version > request.version) items.set(id, detail.request);
	}
	return { items: [...items.values()] };
}

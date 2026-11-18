import { useEffect, useSyncExternalStore } from "react";
import { friendRequestStore } from "../lib/friend-request-store";
import { api, subscribeEvents, useRealtimeRevision, useSession } from "../lib/runtime";
import { useResource } from "./use-resource";

/** Both surfaces share the same account-scoped versioned requests, including mutation results. */
export function useFriendRequests(id?: string) {
	const session = useSession();
	const owner = session.status === "signed-in" ? (session.me?.member.id ?? "") : "";
	const store = friendRequestStore(owner);
	const items = useSyncExternalStore(store.subscribe, store.snapshot);
	const revision = useRealtimeRevision();
	const resource = useResource(async () => {
		if (id) store.merge([(await api.friendRequest(id)).request]);
		else store.merge((await api.friendRequests()).items);
	});
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "friend_request.updated") store.merge([event.request]);
			}),
		[store],
	);
	useEffect(() => {
		if (revision && owner) void resource.reload();
	}, [revision, owner, resource.reload]);
	return {
		...resource,
		items,
		owner,
		request: async (memberId: string) => {
			const result = await api.requestFriend(memberId);
			store.merge([result.request]);
		},
		accept: async (requestId: string) => {
			const result = await api.acceptFriendRequest(requestId);
			store.merge([result.request]);
		},
	};
}

/** A profile's relationship is server-owned; another device's acceptance changes its primary action. */
export function useFriendProfileRefresh(reload: () => Promise<unknown>) {
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "friend_request.updated" && event.request.status === "accepted") void reload();
			}),
		[reload],
	);
}

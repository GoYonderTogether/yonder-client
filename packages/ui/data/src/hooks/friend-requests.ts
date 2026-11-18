import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FriendRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { mergeFriendRequestList, writeFriendRequest } from "../realtime/friend-request-cache.ts";
export function useFriendRequests() {
	const api = useApi();
	const client = useQueryClient();
	return useQuery({
		queryKey: keys.friendRequests.list(),
		queryFn: async () => mergeFriendRequestList(client, await api.friendRequests()),
	});
}
export function useFriendRequest(id: string) {
	const api = useApi();
	const client = useQueryClient();
	return useQuery({
		queryKey: keys.friendRequests.detail(id),
		queryFn: async () => {
			const next = await api.friendRequest(id);
			const current = client.getQueryData<{ request: FriendRequest }>(keys.friendRequests.detail(id));
			return current && current.request.version > next.request.version ? current : next;
		},
	});
}
export function useFriendRequestActions() {
	const api = useApi();
	const client = useQueryClient();
	return {
		request: useMutation({
			mutationFn: (memberId: string) => api.requestFriend(memberId),
			onSuccess: ({ request }) => writeFriendRequest(client, request),
		}),
		accept: useMutation({
			mutationFn: (id: string) => api.acceptFriendRequest(id),
			onSuccess: ({ request }) => {
				writeFriendRequest(client, request);
				void client.invalidateQueries({ queryKey: keys.conversations.all() });
			},
		}),
	};
}

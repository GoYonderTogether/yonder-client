import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, SendMessageRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { updateMessage } from "../realtime/message-cache.ts";

export type CachedMessage = Message & { pending?: boolean; sendFailed?: boolean };

export function useConversations() {
	const api = useApi();
	return useQuery({ queryKey: keys.conversations.list(), queryFn: () => api.conversations(), staleTime: 60_000 });
}

export function useMessages(conversationId: string | null) {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.messages.latest(conversationId ?? ""),
		queryFn: ({ pageParam }) => api.messages(conversationId ?? "", pageParam),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: Boolean(conversationId),
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always",
	});
}

export function useSendMessage(conversationId: string | null, personId: string | undefined) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (body: SendMessageRequest) => api.sendMessage(conversationId ?? "", body),
		onMutate: async (body) => {
			if (!conversationId) return;
			await client.cancelQueries({ queryKey: keys.messages.latest(conversationId) });
			const message: CachedMessage = {
				id: `temp_${body.clientNonce}`,
				conversationId,
				senderId: personId ?? "",
				senderKind: "person",
				type: "text",
				body: body.body,
				attachments: [],
				replyToId: null,
				createdAt: new Date().toISOString(),
				editedAt: null,
				streaming: false,
				version: 0,
				clientNonce: body.clientNonce,
				pending: true,
			};
			updateMessage(client, message);
		},
		onSuccess: (result) => {
			updateMessage(client, { ...result.message, clientNonce: result.clientNonce });
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
		onError: (_error, body) => {
			if (!conversationId) return;
			updateMessage(client, {
				id: `temp_${body.clientNonce}`,
				conversationId,
				senderId: personId ?? "",
				senderKind: "person",
				type: "text",
				body: body.body,
				attachments: [],
				replyToId: null,
				createdAt: new Date().toISOString(),
				editedAt: null,
				streaming: false,
				version: 0,
				clientNonce: body.clientNonce,
				sendFailed: true,
			});
		},
	});
}

export function useRunActions() {
	const api = useApi();
	const client = useQueryClient();
	return {
		stop: useMutation({ mutationFn: (id: string) => api.stopMessage(id) }),
		retry: useMutation({
			mutationFn: (id: string) => api.retryMessage(id, crypto.randomUUID()),
			onSuccess: (result) => {
				updateMessage(client, result.message);
			},
		}),
	};
}

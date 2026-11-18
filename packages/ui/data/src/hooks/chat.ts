import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attachment, MeResponse, Message, SendMessageRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import type { CachedMessage } from "../realtime/cached-message.ts";
import { updateMessage } from "../realtime/message-cache.ts";
import { listChatCache, outboxCacheKey, removeChatCache, writeChatCache } from "../storage/chat-cache.ts";

export type { CachedMessage };

type SendInput = SendMessageRequest & { attachments?: Attachment[] };

/** Nonces whose request is still in flight in this tab; a history refresh must not call those failed. */
const inFlightSends = new Set<string>();

export function mergeOutbox(
	server: Message[],
	outbox: CachedMessage[],
	inFlight: ReadonlySet<string> = inFlightSends,
): CachedMessage[] {
	const nonces = new Set(server.map((message) => message.clientNonce).filter(Boolean));
	return [
		...server,
		...outbox
			.filter((message) => !nonces.has(message.clientNonce))
			.map((message) =>
				message.clientNonce && inFlight.has(message.clientNonce)
					? { ...message, pending: true, sendFailed: false }
					: { ...message, pending: false, sendFailed: true },
			),
	];
}

export function useConversations() {
	const api = useApi();
	return useQuery({ queryKey: keys.conversations.list(), queryFn: () => api.conversations(), staleTime: 60_000 });
}

export function useMessages(conversationId: string | null) {
	const api = useApi();
	const client = useQueryClient();
	return useInfiniteQuery({
		queryKey: keys.messages.latest(conversationId ?? ""),
		queryFn: async ({ pageParam }) => {
			const page = await api.messages(conversationId ?? "", pageParam);
			const owner = client.getQueryData<MeResponse>(keys.me())?.member.id;
			if (pageParam || !owner || !conversationId) return page;
			const outbox = await listChatCache<CachedMessage>(outboxCacheKey(owner, conversationId)).catch(() => []);
			for (const message of outbox) {
				if (page.items.some((item) => item.clientNonce === message.clientNonce))
					void removeChatCache(outboxCacheKey(owner, conversationId, message.clientNonce ?? "")).catch(() => {});
			}
			return { ...page, items: mergeOutbox(page.items, outbox) };
		},
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
		mutationFn: ({ attachments: _attachments, ...body }: SendInput) => api.sendMessage(conversationId ?? "", body),
		onMutate: async (body) => {
			if (!conversationId) return;
			await client.cancelQueries({ queryKey: keys.messages.latest(conversationId) });
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) throw new Error("session_changed");
			const message: CachedMessage = {
				id: `temp_${body.clientNonce}`,
				conversationId,
				senderId: personId ?? "",
				senderKind: "person",
				type: "text",
				body: body.body,
				attachments: body.attachments ?? [],
				replyToId: null,
				createdAt: new Date().toISOString(),
				editedAt: null,
				streaming: false,
				version: 0,
				clientNonce: body.clientNonce,
				pending: true,
				...(body.skillIds ? { skillIds: body.skillIds } : {}),
			};
			if (personId) {
				// The outbox is a convenience for a reload, not a precondition: a full or blocked store must not
				// stop the request from going out.
				if (body.clientNonce) inFlightSends.add(body.clientNonce);
				void writeChatCache(outboxCacheKey(personId, conversationId, body.clientNonce), message).catch(() => {});
			}
			updateMessage(client, message);
		},
		onSuccess: (result) => {
			if (result.clientNonce) inFlightSends.delete(result.clientNonce);
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) return;
			if (personId && conversationId)
				void removeChatCache(outboxCacheKey(personId, conversationId, result.clientNonce)).catch(() => {});
			updateMessage(client, { ...result.message, clientNonce: result.clientNonce });
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
		onError: (_error, body) => {
			if (body.clientNonce) inFlightSends.delete(body.clientNonce);
			if (!conversationId) return;
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) return;
			updateMessage(client, {
				id: `temp_${body.clientNonce}`,
				conversationId,
				senderId: personId ?? "",
				senderKind: "person",
				type: "text",
				body: body.body,
				attachments: body.attachments ?? [],
				replyToId: null,
				createdAt: new Date().toISOString(),
				editedAt: null,
				streaming: false,
				version: 0,
				clientNonce: body.clientNonce,
				sendFailed: true,
				...(body.skillIds ? { skillIds: body.skillIds } : {}),
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

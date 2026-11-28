import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, Message, MessagePage } from "@yonder/protocol";
import { useEffect } from "react";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import type { CachedMessage } from "../realtime/cached-message.ts";
import { updateMessage } from "../realtime/message-cache.ts";
import {
	chatCacheGeneration,
	listChatCache,
	outboxCacheKey,
	removeChatCache,
	writeChatCache,
} from "../storage/chat-cache.ts";
import { usePerson } from "./account.ts";
import { chatOutbox, type OutboxRecord, outgoingMessage, type SendInput, showOutgoingMessage } from "./chat-outbox.ts";
import { fetchHistoryPage, shareMessageHistory } from "./message-history.ts";

export type { CachedMessage };

/** Nonces whose request is still in flight in this tab; a history refresh must not call those failed. */
const inFlightSends = new Set<string>();

export function mergeOutbox(
	server: Message[],
	outbox: (CachedMessage | OutboxRecord)[],
	inFlight: ReadonlySet<string> = inFlightSends,
): CachedMessage[] {
	const nonces = new Set(server.map((message) => message.clientNonce).filter(Boolean));
	return [
		...server,
		...outbox.flatMap((record) => {
			if ("request" in record) return nonces.has(record.message.clientNonce) ? [] : [record.message];
			if (nonces.has(record.clientNonce)) return [];
			return [
				record.clientNonce && inFlight.has(record.clientNonce)
					? { ...record, pending: true, sendFailed: false }
					: { ...record, pending: false, sendFailed: true },
			];
		}),
	];
}

export function useConversations() {
	const api = useApi();
	return useQuery({ queryKey: keys.conversations.list(), queryFn: () => api.conversations(), staleTime: 60_000 });
}

export function useMessages(
	conversationId: string | null,
	refreshOnMount = false,
	observeWhile?: (history: InfiniteData<MessagePage> | undefined) => boolean,
) {
	const api = useApi();
	const client = useQueryClient();
	const personId = usePerson()?.id;
	useEffect(() => {
		if (!conversationId || !personId) return;
		let active = true;
		const generation = chatCacheGeneration();
		void listChatCache<OutboxRecord | CachedMessage>(outboxCacheKey(personId, conversationId))
			.then((outbox) => {
				if (!active || generation !== chatCacheGeneration()) return;
				for (const record of outbox) {
					if ("request" in record) showOutgoingMessage(client, record.message);
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [client, conversationId, personId]);
	return useInfiniteQuery({
		queryKey: keys.messages.latest(conversationId ?? ""),
		queryFn: ({ pageParam }) =>
			fetchHistoryPage(client, conversationId ?? "", async () => {
				const page = await api.messages(conversationId ?? "", pageParam, { markRead: false });
				const owner = client.getQueryData<MeResponse>(keys.me())?.member.id;
				if (pageParam || !owner || !conversationId) return page;
				const outbox = await listChatCache<CachedMessage | OutboxRecord>(outboxCacheKey(owner, conversationId)).catch(
					() => [],
				);
				for (const record of outbox) {
					const nonce = "request" in record ? record.request.clientNonce : record.clientNonce;
					if (nonce && page.items.some((item) => item.clientNonce === nonce))
						void removeChatCache(outboxCacheKey(owner, conversationId, nonce)).catch(() => {});
				}
				return { ...page, items: mergeOutbox(page.items, outbox) };
			}),
		structuralSharing: shareMessageHistory,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: (query) => Boolean(conversationId) && (observeWhile?.(query.state.data) ?? true),
		staleTime: Infinity,
		refetchOnMount: refreshOnMount ? "always" : true,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always",
	});
}

export function useSendMessage(conversationId: string | null, personId: string | undefined) {
	const api = useApi();
	const client = useQueryClient();
	const mutation = useMutation({
		mutationKey: ["send-message", personId, conversationId],
		mutationFn: ({ attachments: _attachments, files: _files, replyTo: _replyTo, ...body }: SendInput) =>
			api.sendMessage(conversationId ?? "", body),
		onMutate: async (body) => {
			if (!conversationId) return;
			await client.cancelQueries({ queryKey: keys.messages.latest(conversationId) });
			if (client.getQueryData<MeResponse>(keys.me())?.member.id !== personId) throw new Error("session_changed");
			const message = outgoingMessage(conversationId, personId ?? "", body);
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
				...outgoingMessage(conversationId, personId ?? "", body),
				pending: false,
				sendFailed: true,
			});
		},
	});
	const outbox = chatOutbox(client, api);
	return {
		...mutation,
		enqueue: async (body: SendInput) => {
			if (!conversationId || !personId) throw new Error("outbox_conversation_missing");
			await outbox.enqueue(conversationId, personId, body);
		},
		retryQueued: (nonce: string) =>
			conversationId && personId ? outbox.retry(conversationId, personId, nonce) : Promise.resolve(false),
	};
}

export function useRunActions() {
	const api = useApi();
	const client = useQueryClient();
	return {
		retry: useMutation({
			mutationFn: (id: string) => api.retryMessage(id, crypto.randomUUID()),
			onSuccess: (result) => {
				updateMessage(client, result.message);
			},
		}),
	};
}

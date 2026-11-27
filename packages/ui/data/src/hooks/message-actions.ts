import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, Message } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi, useData } from "../query/provider.tsx";
import { editCachedMessage, removeMessage, updateMessage, withFeedback } from "../realtime/message-cache.ts";
import { chatCacheGeneration, outboxCacheKey, removeChatCache } from "../storage/chat-cache.ts";

type Feedback = NonNullable<Message["feedback"]>;

export function useRecallMessage(conversationId: string | null) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationKey: ["recall-message", conversationId],
		mutationFn: (messageId: string) => api.recallMessage(messageId),
		onMutate: chatCacheGeneration,
		onSuccess: (message, _input, generation) => {
			if (generation === chatCacheGeneration()) updateMessage(client, message);
		},
	});
}

export function useDeleteMessage(conversationId: string | null) {
	const { api, flushQueryCache } = useData();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (messageId: string) => api.deleteMessage(messageId),
		onMutate: chatCacheGeneration,
		onSuccess: async (_result, messageId, generation) => {
			if (!conversationId || generation !== chatCacheGeneration()) return;
			const queryKey = keys.messages.latest(conversationId);
			await client.cancelQueries({ queryKey });
			if (generation !== chatCacheGeneration()) return;
			const removed = removeMessage(client, conversationId, messageId);
			flushQueryCache();
			const owner = client.getQueryData<MeResponse>(keys.me())?.member.id;
			if (owner && removed?.clientNonce)
				void removeChatCache(outboxCacheKey(owner, conversationId, removed.clientNonce)).catch(() => {});
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
	});
}

export function useMessageFeedback(conversationId: string | null) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ messageId, value }: { messageId: string; value: Feedback | null }) =>
			api.messageFeedback(messageId, value),
		onMutate: async ({ messageId, value }) => {
			const generation = chatCacheGeneration();
			if (conversationId) await client.cancelQueries({ queryKey: keys.messages.latest(conversationId) });
			if (generation !== chatCacheGeneration()) throw new Error("session_changed");
			const previous = conversationId
				? editCachedMessage(client, conversationId, messageId, (message) => withFeedback(message, value))
				: undefined;
			return { generation, previous };
		},
		onError: (_error, { messageId, value }, context) => {
			const previous = context?.previous;
			if (!conversationId || !previous || context.generation !== chatCacheGeneration()) return;
			editCachedMessage(client, conversationId, messageId, (message) =>
				message.version === previous.version && message.feedback === (value ?? undefined)
					? withFeedback(message, previous.feedback)
					: message,
			);
		},
		onSuccess: (message, _input, context) => {
			if (context?.generation === chatCacheGeneration()) updateMessage(client, message);
		},
	});
}

export function useForwardMessage() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ messageId, ...body }: { messageId: string; conversationId: string; clientNonce: string }) =>
			api.forwardMessage(messageId, body),
		onMutate: chatCacheGeneration,
		onSuccess: (result, _input, generation) => {
			if (generation !== chatCacheGeneration()) return;
			updateMessage(client, { ...result.message, clientNonce: result.clientNonce });
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
	});
}

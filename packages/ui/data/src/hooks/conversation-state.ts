import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@yonder/protocol";
import { useEffect, useRef } from "react";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { applyChatHistoryClear } from "../realtime/message-cache.ts";

export function useSetConversationMuted(conversationId: string) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (muted: boolean) => api.setConversationMuted(conversationId, muted),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.conversations.list() }),
	});
}

export function useConversationListActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.conversations.list() });
	return {
		pin: useMutation({
			mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.setConversationPinned(id, pinned),
			onSuccess: refresh,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.removeConversationFromMessages(id),
			onSuccess: refresh,
		}),
	};
}

export function useResetBotConversation(conversationId: string) {
	const api = useApi();
	const client = useQueryClient();
	const personId = () => client.getQueryData<MeResponse>(keys.me())?.member.id;
	return useMutation({
		mutationFn: (clearHistory: boolean) => api.resetConversation(conversationId, clearHistory),
		onMutate: personId,
		onSuccess: (result, clearHistory, owner) => {
			if (!clearHistory || !result.historyClearedThrough || !owner || personId() !== owner) return;
			applyChatHistoryClear(client, conversationId, result.historyClearedThrough);
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
	});
}

/** A history fetch is side-effect free. Only a foreground view that reached the latest message calls this. */
export function useMarkConversationRead(
	personId: string | undefined,
	conversationId: string | null,
	messageId: string | undefined,
	canRead: () => boolean,
) {
	const api = useApi();
	const client = useQueryClient();
	const ack = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!personId || !conversationId || !messageId || !canRead()) return;
		const scope = `${personId}:${conversationId}:${messageId}`;
		if (ack.current === scope) return;
		let active = true;
		void api
			.markConversationRead(conversationId, messageId)
			.then(() => {
				if (active) ack.current = scope;
				if (client.getQueryData<MeResponse>(keys.me())?.member.id === personId)
					void client.invalidateQueries({ queryKey: keys.conversations.list() });
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [api, canRead, client, conversationId, messageId, personId]);
}

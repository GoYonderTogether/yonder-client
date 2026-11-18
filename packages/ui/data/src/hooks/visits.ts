/**
 * A stranger and someone else's Bot (19 第二节). The server owns the visit ladder; these hooks
 * only ask it to move, and every answer is the whole conversation, which replaces the cached row.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Conversation, OutwardRequestAction } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

type ConversationList = { items: Conversation[] };

/** The same write `useContactActions` does: the returned conversation goes to the top of the list. */
function writeConversation(client: ReturnType<typeof useQueryClient>, conversation: Conversation) {
	client.setQueryData<ConversationList>(keys.conversations.list(), (current) => ({
		items: [conversation, ...(current?.items ?? []).filter((item) => item.id !== conversation.id)],
	}));
}

/**
 * Open, or find again, the chat with another person's Bot. The visitor's first message is free,
 * so nothing is asked before the conversation exists; `onSuccess` hands the conversation back so
 * the caller can open it.
 */
export function useStartBotChat() {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (handle: string) => api.startVisit({ handle }),
		onSuccess: ({ conversation }) => writeConversation(client, conversation),
	});
}

/** The host's two decisions, and the visitor taking over the cost, each answered as a conversation. */
export function useVisitActions() {
	const api = useApi();
	const client = useQueryClient();
	const save = (conversation: Conversation) => writeConversation(client, conversation);
	return {
		approve: useMutation({
			mutationFn: (input: string | { visitId: string; hostPays: boolean }) =>
				typeof input === "string"
					? api.approveVisit(input)
					: api.approveVisit(input.visitId, { hostPays: input.hostPays }),
			onSuccess: save,
		}),
		deny: useMutation({ mutationFn: (visitId: string) => api.denyVisit(visitId), onSuccess: save }),
		pay: useMutation({ mutationFn: (visitId: string) => api.payVisit(visitId), onSuccess: save }),
	};
}

export function useOutwardActions(conversationId: string) {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => {
		void client.invalidateQueries({ queryKey: keys.messages.latest(conversationId) });
		void client.invalidateQueries({ queryKey: keys.items.all() });
	};
	return {
		ask: useMutation({ mutationFn: (messageId: string) => api.askOwner(messageId), onSuccess: refresh }),
		act: useMutation({
			mutationFn: ({ id, input }: { id: string; input: OutwardRequestAction }) => api.actOnOutwardRequest(id, input),
			onSettled: refresh,
		}),
	};
}

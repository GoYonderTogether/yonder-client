import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MeResponse, QuestionCardAction } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";
import { updateMessage } from "../realtime/message-cache.ts";

export function useQuestionCardAction(cardId: string, conversationId: string, personId: string | undefined) {
	const api = useApi();
	const client = useQueryClient();
	const current = () => Boolean(personId) && client.getQueryData<MeResponse>(keys.me())?.member.id === personId;
	const queryKey = keys.messages.latest(conversationId);
	return useMutation({
		mutationFn: (input: QuestionCardAction) => {
			if (!current()) throw new Error("session_changed");
			return input.action === "answer" ? api.answerQuestionCard(cardId, input) : api.skipQuestionCard(cardId, input);
		},
		onSuccess: async ({ card, message }) => {
			if (!current()) return;
			await client.cancelQueries({ queryKey, exact: true });
			if (!current()) return;
			updateMessage(client, card);
			if (message) updateMessage(client, message);
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		},
		onError: async () => {
			// A response can be lost after the answer commits, or another client can answer first.
			// Reconcile the source and any reply before offering a retry.
			if (!current()) return;
			const card = await api.questionCard(cardId).catch(() => null);
			if (!card || !current()) return;
			updateMessage(client, card);
			if (card.questionCard?.answerMessageId) void client.invalidateQueries({ queryKey, exact: true });
		},
	});
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useSetConversationMuted(conversationId: string) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationFn: (muted: boolean) => api.setConversationMuted(conversationId, muted),
		onSuccess: () => client.invalidateQueries({ queryKey: keys.conversations.list() }),
	});
}

/** A history fetch is side-effect free. Only a foreground view that reached the latest message calls this. */
export function useMarkConversationRead(
	personId: string | undefined,
	conversationId: string | null,
	messageId: string | undefined,
) {
	const api = useApi();
	const ack = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!personId || !conversationId || !messageId) return;
		const scope = `${personId}:${conversationId}:${messageId}`;
		if (ack.current === scope) return;
		let active = true;
		void api
			.markConversationRead(conversationId, messageId)
			.then(() => {
				if (active) ack.current = scope;
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [api, conversationId, messageId, personId]);
}

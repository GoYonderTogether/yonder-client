import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import { useApi } from "../query/provider.tsx";

export function useCompactConversation(conversationId: string | undefined) {
	const api = useApi();
	const mutation = useMutation({
		mutationFn: ({ id, clientNonce }: { id: string; clientNonce: string }) =>
			api.compactConversation(id, { clientNonce }),
	});
	const previous = mutation.variables;
	const current = Boolean(conversationId && previous?.id === conversationId);
	return {
		isPending: current && mutation.isPending,
		isError: current && mutation.isError,
		error: current ? mutation.error : null,
		data: current ? mutation.data : undefined,
		reset: mutation.reset,
		run: () => {
			if (!conversationId || (current && mutation.isPending)) return;
			const terminalFailure = mutation.error instanceof ApiError && mutation.error.code === "compact_failed";
			const clientNonce =
				current && mutation.isError && previous && !terminalFailure ? previous.clientNonce : crypto.randomUUID();
			mutation.mutate({ id: conversationId, clientNonce });
		},
	};
}

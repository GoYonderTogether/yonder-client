import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@yonder/api-client";
import type { AgentCard } from "@yonder/protocol";
import { latestAgentCard, writeAgentCard } from "../query/agent-cards.ts";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** One owner-only Agent card. The server pushes every state change into the same cache entry. */
export function useAgentCard(id: string, enabled: boolean) {
	const api = useApi();
	return useQuery({
		queryKey: keys.agentCards.detail(id),
		queryFn: ({ signal }) => api.agentCard(id, signal),
		enabled,
		refetchOnMount: "always",
		structuralSharing: (previous, incoming) =>
			latestAgentCard(previous as AgentCard | undefined, incoming as AgentCard),
	});
}

export function useAgentCardActions(id: string) {
	const api = useApi();
	const client = useQueryClient();
	return useMutation({
		mutationKey: keys.agentCards.detail(id),
		mutationFn: ({ actionId, version }: { actionId: string; version: number }) =>
			api.actOnAgentCard(id, { actionId, version }),
		onSuccess: ({ card }) => {
			if (card.id === id) writeAgentCard(client, card);
		},
		onError: (error) => {
			// A stale version means this device's copy is behind; the server's card replaces it.
			if (error instanceof ApiError && (error.code === "conflict_version" || error.status === 404))
				void client.invalidateQueries({ queryKey: keys.agentCards.detail(id), exact: true });
		},
	});
}

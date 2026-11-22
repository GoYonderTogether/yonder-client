import type { QueryClient } from "@tanstack/react-query";
import type { AgentCard } from "@yonder/protocol";
import { keys } from "./keys.ts";

/** A late fetch or replay cannot change what the newest authority has told this device. */
export function latestAgentCard(previous: AgentCard | undefined, incoming: AgentCard): AgentCard {
	return previous?.id === incoming.id && previous.version >= incoming.version ? previous : incoming;
}

export function writeAgentCard(client: QueryClient, incoming: AgentCard) {
	const key = keys.agentCards.detail(incoming.id);
	const previous = client.getQueryData<AgentCard>(key);
	const next = latestAgentCard(previous, incoming);
	if (next === previous) return;
	client.setQueryData(key, next);
}

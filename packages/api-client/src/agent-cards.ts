import type {
	AgentCard,
	AgentCardActionRequest,
	AgentCardActionResponse,
	AgentCardDismissRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

function cardPath(id: string) {
	return `/v1/agent-cards/${encodeURIComponent(id)}`;
}

export function agentCardEndpoints(client: ApiClient) {
	return {
		agentCard: (id: string, signal?: AbortSignal) => client.request<AgentCard>(cardPath(id), signal ? { signal } : {}),
		actOnAgentCard: (id: string, body: AgentCardActionRequest) =>
			client.request<AgentCardActionResponse>(`${cardPath(id)}/action`, { method: "POST", body }),
		dismissAgentCard: (id: string, body: AgentCardDismissRequest) =>
			client.request<AgentCardActionResponse>(`${cardPath(id)}/dismiss`, { method: "POST", body }),
	};
}

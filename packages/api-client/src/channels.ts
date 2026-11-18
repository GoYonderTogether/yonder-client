import type {
	ChannelAttempt,
	ChannelConnection,
	ChannelConversationAction,
	ExternalChannelConversation,
	ExternalChannelMessagePage,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function channelEndpoints(client: ApiClient) {
	return {
		externalChannelConversations: (id: string) =>
			client.request<{ items: ExternalChannelConversation[] }>(`/v1/channels/${encodeURIComponent(id)}/conversations`),
		externalChannelMessages: (id: string, before?: string) =>
			client.request<ExternalChannelMessagePage>(
				`/v1/channel-conversations/${encodeURIComponent(id)}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`,
			),
		setChannelConversation: (id: string, action: ChannelConversationAction) =>
			client.request<{ ok: true }>(`/v1/channel-conversations/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: { action },
			}),
		setChannelAdmission: (id: string, policy: { allowExternalDm: boolean; allowGroups: boolean }) =>
			client.request<ChannelConnection>(`/v1/channels/${encodeURIComponent(id)}/admission`, {
				method: "PATCH",
				body: policy,
			}),
		channels: () => client.request<{ available: boolean; items: ChannelConnection[] }>("/v1/channels"),
		startChannel: (botId: string) => client.request<ChannelAttempt>("/v1/channels/attempts", { body: { botId } }),
		channelAttempt: (id: string) => client.request<ChannelAttempt>(`/v1/channels/attempts/${encodeURIComponent(id)}`),
		cancelChannelAttempt: (id: string) =>
			client.request<ChannelAttempt>(`/v1/channels/attempts/${encodeURIComponent(id)}`, { method: "DELETE" }),
		enableChannel: (id: string, enabled: boolean) =>
			client.request<ChannelConnection>(`/v1/channels/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: { enabled },
			}),
		disconnectChannel: (id: string) =>
			client.request<{ ok: true }>(`/v1/channels/${encodeURIComponent(id)}`, { method: "DELETE" }),
	};
}

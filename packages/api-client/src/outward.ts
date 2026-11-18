import type {
	BotSocialResponse,
	CreatePublicFactRequest,
	OutwardRequestListResponse,
	PublicFact,
	PublicFactListResponse,
	UpdateBotSocialRequest,
	UpdatePublicFactRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** The public library, each Bot's social.md and the owner's open outward requests. */
export function outwardEndpoints(client: ApiClient) {
	return {
		publicFacts(): Promise<PublicFactListResponse> {
			return client.request("/v1/me/public-facts");
		},
		createPublicFact(body: CreatePublicFactRequest): Promise<PublicFact> {
			return client.request("/v1/me/public-facts", { body });
		},
		updatePublicFact(id: string, body: UpdatePublicFactRequest): Promise<PublicFact> {
			return client.request(`/v1/me/public-facts/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},
		/** A fact a Bot proposed becomes active: from now on every outward conversation may use it. */
		confirmPublicFact(id: string): Promise<PublicFact> {
			return client.request(`/v1/me/public-facts/${encodeURIComponent(id)}/confirm`, { body: {} });
		},
		/** Deletes an active fact, or turns a proposal down. */
		deletePublicFact(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/me/public-facts/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
		botSocial(botId: string): Promise<BotSocialResponse> {
			return client.request(`/v1/bots/${encodeURIComponent(botId)}/social`);
		},
		updateBotSocial(botId: string, body: UpdateBotSocialRequest): Promise<BotSocialResponse> {
			return client.request(`/v1/bots/${encodeURIComponent(botId)}/social`, { method: "PUT", body });
		},
		outwardRequests(): Promise<OutwardRequestListResponse> {
			return client.request("/v1/outward-requests");
		},
	};
}

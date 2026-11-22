import type {
	DiscoverModelsRequest,
	Provider,
	ProviderList,
	ProviderModelMetadata,
	SaveProviderRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** The account's own model providers. */
export function providerEndpoints(client: ApiClient) {
	return {
		providers(): Promise<ProviderList> {
			return client.request("/v1/providers");
		},

		discoverModels(
			body: DiscoverModelsRequest,
		): Promise<{ models: string[]; metadata?: Record<string, ProviderModelMetadata> }> {
			return client.request("/v1/providers/models", { body });
		},

		createProvider(body: SaveProviderRequest): Promise<Provider> {
			return client.request("/v1/providers", { body });
		},

		updateProvider(id: string, body: SaveProviderRequest): Promise<Provider> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		deleteProvider(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		testProvider(id: string): Promise<{ ok: boolean }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}/test`, { body: {} });
		},

		setDefaultProvider(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/providers/${encodeURIComponent(id)}/default`, { body: {} });
		},
	};
}

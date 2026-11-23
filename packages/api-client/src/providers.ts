import type {
	DeviceListResponse,
	DeviceModelEndpointView,
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

		/**
		 * The approved endpoints of every device, each tagged with the device it belongs to. The
		 * server publishes them on the device list, so this is the same read with a narrower shape.
		 */
		async providerDeviceEndpoints(signal?: AbortSignal): Promise<{ items: DeviceModelEndpointView[] }> {
			const { items } = await client.request<DeviceListResponse>("/v1/devices", signal ? { signal } : undefined);
			return {
				items: items.flatMap(({ id, modelEndpoints }) =>
					(modelEndpoints ?? []).map((endpoint) => ({ ...endpoint, deviceId: id })),
				),
			};
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

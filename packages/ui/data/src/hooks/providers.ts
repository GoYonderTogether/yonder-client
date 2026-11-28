import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoverModelsRequest, SaveProviderRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useProviders(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.providers(),
		queryFn: () => api.providers(),
		staleTime: 60_000,
		enabled: options.enabled ?? true,
	});
}

export function useProviderDeviceEndpoints(enabled: boolean) {
	const api = useApi();
	return useQuery({
		queryKey: keys.providerDeviceEndpoints(),
		queryFn: ({ signal }) => api.providerDeviceEndpoints(signal),
		enabled,
		gcTime: 0,
		retry: false,
	});
}

export function useProviderActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.providers() });
	return {
		readDevices: () => api.devices(),
		// Discovery can also carry a just-entered key: keep it out of the mutation cache.
		discoverModels: (body: DiscoverModelsRequest) => api.discoverModels(body),
		// Do not put a key into the mutation cache or its persisted state.
		async save(id: string | undefined, body: SaveProviderRequest) {
			const result = id ? await api.updateProvider(id, body) : await api.createProvider(body);
			await refresh();
			if (body.origin === "device" && body.endpointId) void client.invalidateQueries({ queryKey: keys.devices() });
			return result;
		},
		remove: useMutation({ mutationFn: (id: string) => api.deleteProvider(id), onSuccess: refresh }),
		setDefault: useMutation({ mutationFn: (id: string) => api.setDefaultProvider(id), onSuccess: refresh }),
		// Choosing a model inside one provider: remember it on the provider, then make that provider
		// the account's answer. The model goes first so the default never points at the old one.
		chooseProviderModel: useMutation({
			mutationFn: async ({ id, model }: { id: string; model: string }) => {
				await api.updateProviderDefaultModel(id, model);
				await api.setDefaultProvider(id);
			},
			onSuccess: refresh,
		}),
		test: useMutation({ mutationFn: ({ id, model }: { id: string; model?: string }) => api.testProvider(id, model) }),
	};
}

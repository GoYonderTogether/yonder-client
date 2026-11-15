import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateConnectorRequest, UpdateConnectorRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useConnectorCatalog() {
	const api = useApi();
	return useQuery({
		queryKey: keys.connectors.catalog(),
		queryFn: () => api.connectorCatalog(),
		staleTime: 5 * 60_000,
	});
}

export function useConnectors(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.connectors.list(),
		queryFn: () => api.connectors(),
		staleTime: 30_000,
		enabled: options.enabled ?? true,
	});
}

export function useConnectorActions() {
	const api = useApi();
	const client = useQueryClient();
	const refresh = () => client.invalidateQueries({ queryKey: keys.connectors.list() });
	return {
		update: useMutation({
			mutationFn: ({ id, ...body }: UpdateConnectorRequest & { id: string }) => api.updateConnector(id, body),
			onSuccess: refresh,
		}),
		create: useMutation({
			mutationFn: (body: CreateConnectorRequest) => api.createConnector(body),
			onSuccess: refresh,
		}),
		remove: useMutation({ mutationFn: (id: string) => api.deleteConnector(id), onSuccess: refresh }),
	};
}

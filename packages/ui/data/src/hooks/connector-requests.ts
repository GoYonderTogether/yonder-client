import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectorRequestView } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** One authorization card. The server pushes every state change into the same cache entry. */
export function useConnectorRequest(id: string) {
	const api = useApi();
	return useQuery({ queryKey: keys.connectorRequest(id), queryFn: () => api.connectorRequest(id) });
}

/** Devices a pending request could be allowed on; only fetched when the user has to choose. */
export function useConnectorRequestDevices(id: string, enabled: boolean) {
	const api = useApi();
	return useQuery({
		queryKey: keys.connectorRequestDevices(id),
		queryFn: () => api.connectorRequestDevices(id),
		enabled,
	});
}

export function useConnectorRequestActions() {
	const api = useApi();
	const client = useQueryClient();
	const write = (view: ConnectorRequestView) => client.setQueryData(keys.connectorRequest(view.id), view);
	return {
		confirm: useMutation({
			mutationFn: ({ id, deviceId }: { id: string; deviceId?: string }) =>
				api.confirmConnectorRequest(id, deviceId ? { deviceId } : {}),
			onSuccess: write,
		}),
		cancel: useMutation({
			mutationFn: (id: string) => api.cancelConnectorRequest(id),
			onSuccess: write,
		}),
	};
}

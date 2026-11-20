import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectorId, ConnectorRequestView } from "@yonder/protocol";
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
	const actions = {
		onMutate: (input: string | { id: string }) =>
			client.getQueryData<ConnectorRequestView>(keys.connectorRequest(typeof input === "string" ? input : input.id)),
		onSuccess: (view: ConnectorRequestView, _input: unknown, previous: ConnectorRequestView | undefined) => {
			const filter = { queryKey: keys.connectorRequest(view.id), exact: true };
			// A socket update or another request may have settled the card during this mutation.
			if (client.getQueryData(filter.queryKey) !== previous) return client.invalidateQueries(filter);
			void client.cancelQueries(filter);
			client.setQueryData(filter.queryKey, view);
		},
	};
	return {
		confirm: useMutation({
			...actions,
			/** `connectorIds` is what the card showed; the server refuses a card that changed since. */
			mutationFn: ({ id, deviceId, connectorIds }: { id: string; deviceId?: string; connectorIds: ConnectorId[] }) =>
				api.confirmConnectorRequest(id, { ...(deviceId ? { deviceId } : {}), connectorIds }),
		}),
		cancel: useMutation({
			...actions,
			mutationFn: (id: string) => api.cancelConnectorRequest(id),
		}),
		resume: useMutation({
			...actions,
			mutationFn: (id: string) => api.continueConnectorRequest(id),
			onError: (_error, id) => client.invalidateQueries({ queryKey: keys.connectorRequest(id), exact: true }),
		}),
	};
}

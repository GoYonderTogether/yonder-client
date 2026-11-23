import { useCallback, useEffect, useState } from "react";
import { keys } from "../query/keys.ts";
import { useApi, useDataQueryClient } from "../query/provider.tsx";

/** Capability responses are scoped to the mounted screen and never enter the shared query cache. */
function useCommerceCapability<T>(enabled: boolean, read: (signal: AbortSignal) => Promise<T>) {
	const [data, setData] = useState<T>();
	useEffect(() => {
		if (!enabled) return;
		const request = new AbortController();
		void read(request.signal).then(
			(result) => {
				if (!request.signal.aborted) setData(result);
			},
			() => undefined,
		);
		return () => request.abort();
	}, [enabled, read]);
	return enabled ? data : undefined;
}

export function useWechatWebEnabled(enabled: boolean) {
	return useCommerceCapability(enabled, useApi().wechatWebConfig)?.enabled === true;
}

export function useBillingCatalog(enabled: boolean) {
	return useCommerceCapability(enabled, useApi().billingCatalog)?.products;
}

export function useWechatWebActions() {
	const api = useApi();
	const cache = useDataQueryClient();
	return {
		start: api.startWechatWeb,
		status: api.wechatWebStatus,
		refreshAccount: () => cache.invalidateQueries({ queryKey: keys.me() }),
	};
}

export function useBillingActions() {
	const api = useApi();
	const cache = useDataQueryClient();
	const refreshQuota = useCallback(() => cache.invalidateQueries({ queryKey: keys.quota() }), [cache]);
	return { create: api.createBillingOrder, read: api.billingOrder, refreshQuota };
}

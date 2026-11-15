import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

export function useInvite() {
	const api = useApi();
	return useQuery({ queryKey: keys.invite(), queryFn: () => api.invite(), staleTime: 30_000 });
}

export function useResolvedInvite(code: string | null, enabled = true) {
	const api = useApi();
	return useQuery({
		queryKey: keys.resolveInvite(code ?? ""),
		queryFn: () => api.resolveInvite(code ?? ""),
		enabled: enabled && Boolean(code),
		retry: false,
		staleTime: 30_000,
	});
}

export function useQuota() {
	const api = useApi();
	return useQuery({ queryKey: keys.quota(), queryFn: () => api.quota(), staleTime: 30_000 });
}

export function useQuotaLedger() {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.ledger(),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.quotaLedger(pageParam),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}

/** The published rate card, cached for longer than a balance: prices change when we publish them. */
export function useQuotaRates() {
	const api = useApi();
	return useQuery({ queryKey: keys.quotaRates(), queryFn: () => api.quotaRates(), staleTime: 3_600_000 });
}

export function useUsage() {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.usage("all"),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.usage(pageParam),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 300_000,
	});
}

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UsageRunFilter } from "@yonder/api-client";
import type { QuotaConfigResponse, QuotaPool } from "@yonder/protocol";
import { CACHE_MAX_AGE_MS } from "../query/client.ts";
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

/**
 * The published quota catalog (grant sizes, overflow rules, invite rewards), shared by every screen
 * that shows more than a balance.
 *
 * `configVersion` is the revision the balance was charged under. A request goes out only when the
 * cached copy is a different revision, or is older than the 24-hour cache lifetime: a balance that
 * names the revision already held costs no request. `null` is for a screen without a balance (the
 * signed-out pricing page), where the lifetime alone decides.
 *
 * The catalog is public, so it is fetched without a token, and the version doubles as its ETag: a
 * copy the server still considers current comes back as 304 and the cached one is kept.
 */
export function useQuotaConfig(configVersion: number | null = null) {
	const api = useApi();
	const queryClient = useQueryClient();
	const state = queryClient.getQueryState<QuotaConfigResponse>(keys.quotaConfig());
	const cached = state?.data;
	const fresh = cached !== undefined && state !== undefined && Date.now() - state.dataUpdatedAt < CACHE_MAX_AGE_MS;
	const needed = !fresh || (configVersion !== null && cached.version !== configVersion);
	return useQuery({
		queryKey: keys.quotaConfig(),
		queryFn: async () => {
			const next = await api.quotaConfig(cached ? `"${cached.version}"` : undefined);
			if (next) return next;
			if (cached) return cached;
			throw new Error("the quota catalog answered 304 without a cached copy");
		},
		enabled: needed,
		// Freshness is decided above, from the version and the stored age, so the fetch on a version
		// change must not be held back by the query's own stale timer.
		staleTime: 0,
		gcTime: CACHE_MAX_AGE_MS,
	});
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

/** One screen of the quota page: totals, the day-by-pool chart and where it went. */
export function useUsageOverview(range: "cycle" | "7d", pool?: QuotaPool) {
	const api = useApi();
	return useQuery({
		queryKey: keys.usageOverview(range, pool ?? "all"),
		queryFn: () => api.usageOverview({ range, ...(pool ? { pool } : {}) }),
		// Switching the range keeps the last chart on screen until the new one arrives.
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});
}

/** Spending grouped by run: one reply, one task step, one meeting note. */
export function useUsageRuns(filter: UsageRunFilter = {}) {
	const api = useApi();
	return useInfiniteQuery({
		queryKey: keys.usageRuns(JSON.stringify(filter)),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => api.usageRuns(pageParam, filter),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 60_000,
	});
}

/** The model calls behind one run, loaded when the reader opens it. */
export function useUsageRunCalls(run: string | null) {
	const api = useApi();
	return useQuery({
		queryKey: keys.usageRunCalls(run ?? ""),
		queryFn: () => api.usage(undefined, { run: run ?? "" }),
		enabled: Boolean(run),
		staleTime: 300_000,
	});
}

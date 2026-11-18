// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { QuotaConfigResponse } from "@yonder/protocol";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { CACHE_MAX_AGE_MS } from "../query/client.ts";
import { keys } from "../query/keys.ts";
import { useQuotaConfig } from "./quota.ts";

const api = vi.hoisted(() => ({ quotaConfig: vi.fn() }));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));

const catalog = (version: number): QuotaConfigResponse => ({
	version,
	tier: "standard",
	signup: { main: 65_000_000, background: 15_000_000, coding: 5_000_000, external: 5_000_000, tools: 10_000_000 },
	monthly: { main: 20_000_000, background: 3_000_000, coding: 1_000_000, external: 2_000_000, tools: 3_000_000 },
	rules: {
		main: { overflow: false, rate: 1, floor: null },
		background: { overflow: true, rate: 1, floor: 4_000_000 },
		coding: { overflow: true, rate: 1.2, floor: 4_000_000 },
		external: { overflow: false, rate: 1, floor: null },
		tools: { overflow: false, rate: 1, floor: null },
	},
	invite: { inviter: 10_000_000, invitee: 10_000_000, maxInvites: 30 },
	toolUnits: {
		web_search: { name: "联网搜索", price: 5_000 },
		web_read: { name: "网页读取", price: 5_000 },
	},
});

function makeClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
}

afterEach(() => api.quotaConfig.mockReset());

test("the catalog is requested only when the balance names a version the cache does not hold", async () => {
	api.quotaConfig.mockResolvedValue(catalog(4));
	const client = makeClient();
	const wrapper = wrapperFor(client);
	// No cached copy and a balance that already reports version 4: this is the one request.
	const first = renderHook(() => useQuotaConfig(4), { wrapper });
	await waitFor(() => expect(first.result.current.data?.version).toBe(4));
	expect(api.quotaConfig).toHaveBeenCalledTimes(1);
	expect(api.quotaConfig).toHaveBeenCalledWith(undefined);

	// The same version again, from a fresh mount and from a changed balance: no request at all.
	first.unmount();
	const same = renderHook(() => useQuotaConfig(4), { wrapper });
	expect(same.result.current.data?.version).toBe(4);
	same.rerender();
	same.unmount();
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(api.quotaConfig).toHaveBeenCalledTimes(1);

	// A new version is a different catalog: exactly one more request, quoted with the held ETag.
	api.quotaConfig.mockResolvedValue(catalog(5));
	const next = renderHook(() => useQuotaConfig(5), { wrapper });
	await waitFor(() => expect(next.result.current.data?.version).toBe(5));
	expect(api.quotaConfig).toHaveBeenCalledTimes(2);
	expect(api.quotaConfig).toHaveBeenLastCalledWith('"4"');
	client.clear();
});

test("a cached copy past its 24-hour lifetime is refetched even when the version matches", async () => {
	api.quotaConfig.mockResolvedValue(catalog(2));
	const client = makeClient();
	const wrapper = wrapperFor(client);
	const first = renderHook(() => useQuotaConfig(2), { wrapper });
	await waitFor(() => expect(first.result.current.data?.version).toBe(2));
	expect(api.quotaConfig).toHaveBeenCalledTimes(1);
	first.unmount();

	// Age the stored copy past the lifetime the persister keeps it for.
	const state = client.getQueryState(keys.quotaConfig());
	client
		.getQueryCache()
		.find({ queryKey: keys.quotaConfig() })
		?.setState({ dataUpdatedAt: Date.now() - CACHE_MAX_AGE_MS });
	expect(state?.data).toBeDefined();
	const second = renderHook(() => useQuotaConfig(2), { wrapper });
	await waitFor(() => expect(api.quotaConfig).toHaveBeenCalledTimes(2));
	second.unmount();
	client.clear();
});

test("a 304 keeps the held catalog instead of emptying the cache", async () => {
	api.quotaConfig.mockResolvedValue(catalog(7));
	const client = makeClient();
	const wrapper = wrapperFor(client);
	const first = renderHook(() => useQuotaConfig(7), { wrapper });
	await waitFor(() => expect(first.result.current.data?.version).toBe(7));
	first.unmount();

	// The server answers "not modified" for the version the client quotes back.
	api.quotaConfig.mockResolvedValue(undefined);
	const aged = client.getQueryCache().find({ queryKey: keys.quotaConfig() });
	aged?.setState({ dataUpdatedAt: 0 });
	const second = renderHook(() => useQuotaConfig(7), { wrapper });
	await waitFor(() => expect(api.quotaConfig).toHaveBeenCalledTimes(2));
	expect(api.quotaConfig).toHaveBeenLastCalledWith('"7"');
	await waitFor(() => expect(second.result.current.data?.version).toBe(7));
	second.unmount();
	client.clear();
});

test("without a balance the catalog is fetched once and then kept for its lifetime", async () => {
	api.quotaConfig.mockResolvedValue(catalog(1));
	const client = makeClient();
	const wrapper = wrapperFor(client);
	const first = renderHook(() => useQuotaConfig(), { wrapper });
	await waitFor(() => expect(first.result.current.data?.version).toBe(1));
	first.unmount();
	const second = renderHook(() => useQuotaConfig(), { wrapper });
	expect(second.result.current.data?.version).toBe(1);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(api.quotaConfig).toHaveBeenCalledTimes(1);
	second.unmount();
	client.clear();
});

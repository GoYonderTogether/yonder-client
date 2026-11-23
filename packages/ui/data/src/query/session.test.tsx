// @vitest-environment jsdom
import { dehydrate } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useSessionStore } from "../auth/session-store.ts";
import { createMemoryStorage } from "../storage/index.ts";
import { CACHE_STORAGE_KEY, CACHE_VERSION, createQueryClient } from "./client.ts";
import { keys } from "./keys.ts";
import { DataProvider, useData, useDataQueryClient } from "./provider.tsx";

afterEach(() => vi.unstubAllGlobals());

test("a shell sign-in keeps both tokens while removing the previous account's cached data", async () => {
	useSessionStore.setState({ booting: true, status: "unknown" });
	const storage = createMemoryStorage();
	storage.set("locale", "zh-CN");
	storage.set("installation-id", "same-installation");
	const refreshTokenStorage = { get: () => null, set: vi.fn() };
	const onSessionChange = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<StrictMode>
			<DataProvider
				baseUrl=""
				appVersion="test"
				clientKind="shell"
				storage={storage}
				refreshTokenStorage={refreshTokenStorage}
				onSessionChange={onSessionChange}
			>
				{children}
			</DataProvider>
		</StrictMode>
	);
	const result = renderHook(() => ({ ...useData(), query: useDataQueryClient() }), { wrapper });
	await waitFor(() => expect(useSessionStore.getState().booting).toBe(false));
	vi.useFakeTimers();
	result.result.current.query.setQueryData(keys.me(), { name: "old" });
	result.result.current.query.setQueryData(keys.contactSearch("a"), ["temporary"]);
	await act(() => vi.advanceTimersByTimeAsync(1000));
	const saved = JSON.parse(storage.get("yonder.query-cache") ?? "{}");
	expect(saved.clientState.queries.map((query: { queryKey: unknown[] }) => query.queryKey[0])).toContain("me");
	expect(saved.clientState.queries.map((query: { queryKey: unknown[] }) => query.queryKey[0])).not.toContain(
		"contact-search",
	);
	result.result.current.query.setQueryData(keys.quota(), { balance: 42 });
	await act(() => result.result.current.startSession({ accessToken: "new-access", refreshToken: "new-refresh" }));
	expect(result.result.current.client.accessToken).toBe("new-access");
	expect(refreshTokenStorage.set).toHaveBeenCalledWith("new-refresh");
	expect(result.result.current.query.getQueryData(keys.quota())).toBeUndefined();
	expect(storage.get("locale")).toBe("zh-CN");
	expect(useSessionStore.getState().status).toBe("signed-in");
	await act(() => vi.advanceTimersByTimeAsync(1000));
	expect(storage.get("yonder.query-cache")).toBeNull();
	result.result.current.query.setQueryData(keys.me(), { name: "new" });
	onSessionChange.mockClear();
	await act(async () => {
		await Promise.all([result.result.current.signOutLocal(), result.result.current.signOutLocal()]);
	});
	expect(onSessionChange).toHaveBeenCalledOnce();
	result.unmount();
	await act(() => vi.advanceTimersByTimeAsync(1000));
	expect(storage.get("yonder.query-cache")).toBeNull();
	expect(storage.get("installation-id")).toBe("same-installation");
	vi.useRealTimers();
});

test("a legacy web profile can open offline until the server confirms that its session ended", async () => {
	const storage = createMemoryStorage();
	const cached = createQueryClient();
	cached.setQueryData(keys.me(), { member: { id: "returning-user" } });
	storage.set(
		CACHE_STORAGE_KEY,
		JSON.stringify({ buster: CACHE_VERSION, timestamp: Date.now(), clientState: dehydrate(cached) }),
	);
	cached.clear();

	const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
	vi.stubGlobal("fetch", fetch);
	const wrapper = ({ children }: { children: ReactNode }) => (
		<DataProvider baseUrl="" appVersion="test" clientKind="web" storage={storage}>
			{children}
		</DataProvider>
	);
	const offline = renderHook(() => useData(), { wrapper });
	await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
	expect(useSessionStore.getState()).toMatchObject({ status: "signed-in", booting: false });
	expect(offline.result.current.client.accessToken).toBeNull();
	offline.unmount();

	fetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));
	const confirmed = renderHook(() => useData(), { wrapper });
	await waitFor(() => expect(useSessionStore.getState().status).toBe("signed-out"));
	confirmed.unmount();

	const reopened = renderHook(() => useData(), { wrapper });
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
	expect(useSessionStore.getState()).toMatchObject({ status: "unknown", booting: true });
	reopened.unmount();
});

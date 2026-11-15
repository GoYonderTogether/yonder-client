// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useSessionStore } from "../auth/session-store.ts";
import { createMemoryStorage } from "../storage/index.ts";
import { keys } from "./keys.ts";
import { DataProvider, useData, useDataQueryClient } from "./provider.tsx";

test("a shell sign-in keeps both tokens while removing the previous account's cached data", async () => {
	useSessionStore.setState({ booting: true, status: "unknown" });
	const storage = createMemoryStorage();
	storage.set("locale", "zh-CN");
	const refreshTokenStorage = { get: () => null, set: vi.fn() };
	const wrapper = ({ children }: { children: ReactNode }) => (
		<DataProvider
			baseUrl=""
			appVersion="test"
			clientKind="shell"
			storage={storage}
			refreshTokenStorage={refreshTokenStorage}
		>
			{children}
		</DataProvider>
	);
	const result = renderHook(() => ({ ...useData(), query: useDataQueryClient() }), { wrapper });
	await waitFor(() => expect(useSessionStore.getState().booting).toBe(false));
	result.result.current.query.setQueryData(keys.quota(), { balance: 42 });
	await act(() => result.result.current.startSession({ accessToken: "new-access", refreshToken: "new-refresh" }));
	expect(result.result.current.client.accessToken).toBe("new-access");
	expect(refreshTokenStorage.set).toHaveBeenCalledWith("new-refresh");
	expect(result.result.current.query.getQueryData(keys.quota())).toBeUndefined();
	expect(storage.get("locale")).toBe("zh-CN");
	expect(useSessionStore.getState().status).toBe("signed-in");
});

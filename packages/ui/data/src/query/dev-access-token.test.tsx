// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { createMemoryStorage } from "../storage/index.ts";
import { DataProvider, useData } from "./provider.tsx";

afterEach(() => vi.unstubAllGlobals());

test("expiring the access token preserves shell refresh credentials for the next request", async () => {
	let refreshToken: string | null = "refresh-1";
	let refreshes = 0;
	const requests: Array<string | null> = [];
	const refreshStorage = {
		get: () => refreshToken,
		set: (value: string | null) => {
			refreshToken = value;
		},
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options: RequestInit) => {
			if (url.endsWith("/v1/auth/refresh")) {
				refreshes += 1;
				return {
					ok: true,
					status: 200,
					json: async () => ({ accessToken: `access-${refreshes}`, refreshToken: `refresh-${refreshes}` }),
				};
			}
			const authorization = new Headers(options.headers).get("authorization");
			requests.push(authorization);
			return authorization
				? { ok: true, status: 200, json: async () => ({ ok: true }) }
				: { ok: false, status: 401, json: async () => ({ error: { code: "unauthenticated" } }) };
		}),
	);
	const storage = createMemoryStorage();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<DataProvider
			baseUrl=""
			appVersion="test"
			clientKind="shell"
			refreshTokenStorage={refreshStorage}
			storage={storage}
		>
			{children}
		</DataProvider>
	);
	const { result } = renderHook(() => useData(), { wrapper });
	await waitFor(() => expect(result.current.client.accessToken).toBe("access-1"));
	await act(async () => {
		result.current.expireAccessTokenForDev?.();
		expect(result.current.client.accessToken).toBeNull();
		expect(refreshStorage.get()).toBe("refresh-1");
		await result.current.client.request("/private");
	});
	expect(requests).toEqual([null, "Bearer access-2"]);
	expect(refreshStorage.get()).toBe("refresh-2");
});

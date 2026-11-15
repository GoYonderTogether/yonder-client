import { expect, test, vi } from "vitest";
import { ApiClient } from "./client.ts";

test("auxiliary windows recover an expired access token through the main window without refresh credentials", async () => {
	let accessToken: string | null = "expired";
	const getRefreshToken = vi.fn(() => "must-never-read");
	const setRefreshToken = vi.fn();
	const refreshAccessToken = vi.fn(async () => "borrowed");
	const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		const authorized = new Headers(init?.headers).get("authorization") === "Bearer borrowed";
		return new Response(JSON.stringify(authorized ? { ok: true } : { error: { code: "unauthenticated" } }), {
			status: authorized ? 200 : 401,
		});
	});
	const client = new ApiClient({
		baseUrl: "https://server.test",
		appVersion: "test",
		clientKind: "shell",
		fetch,
		tokens: {
			getAccessToken: () => accessToken,
			setAccessToken: (token) => {
				accessToken = token;
			},
			getRefreshToken,
			setRefreshToken,
		},
		refreshAccessToken,
	});
	expect(await client.request("/v1/me")).toEqual({ ok: true });
	expect(refreshAccessToken).toHaveBeenCalledOnce();
	expect(getRefreshToken).not.toHaveBeenCalled();
	expect(setRefreshToken).not.toHaveBeenCalled();
	expect(fetch.mock.calls.every(([url]) => !String(url).includes("/auth/refresh"))).toBe(true);
});

test("when the main window is unavailable the auxiliary window cannot restore a session", async () => {
	const fetch = vi.fn();
	const client = new ApiClient({
		baseUrl: "https://server.test",
		appVersion: "test",
		clientKind: "shell",
		fetch,
		tokens: {
			getAccessToken: () => null,
			setAccessToken: vi.fn(),
			getRefreshToken: () => {
				throw new Error("must never read");
			},
		},
		refreshAccessToken: async () => null,
	});
	expect(await client.refreshSession()).toBe(false);
	expect(fetch).not.toHaveBeenCalled();
});

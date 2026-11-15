import { expect, test, vi } from "vitest";
import { ApiClient, type ApiResponse, createEndpoints } from "./index.ts";

test("native transport shares typed endpoints, refresh rotation and retry without browser globals", async () => {
	let access: string | null = "expired";
	let refresh: string | null = "refresh-1";
	let refreshes = 0;
	const seen: string[] = [];
	const response = (status: number, body: unknown): ApiResponse => ({
		status,
		ok: status === 200,
		json: async () => body,
		blob: async () => {
			throw new Error("unused");
		},
	});
	const fetch = vi.fn(async (url: string, init: RequestInit) => {
		const headers = init.headers as Record<string, string>;
		expect(headers["x-request-id"]).toBe("native-request");
		if (url.endsWith("/refresh")) {
			refreshes += 1;
			expect(JSON.parse(String(init.body))).toEqual({ refreshToken: "refresh-1" });
			return response(200, { accessToken: "access-2", refreshToken: "refresh-2" });
		}
		seen.push(headers.authorization ?? "");
		return headers.authorization === "Bearer access-2"
			? response(200, { items: [] })
			: response(401, { error: { code: "unauthenticated" } });
	});
	vi.stubGlobal("Headers", undefined);
	vi.stubGlobal("crypto", undefined);
	try {
		const client = new ApiClient({
			baseUrl: "https://example.test",
			appVersion: "test",
			clientKind: "shell",
			fetch,
			requestId: () => "native-request",
			tokens: {
				getAccessToken: () => access,
				setAccessToken: (value) => {
					access = value;
				},
				getRefreshToken: () => refresh,
				setRefreshToken: (value) => {
					refresh = value;
				},
			},
		});
		const api = createEndpoints(client);
		expect(await Promise.all([api.conversations(), api.conversations()])).toEqual([{ items: [] }, { items: [] }]);
		expect(refreshes).toBe(1);
		expect(refresh).toBe("refresh-2");
		expect(seen).toContain("Bearer expired");
		expect(seen).toContain("Bearer access-2");
	} finally {
		vi.unstubAllGlobals();
	}
});

test("a refresh from the previous account cannot replace or revoke the new session", async () => {
	let finishRefresh: (value: ApiResponse) => void = () => {};
	let access: string | null = "old-access";
	let refresh: string | null = "old-refresh";
	const lost = vi.fn();
	const client = new ApiClient({
		baseUrl: "https://example.test",
		appVersion: "test",
		clientKind: "shell",
		requestId: () => "native-request",
		tokens: {
			getAccessToken: () => access,
			setAccessToken: (value) => {
				access = value;
			},
			getRefreshToken: () => refresh,
			setRefreshToken: (value) => {
				refresh = value;
			},
		},
		onSessionLost: lost,
		fetch: async (url) =>
			url.endsWith("/refresh")
				? new Promise<ApiResponse>((resolve) => {
						finishRefresh = resolve;
					})
				: {
						status: 401,
						ok: false,
						json: async () => ({}),
						blob: async () => {
							throw new Error("unused");
						},
					},
	});
	const pending = client.request("/v1/me").catch((error: unknown) => error);
	await vi.waitFor(() => expect(client.accessToken).toBe("old-access"));
	await new Promise((resolve) => setTimeout(resolve, 0));
	client.clearTokens();
	client.setSession({ accessToken: "new-access", refreshToken: "new-refresh" });
	finishRefresh({
		status: 200,
		ok: true,
		json: async () => ({ accessToken: "stale-access", refreshToken: "stale-refresh" }),
		blob: async () => {
			throw new Error("unused");
		},
	});
	expect(await pending).toMatchObject({ name: "AbortError" });
	expect(access).toBe("new-access");
	expect(refresh).toBe("new-refresh");
	expect(lost).not.toHaveBeenCalled();
});

test("a network failure during refresh preserves the session for recovery", async () => {
	const lost = vi.fn();
	const client = new ApiClient({
		baseUrl: "https://example.test",
		appVersion: "test",
		clientKind: "shell",
		requestId: () => "native-request",
		tokens: { getAccessToken: () => "expired", setAccessToken() {}, getRefreshToken: () => "refresh" },
		onSessionLost: lost,
		fetch: async (url) => {
			if (url.endsWith("/refresh")) throw new TypeError("offline");
			return {
				status: 401,
				ok: false,
				json: async () => ({}),
				blob: async () => {
					throw new Error("unused");
				},
			};
		},
	});
	await expect(client.request("/v1/me")).rejects.toMatchObject({ name: "NetworkError" });
	expect(lost).not.toHaveBeenCalled();
	expect(await client.refreshSession()).toBe(false);
});

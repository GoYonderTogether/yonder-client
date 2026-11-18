/**
 * The API client: the one place that decides how a request is shaped, when to refresh, and how a
 * failure becomes a typed error. Tested against a stubbed `fetch`, so the assertions are about
 * requests and decisions rather than a server.
 */
import { describe, expect, test, vi } from "vitest";
import type { TokenStore } from "./client.ts";
import { ApiClient, ApiError, NetworkError } from "./client.ts";
import { createEndpoints } from "./endpoints.ts";

/** The token store the web uses: the access token in memory, no refresh token (the cookie has it). */
function createMemoryTokenStore(): TokenStore {
	let accessToken: string | null = null;
	return {
		getAccessToken: () => accessToken,
		setAccessToken(token) {
			accessToken = token;
		},
	};
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

function errorResponse(code: string, status: number, extra: Record<string, unknown> = {}): Response {
	return jsonResponse(
		{ error: { code, message: "nope", messageKey: `errors.${code}`, requestId: "req_1", traceId: "tr_1", ...extra } },
		{ status },
	);
}

function client(
	fetchImpl: typeof fetch,
	tokens = createMemoryTokenStore(),
	kind: "web" | "shell" | "miniprogram" = "web",
) {
	return new ApiClient({
		baseUrl: "https://api.test",
		tokens,
		clientKind: kind,
		appVersion: "1.2.3",
		fetch: fetchImpl,
	});
}

describe("requests", () => {
	test("sends the access token and the client headers", async () => {
		const tokens = createMemoryTokenStore();
		tokens.setAccessToken("token-1");
		const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
		await client(fetchImpl as unknown as typeof fetch, tokens).request("/v1/me");

		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		const headers = new Headers(init.headers);
		expect(url).toBe("https://api.test/v1/me");
		expect(headers.get("authorization")).toBe("Bearer token-1");
		expect(headers.get("x-client-version")).toBe("1.2.3");
		expect(headers.get("x-client-platform")).toBe("web");
		expect(headers.get("x-request-id")).toBeTruthy();
		expect(init.credentials).toBe("include");
	});

	test("a shell marks itself, so the server returns the refresh token in the body", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
		await client(fetchImpl as unknown as typeof fetch, createMemoryTokenStore(), "shell").request("/v1/me");
		const headers = new Headers((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
		expect(headers.get("x-yonder-client")).toBe("shell");
		expect(headers.get("x-client-platform")).toBe("desktop");
	});

	test("a mini program identifies its transport for token delivery", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
		await client(fetchImpl as unknown as typeof fetch, createMemoryTokenStore(), "miniprogram").request("/v1/me");
		const headers = new Headers((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
		expect(headers.get("x-yonder-client")).toBe("miniprogram");
		expect(headers.get("x-client-platform")).toBe("miniprogram");
	});

	test("an unauthenticated call sends no bearer token", async () => {
		const tokens = createMemoryTokenStore();
		tokens.setAccessToken("token-1");
		const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
		await client(fetchImpl as unknown as typeof fetch, tokens).request("/v1/auth/code", {
			body: { target: "+8613800138000" },
			authenticated: false,
		});
		const headers = new Headers((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
		expect(headers.get("authorization")).toBeNull();
	});
});

describe("errors", () => {
	test("an unavailable memory file route exposes the response's real reason", async () => {
		const fetchImpl = async () => errorResponse("not_found", 404, { message: "Memory file endpoint is unavailable" });
		const api = createEndpoints(client(fetchImpl));
		await expect(api.memoryFile("/me/印象.md")).rejects.toMatchObject({
			status: 404,
			code: "not_found",
			message: "Memory file endpoint is unavailable",
		});
	});
	test("a business error is an ApiError with its code, details and request id", async () => {
		const fetchImpl = async () => errorResponse("code_invalid", 422, { details: { remainingAttempts: 3 } });
		const failure = await client(fetchImpl as unknown as typeof fetch)
			.request("/v1/auth/sign-in", { body: {}, authenticated: false })
			.catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(ApiError);
		const apiError = failure as ApiError;
		expect(apiError.code).toBe("code_invalid");
		expect(apiError.status).toBe(422);
		expect(apiError.details).toEqual({ remainingAttempts: 3 });
		expect(apiError.requestId).toBe("req_1");
	});

	test("a request that never reaches the server is a NetworkError, not an ApiError", async () => {
		const fetchImpl = async () => {
			throw new TypeError("fetch failed");
		};
		const failure = await client(fetchImpl as unknown as typeof fetch)
			.request("/v1/me")
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(NetworkError);
	});

	test("a malformed error body still yields an ApiError", async () => {
		const fetchImpl = async () => new Response("<html>502</html>", { status: 502 });
		const failure = await client(fetchImpl as unknown as typeof fetch)
			.request("/v1/me")
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(ApiError);
		expect((failure as ApiError).status).toBe(502);
	});
});

test("memory routes use the specified HTTP methods, query parameters and bodies", async () => {
	const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
	const api = createEndpoints(client(fetchImpl));
	const path = "/sources/会议/文 档?#.md";
	const prefix = "/sources/会议/";
	const edit = { path, content: "# Notes", expectedVersion: 2 };
	const visibility = { path, visibility: "public" } as const;
	const revert = { path, version: 1 };
	await Promise.all([
		api.memoryDays("2026-11-18", "Asia/Singapore"),
		api.memoryFiles(),
		api.memoryFiles(prefix),
		api.memoryFile(path),
		api.updateMemoryFile(edit),
		api.updateMemoryFileVisibility(visibility),
		api.deleteMemoryFile(path),
		api.memoryFileRevisions(path),
		api.revertMemoryFile(revert),
	]);
	expect(
		fetchImpl.mock.calls.map(([url, init]) => {
			const { pathname, searchParams } = new URL(String(url));
			return [
				init?.method,
				pathname,
				Object.fromEntries(searchParams),
				init?.body ? JSON.parse(String(init.body)) : null,
			];
		}),
	).toEqual([
		["GET", "/v1/memory/days", { cursor: "2026-11-18", tz: "Asia/Singapore" }, null],
		["GET", "/v1/memory/files", {}, null],
		["GET", "/v1/memory/files", { prefix }, null],
		["GET", "/v1/memory/files/content", { path }, null],
		["PUT", "/v1/memory/files/content", {}, edit],
		["PATCH", "/v1/memory/files/visibility", {}, visibility],
		["DELETE", "/v1/memory/files", { path }, null],
		["GET", "/v1/memory/files/revisions", { path }, null],
		["POST", "/v1/memory/files/revert", {}, revert],
	]);
});

describe("refresh", () => {
	test("a 401 refreshes once and retries the request", async () => {
		const tokens = createMemoryTokenStore();
		tokens.setAccessToken("stale");
		let calls = 0;
		const fetchImpl = vi.fn(async (url: string) => {
			calls += 1;
			if (String(url).endsWith("/v1/auth/refresh")) return jsonResponse({ accessToken: "fresh", expiresIn: 1800 });
			return calls === 1 ? errorResponse("token_expired", 401) : jsonResponse({ member: { id: "mem_1" } });
		});

		const result = await client(fetchImpl as unknown as typeof fetch, tokens).request<{ member: { id: string } }>(
			"/v1/me",
		);
		expect(result.member.id).toBe("mem_1");
		expect(tokens.getAccessToken()).toBe("fresh");
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	test("a refresh that fails reports the session lost instead of looping", async () => {
		const onSessionLost = vi.fn();
		const tokens = createMemoryTokenStore();
		tokens.setAccessToken("stale");
		const fetchImpl = vi.fn(async (url: string) => {
			if (String(url).endsWith("/v1/auth/refresh")) return errorResponse("refresh_reused", 401);
			return errorResponse("token_expired", 401);
		});
		const api = new ApiClient({
			baseUrl: "https://api.test",
			tokens,
			clientKind: "web",
			appVersion: "1.2.3",
			fetch: fetchImpl as unknown as typeof fetch,
			onSessionLost,
		});

		await expect(api.request("/v1/me")).rejects.toBeInstanceOf(ApiError);
		expect(onSessionLost).toHaveBeenCalledTimes(1);
		// One request, one refresh attempt, no retry of the original.
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	test("concurrent 401s share one refresh, because rotating twice looks like reuse", async () => {
		const tokens = createMemoryTokenStore();
		tokens.setAccessToken("stale");
		let refreshCalls = 0;
		const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
			if (String(url).endsWith("/v1/auth/refresh")) {
				refreshCalls += 1;
				return jsonResponse({ accessToken: "fresh" });
			}
			const authorization = new Headers(init?.headers).get("authorization");
			return authorization === "Bearer fresh" ? jsonResponse({ ok: true }) : errorResponse("token_expired", 401);
		});

		const api = client(fetchImpl as unknown as typeof fetch, tokens);
		await Promise.all([api.request("/v1/me"), api.request("/v1/me/sessions")]);
		expect(refreshCalls).toBe(1);
	});

	test("a shell with no refresh token does not attempt one", async () => {
		const onSessionLost = vi.fn();
		const fetchImpl = vi.fn(async () => errorResponse("unauthenticated", 401));
		const api = new ApiClient({
			baseUrl: "https://api.test",
			tokens: createMemoryTokenStore(),
			clientKind: "shell",
			appVersion: "1.2.3",
			fetch: fetchImpl as unknown as typeof fetch,
			onSessionLost,
		});
		await expect(api.request("/v1/me")).rejects.toBeInstanceOf(ApiError);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(onSessionLost).toHaveBeenCalled();
	});

	test("refreshSession reports whether a session was restored", async () => {
		const restored = client((async () => jsonResponse({ accessToken: "fresh" })) as unknown as typeof fetch);
		expect(await restored.refreshSession()).toBe(true);

		const none = client((async () => errorResponse("unauthenticated", 401)) as unknown as typeof fetch);
		expect(await none.refreshSession()).toBe(false);
	});
});

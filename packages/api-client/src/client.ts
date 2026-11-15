/**
 * The one place that knows how to talk to the server. Every call goes through `request`, so
 * credentials, headers, the error shape and the single retry-after-refresh live here once.
 *
 * Token storage is injected, because it differs per platform: an httpOnly cookie on the web, the
 * OS keychain in a shell. The client never touches `localStorage` for a token (10-质量 第四节).
 */
import type { ApiErrorBody, ErrorCode } from "@yonder/protocol";

export interface TokenStore {
	/** The access token, kept in memory by the caller. */
	getAccessToken(): string | null;
	setAccessToken(token: string | null): void;
	/** Shells keep the refresh token themselves; the web returns null and relies on the cookie. */
	getRefreshToken?(): string | null;
	setRefreshToken?(token: string | null): void;
}

export interface ApiClientOptions {
	baseUrl: string;
	tokens: TokenStore;
	/** `web` uses cookies; `shell` sends `X-Yonder-Client: shell` and keeps the refresh token itself. */
	clientKind: "web" | "shell";
	appVersion: string;
	/** Called when a 401 cannot be recovered: the app returns to the sign-in screen. */
	onSessionLost?: () => void;
	/** Injectable for tests. */
	fetch?: typeof fetch;
	now?: () => number;
}

export class ApiError extends Error {
	readonly code: ErrorCode;
	readonly status: number;
	readonly messageKey: string;
	readonly details: Record<string, unknown> | undefined;
	readonly requestId: string | undefined;

	constructor(options: {
		code: ErrorCode;
		status: number;
		message: string;
		messageKey?: string;
		details?: Record<string, unknown>;
		requestId?: string;
	}) {
		super(options.message);
		this.name = "ApiError";
		this.code = options.code;
		this.status = options.status;
		this.messageKey = options.messageKey ?? `errors.${options.code}`;
		this.details = options.details;
		this.requestId = options.requestId;
	}
}

/** A request that never reached the server. Distinguished so the interface can say "check your connection". */
export class NetworkError extends Error {
	constructor(cause: unknown) {
		super("the server could not be reached");
		this.name = "NetworkError";
		this.cause = cause;
	}
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	body?: unknown;
	/** `raw` bodies (an avatar) skip JSON encoding. */
	raw?: { bytes: BodyInit; contentType: string };
	signal?: AbortSignal;
	idempotencyKey?: string;
	/** Send the access token; default true for everything but the auth endpoints. */
	authenticated?: boolean;
	/** Internal: prevents a refresh loop. */
	retried?: boolean;
}

export class ApiClient {
	readonly #options: ApiClientOptions;
	#refreshing: Promise<boolean> | null = null;

	constructor(options: ApiClientOptions) {
		this.#options = options;
	}

	get baseUrl(): string {
		return this.#options.baseUrl;
	}

	async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
		const response = await this.#send(path, options);
		if (response.status === 401 && options.authenticated !== false && !options.retried) {
			const refreshed = await this.#refreshOnce();
			if (refreshed) return this.request<T>(path, { ...options, retried: true });
			this.#options.onSessionLost?.();
			throw await toApiError(response);
		}
		if (!response.ok) throw await toApiError(response);
		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}

	async #send(path: string, options: RequestOptions): Promise<Response> {
		const headers = new Headers();
		headers.set("accept", "application/json");
		headers.set("x-request-id", crypto.randomUUID());
		headers.set("x-client-version", this.#options.appVersion);
		headers.set("x-client-platform", this.#options.clientKind === "shell" ? "desktop" : "web");
		if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
		if (this.#options.clientKind === "shell") headers.set("x-yonder-client", "shell");

		if (options.authenticated !== false) {
			const token = this.#options.tokens.getAccessToken();
			if (token) headers.set("authorization", `Bearer ${token}`);
		}

		let body: BodyInit | null = null;
		if (options.raw) {
			headers.set("content-type", options.raw.contentType);
			body = options.raw.bytes;
		} else if (options.body !== undefined) {
			headers.set("content-type", "application/json");
			body = JSON.stringify(options.body);
		}

		try {
			return await (this.#options.fetch ?? fetch)(`${this.#options.baseUrl}${path}`, {
				method: options.method ?? (body ? "POST" : "GET"),
				headers,
				body,
				// The refresh cookie must travel, and only the refresh cookie needs to.
				credentials: "include",
				...(options.signal ? { signal: options.signal } : {}),
			});
		} catch (error) {
			if ((error as { name?: string }).name === "AbortError") throw error;
			throw new NetworkError(error);
		}
	}

	/**
	 * One refresh at a time: several requests failing together must not rotate the token twice,
	 * which would look like reuse and revoke the session.
	 */
	#refreshOnce(): Promise<boolean> {
		this.#refreshing ??= this.#refresh().finally(() => {
			this.#refreshing = null;
		});
		return this.#refreshing;
	}

	async #refresh(): Promise<boolean> {
		const refreshToken = this.#options.tokens.getRefreshToken?.() ?? null;
		if (this.#options.clientKind === "shell" && !refreshToken) return false;
		try {
			const response = await this.#send("/v1/auth/refresh", {
				method: "POST",
				body: refreshToken ? { refreshToken } : {},
				authenticated: false,
				retried: true,
			});
			if (!response.ok) return false;
			const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
			if (!body.accessToken) return false;
			this.#options.tokens.setAccessToken(body.accessToken);
			if (body.refreshToken) this.#options.tokens.setRefreshToken?.(body.refreshToken);
			return true;
		} catch {
			return false;
		}
	}

	/** Drop the in-memory token. The refresh cookie is cleared by the sign-out endpoint. */
	clearTokens(): void {
		this.#options.tokens.setAccessToken(null);
		this.#options.tokens.setRefreshToken?.(null);
	}

	/** Save the newly authenticated session after the previous account's cache is cleared. */
	setSession(session: { accessToken: string; refreshToken?: string }): void {
		this.#options.tokens.setAccessToken(session.accessToken);
		this.#options.tokens.setRefreshToken?.(session.refreshToken ?? null);
	}

	/** The current access token, for the realtime handshake. Never logged. */
	get accessToken(): string | null {
		return this.#options.tokens.getAccessToken();
	}

	/**
	 * Try to restore a session without any request failing first: the start-up path, where "no
	 * session" is the normal answer rather than an error.
	 */
	async refreshSession(): Promise<boolean> {
		return this.#refreshOnce();
	}
}

async function toApiError(response: Response): Promise<ApiError> {
	let body: ApiErrorBody | null = null;
	try {
		body = (await response.json()) as ApiErrorBody;
	} catch {
		body = null;
	}
	const error = body?.error;
	return new ApiError({
		code: error?.code ?? (response.status === 401 ? "unauthenticated" : "internal"),
		status: response.status,
		message: error?.message ?? `HTTP ${response.status}`,
		...(error?.messageKey ? { messageKey: error.messageKey } : {}),
		...(error?.details ? { details: error.details } : {}),
		...(error?.requestId ? { requestId: error.requestId } : {}),
	});
}

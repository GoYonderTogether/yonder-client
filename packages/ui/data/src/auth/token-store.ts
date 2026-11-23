/**
 * The access token, in memory and nowhere else on the web (10-质量 第四节). A shell overrides the
 * refresh half with its keychain; the web leaves it to the httpOnly cookie.
 */
import type { TokenStore } from "@yonder/api-client";

export interface MemoryTokenStore extends TokenStore {
	/** Replace the shell's refresh-token behaviour; the web leaves it undefined. */
	withRefreshStorage(storage: {
		get(): string | null;
		set(value: string | null): void | Promise<void>;
	}): MemoryTokenStore;
}

export function createMemoryTokenStore(onAccessToken?: (firstToken: boolean) => void): MemoryTokenStore {
	let accessToken: string | null = null;
	let refreshStorage: Parameters<MemoryTokenStore["withRefreshStorage"]>[0] | null = null;

	const store: MemoryTokenStore = {
		getAccessToken: () => accessToken,
		setAccessToken: (token) => {
			const firstToken = accessToken === null;
			accessToken = token;
			if (token) onAccessToken?.(firstToken);
		},
		withRefreshStorage(storage) {
			refreshStorage = storage;
			return store;
		},
	};

	// Only present when a shell supplied storage; on the web the cookie is the refresh token.
	Object.defineProperty(store, "getRefreshToken", {
		value: () => refreshStorage?.get() ?? null,
		enumerable: true,
	});
	Object.defineProperty(store, "setRefreshToken", {
		value: (value: string | null) => refreshStorage?.set(value),
		enumerable: true,
	});

	return store;
}

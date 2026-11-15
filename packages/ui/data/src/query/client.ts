/**
 * The query cache, with persistence to the storage adapter (08 第二节第 2 层).
 *
 * The rules that matter for this slice:
 *
 * - `me` is restored from storage on start, so the shell paints the name and avatar before the
 *   network answers, and revalidates in the background (08 第十二节).
 * - Retries are for network failures only. A business error (a wrong code) is not retried.
 * - Signing out clears memory, storage and the cache together (08 第十节).
 */
import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { ApiError, NetworkError } from "@yonder/api-client";

export const CACHE_STORAGE_KEY = "yonder.query-cache";
export const CACHE_VERSION = "2";
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** What the persister needs: a string store. `Storage` from `../storage` satisfies it. */
export interface KeyValueStore {
	get(key: string): string | null;
	set(key: string, value: string): void;
	remove(key: string): void;
}

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// The interface paints from cache first and revalidates in the background.
				staleTime: 60_000,
				gcTime: CACHE_MAX_AGE_MS,
				refetchOnWindowFocus: false,
				retry: (failureCount, error) => {
					if (error instanceof ApiError) return false;
					if (error instanceof NetworkError) return failureCount < 2;
					return false;
				},
			},
			mutations: { retry: false },
		},
	});
}

/** A persister over a key-value store, so the web (localStorage) and a shell (its own store) share one shape. */
export function createPersister(store: KeyValueStore): Persister & { activate(): void; dispose(): void } {
	let pending: PersistedClient | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let active = true;
	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		pending = undefined;
	};
	const flush = () => {
		const client = pending;
		cancel();
		if (client) {
			try {
				store.set(CACHE_STORAGE_KEY, JSON.stringify(client));
			} catch {
				// Cache persistence is optional; keep the live query cache usable.
			}
		}
	};
	return {
		persistClient: (client: PersistedClient) => {
			if (!active) return;
			pending = client;
			if (timer === undefined) timer = setTimeout(flush, 1000);
		},
		restoreClient: async () => {
			const raw = store.get(CACHE_STORAGE_KEY);
			if (!raw) return undefined;
			try {
				return JSON.parse(raw) as PersistedClient;
			} catch {
				// A corrupt blob is dropped, not repaired: a broken cache must not block a start.
				store.remove(CACHE_STORAGE_KEY);
				return undefined;
			}
		},
		removeClient: async () => {
			cancel();
			store.remove(CACHE_STORAGE_KEY);
		},
		activate: () => {
			active = true;
		},
		dispose: () => {
			active = false;
			flush();
		},
	};
}

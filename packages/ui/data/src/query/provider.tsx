/**
 * The one Provider the app mounts. It owns the API client, the query cache, its persistence, the
 * realtime connection and the sign-out sweep, so a feature calls `useMe()` and trusts the rest.
 */

import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { Endpoints } from "@yonder/api-client";
import { ApiClient, createEndpoints } from "@yonder/api-client";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { createMemoryTokenStore } from "../auth/token-store.ts";
import { RealtimeConnection } from "../realtime/connection.ts";
import { clearChatCache } from "../storage/chat-cache.ts";
import type { Storage } from "../storage/index.ts";
import { createDefaultStorage } from "../storage/index.ts";
import {
	CACHE_MAX_AGE_MS,
	CACHE_STORAGE_KEY,
	CACHE_VERSION,
	createPersister,
	createQueryClient,
	dehydrateOptions,
} from "./client.ts";
import { keys } from "./keys.ts";

export interface DataProviderProps {
	/** Origin of the API: `""` on the web (same origin), the server address inside a shell. */
	baseUrl: string;
	appVersion: string;
	clientKind: "web" | "shell";
	/** A shell supplies keychain-backed storage for the refresh token. */
	refreshTokenStorage?: { get(): string | null; set(value: string | null): void | Promise<void> };
	/** Access-only session borrowed by an auxiliary shell window. */
	refreshAccessToken?: () => Promise<string | null>;
	/** Close auxiliary windows before the account changes. */
	onSessionChange?: () => void | Promise<void>;
	/** Override for tests. */
	storage?: Storage;
	children: ReactNode;
}

export interface DataContextValue {
	client: ApiClient;
	api: Endpoints;
	realtime: RealtimeConnection;
	storage: Storage;
	/** Development only: drop the access token without touching the refresh credential. */
	expireAccessTokenForDev?: () => void;
	/** Drop every trace of the signed-in user: token, cache, stored preferences. */
	signOutLocal: () => Promise<void>;
	/** Replace the previous account's data with a newly authenticated session. */
	startSession: (session: { accessToken: string; refreshToken?: string }) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({
	baseUrl,
	appVersion,
	clientKind,
	refreshTokenStorage,
	refreshAccessToken,
	onSessionChange,
	storage: injectedStorage,
	children,
}: DataProviderProps) {
	const storage = useMemo(() => injectedStorage ?? createDefaultStorage(), [injectedStorage]);
	const queryClient = useMemo(() => createQueryClient(), []);
	const persister = useMemo(() => createPersister(storage), [storage]);
	useEffect(() => {
		persister.activate();
		return () => persister.dispose();
	}, [persister]);
	const clientParts = useMemo(() => {
		const tokens = createMemoryTokenStore();
		if (refreshTokenStorage) tokens.withRefreshStorage(refreshTokenStorage);
		const client = new ApiClient({
			baseUrl,
			tokens,
			clientKind,
			appVersion,
			...(refreshAccessToken ? { refreshAccessToken } : {}),
			onSessionLost: () => {
				void onSessionChange?.();
				queryClient.removeQueries({ queryKey: keys.memory.all() });
				useSessionStore.setState({ status: "signed-out", booting: false });
			},
		});
		return import.meta.env.DEV ? { client, expireAccessTokenForDev: () => tokens.setAccessToken(null) } : { client };
	}, [baseUrl, clientKind, appVersion, refreshTokenStorage, refreshAccessToken, onSessionChange, queryClient]);
	const { client } = clientParts;

	const api = useMemo(() => createEndpoints(client), [client]);
	const realtime = useMemo(
		() => new RealtimeConnection({ baseUrl, getAccessToken: () => client.accessToken }),
		[baseUrl, client],
	);
	const pendingSignOut = useRef<Promise<void> | undefined>(undefined);

	const value = useMemo<DataContextValue>(
		() => ({
			...clientParts,
			api,
			realtime,
			storage,
			async startSession(session) {
				await onSessionChange?.();
				await clearChatCache();
				realtime.stop();
				queryClient.clear();
				await persister.removeClient();
				storage.remove(CACHE_STORAGE_KEY);
				await client.setSession(session);
				useSessionStore.setState({ status: "signed-in", booting: false });
			},
			signOutLocal() {
				// An explicit sign-out and the realtime revocation can arrive together.
				pendingSignOut.current ??= Promise.resolve()
					.then(async () => {
						await onSessionChange?.();
						await clearChatCache();
						await client.clearTokens();
						realtime.stop();
						queryClient.clear();
						await persister.removeClient();
						// Theme and language are device preferences and stay on the sign-in screen.
						storage.remove(CACHE_STORAGE_KEY);
						useSessionStore.setState({ status: "signed-out", booting: false });
					})
					.finally(() => {
						pendingSignOut.current = undefined;
					});
				return pendingSignOut.current;
			},
		}),
		[clientParts, client, api, realtime, storage, queryClient, persister, onSessionChange],
	);

	return (
		<DataContext.Provider value={value}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{
					persister,
					maxAge: CACHE_MAX_AGE_MS,
					buster: CACHE_VERSION,
					dehydrateOptions,
				}}
			>
				<SessionBootstrapper />
				{children}
			</PersistQueryClientProvider>
		</DataContext.Provider>
	);
}

/**
 * Restore the access token from the cookie or keychain after a reload. Keep waiting through a
 * restart or network outage so a returning user does not have to sign in again.
 */
function SessionBootstrapper() {
	const { client } = useData();
	useEffect(() => {
		let cancelled = false;
		let retry: ReturnType<typeof setTimeout> | undefined;
		const pending = () => !cancelled && useSessionStore.getState().booting;
		async function restore() {
			if (!pending()) return;
			try {
				const ok = await client.refreshSession({ throwOnUnavailable: true });
				if (pending()) useSessionStore.setState({ status: ok ? "signed-in" : "signed-out", booting: false });
			} catch {
				if (!pending()) return;
				useSessionStore.setState({ status: "reconnecting" });
				retry = setTimeout(() => void restore(), 5000);
			}
		}
		useSessionStore.setState({ status: "unknown", booting: true });
		void restore();
		return () => {
			cancelled = true;
			clearTimeout(retry);
		};
	}, [client]);

	return null;
}

export function useData(): DataContextValue {
	const value = useContext(DataContext);
	if (!value) throw new Error("useData must be used inside <DataProvider>");
	return value;
}

export function useApi(): Endpoints {
	return useData().api;
}

/** The query cache, for the rare caller that needs to invalidate directly. */
export function useDataQueryClient() {
	return useQueryClient();
}

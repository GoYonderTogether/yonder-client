/**
 * The one Provider the app mounts. It owns the API client, the query cache, its persistence, the
 * realtime connection and the sign-out sweep, so a feature calls `useMe()` and trusts the rest.
 */

import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { Endpoints } from "@yonder/api-client";
import { ApiClient, createEndpoints } from "@yonder/api-client";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { createMemoryTokenStore } from "../auth/token-store.ts";
import { RealtimeConnection } from "../realtime/connection.ts";
import type { Storage } from "../storage/index.ts";
import { createDefaultStorage } from "../storage/index.ts";
import { CACHE_MAX_AGE_MS, CACHE_STORAGE_KEY, CACHE_VERSION, createPersister, createQueryClient } from "./client.ts";

export interface DataProviderProps {
	/** Origin of the API: `""` on the web (same origin), the server address inside a shell. */
	baseUrl: string;
	appVersion: string;
	clientKind: "web" | "shell";
	/** A shell supplies keychain-backed storage for the refresh token. */
	refreshTokenStorage?: { get(): string | null; set(value: string | null): void };
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
	const setStatus = useSessionStore((state) => state.setStatus);

	const clientParts = useMemo(() => {
		const tokens = createMemoryTokenStore();
		if (refreshTokenStorage) tokens.withRefreshStorage(refreshTokenStorage);
		const client = new ApiClient({
			baseUrl,
			tokens,
			clientKind,
			appVersion,
			onSessionLost: () => setStatus("signed-out"),
		});
		return import.meta.env.DEV ? { client, expireAccessTokenForDev: () => tokens.setAccessToken(null) } : { client };
	}, [baseUrl, clientKind, appVersion, refreshTokenStorage, setStatus]);
	const { client } = clientParts;

	const api = useMemo(() => createEndpoints(client), [client]);
	const realtime = useMemo(
		() => new RealtimeConnection({ baseUrl, getAccessToken: () => client.accessToken }),
		[baseUrl, client],
	);

	const value = useMemo<DataContextValue>(
		() => ({
			...clientParts,
			api,
			realtime,
			storage,
			async startSession(session) {
				realtime.stop();
				queryClient.clear();
				await persister.removeClient();
				storage.remove(CACHE_STORAGE_KEY);
				client.setSession(session);
				setStatus("signed-in");
			},
			async signOutLocal() {
				client.clearTokens();
				realtime.stop();
				queryClient.clear();
				await persister.removeClient();
				// The query cache holds the account's data and goes. Theme and language are device
				// preferences, not the account's, and stay: the sign-in screen should not change colour.
				storage.remove(CACHE_STORAGE_KEY);
				setStatus("signed-out");
			},
		}),
		[clientParts, client, api, realtime, storage, queryClient, persister, setStatus],
	);

	return (
		<DataContext.Provider value={value}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: CACHE_VERSION }}
			>
				<SessionBootstrapper />
				{children}
			</PersistQueryClientProvider>
		</DataContext.Provider>
	);
}

/**
 * One refresh attempt before the first screen decides what to show: the access token lives in
 * memory, so after a reload the cookie (or the keychain) is the only way back in.
 */
function SessionBootstrapper() {
	const { client } = useData();
	const setStatus = useSessionStore((state) => state.setStatus);
	const setBooting = useSessionStore((state) => state.setBooting);

	useEffect(() => {
		let cancelled = false;
		void client.refreshSession().then((ok) => {
			if (cancelled) return;
			setStatus(ok ? "signed-in" : "signed-out");
			setBooting(false);
		});
		return () => {
			cancelled = true;
		};
	}, [client, setStatus, setBooting]);

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

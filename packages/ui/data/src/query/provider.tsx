/**
 * The one Provider the app mounts. It owns the API client, the query cache, its persistence, the
 * realtime connection and the sign-out sweep, so a feature calls `useMe()` and trusts the rest.
 */

import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { Endpoints } from "@yonder/api-client";
import { ApiClient, createEndpoints } from "@yonder/api-client";
import type { MeResponse } from "@yonder/protocol";
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
const WEB_SESSION_EXPIRY = "session-expiry";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

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
		const realtime: RealtimeConnection = new RealtimeConnection({
			baseUrl,
			getAccessToken: () => tokens.getAccessToken(),
		});
		const tokens = createMemoryTokenStore((firstToken) => {
			if (clientKind === "web") storage.set(WEB_SESSION_EXPIRY, String(Date.now() + SESSION_LIFETIME_MS));
			// Cached data may already have opened the app before it had an access token.
			if (firstToken && useSessionStore.getState().status === "signed-in") realtime.connect();
		});
		if (refreshTokenStorage) tokens.withRefreshStorage(refreshTokenStorage);
		const client = new ApiClient({
			baseUrl,
			tokens,
			clientKind,
			appVersion,
			...(refreshAccessToken ? { refreshAccessToken } : {}),
			onSessionLost: () => {
				void onSessionChange?.();
				if (clientKind === "web") storage.set(WEB_SESSION_EXPIRY, "0");
				queryClient.removeQueries({ queryKey: keys.memory.all() });
				useSessionStore.setState({ status: "signed-out", booting: false });
			},
		});
		return import.meta.env.DEV
			? { client, realtime, expireAccessTokenForDev: () => tokens.setAccessToken(null) }
			: { client, realtime };
	}, [baseUrl, clientKind, appVersion, refreshTokenStorage, refreshAccessToken, onSessionChange, queryClient, storage]);
	const { client, realtime } = clientParts;

	const api = useMemo(() => createEndpoints(client), [client]);
	const pendingSignOut = useRef<Promise<void> | undefined>(undefined);

	const value = useMemo<DataContextValue>(
		() => ({
			...clientParts,
			api,
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
						if (clientKind === "web") storage.set(WEB_SESSION_EXPIRY, "0");
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
		[clientParts, client, clientKind, api, realtime, storage, queryClient, persister, onSessionChange],
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
				<SessionBootstrapper web={clientKind === "web"} refreshTokenStorage={refreshTokenStorage} />
				{children}
			</PersistQueryClientProvider>
		</DataContext.Provider>
	);
}

/**
 * Identify a prior session from platform storage before checking it with the server.
 * This lets the existing cache open for returning users while offline.
 */
function SessionBootstrapper({
	web,
	refreshTokenStorage,
}: {
	web: boolean;
	refreshTokenStorage: DataProviderProps["refreshTokenStorage"];
}) {
	const { client, storage } = useData();
	const queryClient = useQueryClient();
	const restoring = useIsRestoring();
	useEffect(() => {
		if (restoring) return;
		let cancelled = false;
		let expires = web ? storage.get(WEB_SESSION_EXPIRY) : null;
		if (web && expires === null) {
			// Earlier versions already persist the authenticated profile.
			const profile = queryClient.getQueryState<MeResponse>(keys.me());
			if (profile?.data?.member?.id) {
				expires = String(profile.dataUpdatedAt + SESSION_LIFETIME_MS);
				storage.set(WEB_SESSION_EXPIRY, expires);
			}
		}
		const known = web ? Number(expires) > Date.now() : Boolean(refreshTokenStorage?.get());
		useSessionStore.setState(known ? { status: "signed-in", booting: false } : { status: "unknown", booting: true });
		void client
			.refreshSession({ throwOnUnavailable: true })
			.then((ok) => {
				if (cancelled || ok !== Boolean(client.accessToken)) return;
				if (!ok && web) storage.set(WEB_SESSION_EXPIRY, "0");
				useSessionStore.setState({ status: ok ? "signed-in" : "signed-out", booting: false });
			})
			.catch(() => {
				// A temporary failure leaves the current UI and stored credential alone.
			});
		return () => {
			cancelled = true;
		};
	}, [client, queryClient, refreshTokenStorage, restoring, storage, web]);

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

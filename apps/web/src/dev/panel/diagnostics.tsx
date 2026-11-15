import { CACHE_STORAGE_KEY, useData, useDataQueryClient, useHealth, useMe, useSessionStore } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { BUILD_VERSION } from "../../lib/config.ts";
import { accessTokenExpiry } from "./token-expiry.ts";

const actions = "dev-panel-actions";
const rows = "dev-panel-rows";

export function DiagnosticsSections() {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(timer);
	}, []);
	return (
		<>
			<SessionSection now={now} refresh={() => setNow(Date.now())} />
			<RealtimeSection refresh={() => setNow(Date.now())} />
			<CacheSection />
			<BuildSection />
		</>
	);
}

function SessionSection({ now, refresh }: { now: number; refresh: () => void }) {
	const status = useSessionStore((state) => state.status);
	const { api, client, signOutLocal, expireAccessTokenForDev } = useData();
	const me = useMe({ enabled: status === "signed-in" });
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const expiresAt = accessTokenExpiry(client.accessToken);
	const seconds = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1_000));
	const expiry =
		seconds === null ? "No access token" : seconds === 0 ? "Expired" : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	const person = status === "signed-in" ? me.data?.member : undefined;
	const bot = status === "signed-in" ? me.data?.bot : undefined;

	async function signOut(allDevices: boolean) {
		setPending(true);
		setError(null);
		try {
			await api.signOut(allDevices ? { allDevices: true } : {});
			await signOutLocal();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Sign out failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<details>
			<summary>Session</summary>
			<dl className={rows}>
				<dt>Status</dt>
				<dd>{status}</dd>
				<dt>Handle</dt>
				<dd>{person?.handle ?? "—"}</dd>
				<dt>Person ID</dt>
				<dd>
					<code>{person?.id ?? "—"}</code>
				</dd>
				<dt>Bot ID</dt>
				<dd>
					<code>{bot?.id ?? "—"}</code>
				</dd>
				<dt>Access expires</dt>
				<dd>{expiry}</dd>
			</dl>
			<div className={actions}>
				<button
					type="button"
					disabled={!client.accessToken || !expireAccessTokenForDev}
					onClick={() => {
						expireAccessTokenForDev?.();
						refresh();
					}}
				>
					Expire access token
				</button>
				<button type="button" disabled={status !== "signed-in" || pending} onClick={() => void signOut(false)}>
					Sign out
				</button>
				<button type="button" disabled={status !== "signed-in" || pending} onClick={() => void signOut(true)}>
					Sign out all devices
				</button>
			</div>
			{error ? <p role="alert">{error}</p> : null}
		</details>
	);
}

type EventSummary = { type: string; at: string; eventId: string };

function RealtimeSection({ refresh }: { refresh: () => void }) {
	const { client, realtime } = useData();
	const session = useSessionStore((state) => state.status);
	const [events, setEvents] = useState<EventSummary[]>([]);

	useEffect(() => {
		const record = (event: Event) => {
			setEvents((previous) => [(event as CustomEvent<EventSummary>).detail, ...previous].slice(0, 8));
		};
		window.addEventListener("yonder-dev-realtime-event", record);
		return () => window.removeEventListener("yonder-dev-realtime-event", record);
	}, []);

	const canConnect =
		session === "signed-in" && !!client.accessToken && (realtime.status === "idle" || realtime.status === "stopped");
	return (
		<details>
			<summary>Realtime</summary>
			<p>
				State: <strong>{realtime.status}</strong>
			</p>
			<div className={actions}>
				<button
					type="button"
					disabled={realtime.status === "stopped" || realtime.status === "idle"}
					onClick={() => {
						realtime.stop();
						refresh();
					}}
				>
					Disconnect
				</button>
				<button
					type="button"
					disabled={!canConnect}
					onClick={() => {
						realtime.connect();
						refresh();
					}}
				>
					Reconnect
				</button>
			</div>
			{events.length === 0 ? (
				<p>No events received</p>
			) : (
				<ul>
					{events.map((event) => (
						<li key={event.eventId}>
							<code>{event.type}</code> · {event.at} · <code>{event.eventId}</code>
						</li>
					))}
				</ul>
			)}
		</details>
	);
}

function CacheSection() {
	const queryClient = useDataQueryClient();
	const { storage } = useData();
	const [, setRevision] = useState(0);
	useEffect(() => {
		let disposed = false;
		let scheduled = false;
		const unsubscribe = queryClient.getQueryCache().subscribe(() => {
			if (scheduled) return;
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				if (!disposed) setRevision((value) => value + 1);
			});
		});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, [queryClient]);
	const queries = queryClient.getQueryCache().getAll();
	return (
		<details>
			<summary>Cache</summary>
			<div className={actions}>
				<button type="button" onClick={() => void queryClient.invalidateQueries()}>
					Invalidate all
				</button>
				<button type="button" onClick={() => storage.remove(CACHE_STORAGE_KEY)}>
					Clear persisted cache
				</button>
			</div>
			{queries.length === 0 ? (
				<p>No queries</p>
			) : (
				<ul>
					{queries.map((query) => (
						<li key={query.queryHash}>
							<div>
								<code>{JSON.stringify(query.queryKey)}</code> · {query.state.status} · {query.state.fetchStatus}
							</div>
							<div className="dev-panel-query-meta">
								<span>
									Updated: {query.state.dataUpdatedAt ? new Date(query.state.dataUpdatedAt).toLocaleString() : "—"}
								</span>
								<button
									type="button"
									onClick={() => void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true })}
								>
									Invalidate
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</details>
	);
}

function BuildSection() {
	const { client } = useData();
	const health = useHealth();
	return (
		<details>
			<summary>Build</summary>
			<dl className={rows}>
				<dt>App version</dt>
				<dd>{BUILD_VERSION}</dd>
				<dt>Server version</dt>
				<dd>{health.data?.version ?? "—"}</dd>
				<dt>Mode</dt>
				<dd>{import.meta.env.MODE}</dd>
				<dt>API base</dt>
				<dd>
					<code>{client.baseUrl || globalThis.location.origin}</code>
				</dd>
			</dl>
		</details>
	);
}

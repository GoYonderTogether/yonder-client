import type { ConnectorInstance } from "@yonder/protocol";
import { chatCacheGeneration, chatCacheKeys, removeChatCache, useData } from "@yonder/ui-data";
import { useEffect } from "react";

const prefix = (account: string) => `device-file:${encodeURIComponent(account)}:`;
const revisionKey = (connection: ConnectorInstance) => `${encodeURIComponent(connection.id)}:${connection.revision}:`;

/** One last verified version per resource. The account cache already handles sign-out. */
export const deviceFileCacheKey = (account: string, connection: ConnectorInstance, path: string) =>
	`${prefix(account)}${revisionKey(connection)}${encodeURIComponent(path)}`;

const versionPrefix = (key: string, sha256 = "") => `${key}:version:${sha256}`;

export const deviceFileVersionKey = (key: string, sha256: string, part: number | "original") =>
	`${versionPrefix(key, sha256)}:${part}`;

export async function clearDeviceFileCache(key: string, keepSha256?: string) {
	const keys = await chatCacheKeys(versionPrefix(key));
	const keep = keepSha256 && `${versionPrefix(key, keepSha256)}:`;
	await Promise.all([
		keep ? undefined : removeChatCache(key),
		...keys.filter((part) => !keep || !part.startsWith(keep)).map(removeChatCache),
	]);
}

/** Closed readers also lose cached bytes when their grant is removed or replaced. */
export function useDeviceFileCacheMaintenance(account: string | undefined) {
	const { api, realtime } = useData();
	useEffect(() => {
		if (!account) return;
		let active = true;
		let attempt = 0;
		const owned = prefix(account);
		async function prune() {
			const current = ++attempt;
			const generation = chatCacheGeneration();
			const cached = await chatCacheKeys(owned);
			if (!cached.length || !active || current !== attempt) return;
			const { items } = await api.connectors();
			if (!active || current !== attempt || generation !== chatCacheGeneration()) return;
			const valid = new Set(items.filter((item) => item.connectorId === "local-files").map(revisionKey));
			await Promise.all(
				cached.map((key) => {
					const [id, revision] = key.slice(owned.length).split(":", 2);
					return valid.has(`${id}:${revision}:`) ? undefined : removeChatCache(key);
				}),
			);
		}
		const refresh = () => void prune().catch(() => {});
		if (realtime.status === "open") refresh();
		const stopStatus = realtime.subscribe(() => {
			if (realtime.status === "open") refresh();
		});
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connectors.changed" || event.type === "devices.changed") refresh();
		});
		return () => {
			active = false;
			stopStatus();
			stopEvents();
		};
	}, [account, api, realtime]);
}

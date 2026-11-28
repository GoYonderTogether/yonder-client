import type { LocalFilesAdapter } from "@yonder/feature-me";
import type { AppleConnectorId, ConnectorId } from "@yonder/protocol";
import { useDevices, useMe, useSessionStore, useSessions } from "@yonder/ui-data";
import { useEffect, useMemo, useState } from "react";
import {
	type AppleResourcePermission,
	activateAppleResources,
	appleResourceStatuses,
	openAppleResourceSettings,
	requestAppleResourcePermission,
	resetAppleResources,
	revokeAppleResourceGrant,
	writeAppleResourceGrant,
} from "./apple-resources.ts";
import { isContactWindow } from "./contact-window.ts";
import { isForeground, subscribeForeground } from "./foreground.ts";
import { isTauri } from "./keychain.ts";

export interface LocalFilesContext {
	ownerId: string;
	deviceId: string;
	sessionId: string;
}

const grantListeners = new Set<(revokedConnectionId?: string) => void>();
const appleContexts = new Map<string, LocalFilesContext>();
const appleContextKey = ({ ownerId, deviceId, sessionId }: LocalFilesContext) =>
	JSON.stringify([ownerId, deviceId, sessionId]);
export function onLocalFilesChanged(listener: (revokedConnectionId?: string) => void): () => void {
	grantListeners.add(listener);
	return () => {
		grantListeners.delete(listener);
	};
}
function changed(revokedConnectionId?: string) {
	for (const listener of grantListeners) listener(revokedConnectionId);
}

export function localFilesSupported(): boolean {
	return (
		isTauri() &&
		!isContactWindow() &&
		typeof navigator !== "undefined" &&
		!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) &&
		!(/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
	);
}

export function appleResourcesSupported(): boolean {
	return isTauri() && !isContactWindow() && /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAppleConnector(id: ConnectorId): id is AppleConnectorId {
	return id === "apple-calendar" || id === "apple-photos" || id === "apple-notes" || id === "apple-voice-memos";
}

export async function activateAppleConnectors(context: LocalFilesContext): Promise<void> {
	appleContexts.set(appleContextKey(context), context);
	await activateAppleResources(context);
}

export async function resetAppleConnectors(context: LocalFilesContext): Promise<void> {
	if (appleContexts.delete(appleContextKey(context))) await resetAppleResources(context);
}

export async function invokeLocalFiles<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(command, args);
}

export async function resetLocalFiles(): Promise<void> {
	await Promise.all([
		localFilesSupported() ? invokeLocalFiles("local_files_reset") : Promise.resolve(),
		...Array.from(appleContexts.values(), (context) => resetAppleConnectors(context).catch(() => {})),
	]);
	changed();
}

export function createLocalFilesAdapter(
	context: LocalFilesContext,
	statuses: Partial<Record<AppleConnectorId, AppleResourcePermission>> = {},
): LocalFilesAdapter {
	return {
		supported: localFilesSupported(),
		supports(connectorId) {
			return isAppleConnector(connectorId)
				? statuses[connectorId] !== undefined && statuses[connectorId] !== "unsupported"
				: localFilesSupported();
		},
		permissionStatus: (connectorId) => (isAppleConnector(connectorId) ? statuses[connectorId] : undefined),
		async prepare(connectorId) {
			if (!isAppleConnector(connectorId)) return;
			const status = await requestAppleResourcePermission(connectorId);
			if (status === "granted" || status === "limited") return;
			if (connectorId === "apple-voice-memos" && (status === "unavailable" || status === "unsupported"))
				throw new Error(`voice_memos_${status}`);
			throw new Error(
				status === "unavailable" && connectorId === "apple-notes" ? "notes_unavailable" : "permission_denied",
			);
		},
		async openPermissionSettings(connectorId) {
			if (isAppleConnector(connectorId)) await openAppleResourceSettings(connectorId);
		},
		async authorize(config) {
			if (isAppleConnector(config.connectorId)) {
				await activateAppleConnectors(context);
				await writeAppleResourceGrant(context, {
					id: config.id,
					connectorId: config.connectorId,
					revision: config.revision,
				});
			} else {
				await invokeLocalFiles("local_files_activate", { context });
				await invokeLocalFiles("local_files_authorize", { context, config });
			}
			changed();
		},
		async revoke(connectionId, connectorId) {
			if (connectorId && isAppleConnector(connectorId)) await revokeAppleResourceGrant(context, connectionId);
			else await invokeLocalFiles("local_files_revoke", { context, connectionId });
			changed(connectionId);
		},
	};
}

export function useLocalFilesContext(): LocalFilesContext | null {
	const status = useSessionStore((state) => state.status);
	const enabled = status === "signed-in" && (localFilesSupported() || appleResourcesSupported());
	const me = useMe({ enabled });
	const devices = useDevices({ enabled });
	const sessions = useSessions({ enabled });
	const ownerId = me.data?.member.id;
	// This window's own device, taken from its own session: the account's "current" device is the
	// newest session's, which in another window or on another device may not be this one at all.
	const currentSession = sessions.data?.items.find((session) => session.current);
	const deviceId = currentSession?.deviceId ?? devices.data?.items.find((device) => device.current)?.id;
	const sessionId = currentSession?.id;
	return useMemo(
		() => (enabled && ownerId && deviceId && sessionId ? { ownerId, deviceId, sessionId } : null),
		[enabled, ownerId, deviceId, sessionId],
	);
}

export function useLocalFilesAdapter(): LocalFilesAdapter | undefined {
	const context = useLocalFilesContext();
	const apple = context !== null && appleResourcesSupported();
	const [statuses, setStatuses] = useState<Partial<Record<AppleConnectorId, AppleResourcePermission>>>({});
	useEffect(() => {
		if (!apple) return;
		let active = true;
		let revision = 0;
		const refresh = () => {
			const current = ++revision;
			void appleResourceStatuses()
				.then((result) => {
					if (active && current === revision) setStatuses(result);
				})
				.catch(() => {});
		};
		const stop = subscribeForeground(() => {
			if (isForeground()) refresh();
		});
		const stopChanges = onLocalFilesChanged(refresh);
		refresh();
		return () => {
			active = false;
			stop();
			stopChanges();
		};
	}, [apple]);
	return useMemo(() => (context ? createLocalFilesAdapter(context, statuses) : undefined), [context, statuses]);
}

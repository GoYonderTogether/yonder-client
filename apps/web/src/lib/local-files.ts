import type { LocalFilesAdapter } from "@yonder/feature-me";
import { useDevices, useMe, useSessionStore, useSessions } from "@yonder/ui-data";
import { useMemo } from "react";
import { isContactWindow } from "./contact-window.ts";
import { isTauri } from "./keychain.ts";

export interface LocalFilesContext {
	ownerId: string;
	deviceId: string;
	sessionId: string;
}

const grantListeners = new Set<() => void>();
export function onLocalFilesChanged(listener: () => void): () => void {
	grantListeners.add(listener);
	return () => {
		grantListeners.delete(listener);
	};
}
function changed() {
	for (const listener of grantListeners) listener();
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

export async function invokeLocalFiles<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(command, args);
}

export async function resetLocalFiles(): Promise<void> {
	if (localFilesSupported()) await invokeLocalFiles("local_files_reset");
	changed();
}

export function createLocalFilesAdapter(context: LocalFilesContext): LocalFilesAdapter {
	return {
		supported: true,
		async authorize(config) {
			await invokeLocalFiles("local_files_activate", { context });
			await invokeLocalFiles("local_files_authorize", { context, config });
			changed();
		},
		async revoke(connectionId) {
			await invokeLocalFiles("local_files_revoke", { context, connectionId });
			changed();
		},
	};
}

export function useLocalFilesContext(): LocalFilesContext | null {
	const status = useSessionStore((state) => state.status);
	const enabled = status === "signed-in" && localFilesSupported();
	const me = useMe({ enabled });
	const devices = useDevices({ enabled });
	const sessions = useSessions({ enabled });
	const ownerId = me.data?.member.id;
	const deviceId = devices.data?.items.find((device) => device.current)?.id;
	const sessionId = sessions.data?.items.find((session) => session.current)?.id;
	return useMemo(
		() => (enabled && ownerId && deviceId && sessionId ? { ownerId, deviceId, sessionId } : null),
		[enabled, ownerId, deviceId, sessionId],
	);
}

export function useLocalFilesAdapter(): LocalFilesAdapter | undefined {
	const context = useLocalFilesContext();
	return useMemo(() => (context ? createLocalFilesAdapter(context) : undefined), [context]);
}

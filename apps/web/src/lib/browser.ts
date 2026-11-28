import type { LocalFilesContext } from "./local-files.ts";

/**
 * Browser control's native side, as the runtime sees it: commands go to `browser_execute`, and the
 * device runs them through `bsk` (specs/connectors/browser.md §4). A thin wrapper so the runtime
 * never imports Tauri directly (it must also load in a browser and in tests).
 */
export async function executeBrowser<T>(context: LocalFilesContext, command: unknown): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>("browser_execute", { context, command });
}

/**
 * The user stopped a round that had a browser call in flight: the device marks the command; the bsk
 * child it started is killed at its own deadline. Safe to repeat and a no-op once the call answered.
 */
export async function cancelBrowser(commandId: string): Promise<void> {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("browser_cancel", { commandId });
}

/** The five browser operations; the runtime routes them to `executeBrowser` and nothing else. */
export function isBrowserCommand(operation: string): boolean {
	return operation.startsWith("browser_");
}

/** The tray label key for a browser operation, matching `tray.connector.<key>`. */
export function browserActivityKey(operation: string): string {
	return operation.startsWith("browser_") ? operation : "browser_status";
}

/**
 * Whether a dispatched browser command may run here: it names a `computer-control` device grant that
 * still carries `browser`, for this device, holding the current revision, not revoked, and — when the
 * grant was written by this runtime — already recorded. A second look in front of `browser_execute`,
 * which re-checks the stored grant (browser.md §3).
 */
export function browserEligible(
	command: {
		connectionId: string;
		deviceId: string;
		connectorId: string;
		scope: string;
		capabilities: { browser?: boolean };
		revision: number;
	},
	state: {
		deviceId: string;
		revoked: ReadonlySet<string>;
		written: ReadonlySet<string>;
		granted: readonly { id: string; revision: number; connectorId: string; capabilities: { browser?: boolean } }[];
	},
): boolean {
	const id = command.connectionId;
	return (
		command.deviceId === state.deviceId &&
		command.connectorId === "computer-control" &&
		command.scope === "device" &&
		command.capabilities.browser === true &&
		!state.revoked.has(id) &&
		(state.written.has(id) ||
			state.granted.some(
				(item) =>
					item.id === id &&
					item.revision === command.revision &&
					item.connectorId === "computer-control" &&
					item.capabilities.browser === true,
			))
	);
}

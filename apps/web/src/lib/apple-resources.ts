import type { AppleConnectorId, AppleConnectorResult, ConnectorCommand } from "@yonder/protocol";
import { isTauri } from "./keychain.ts";

export type AppleResourcePermission =
	| "undetermined"
	| "granted"
	| "limited"
	| "denied"
	| "restricted"
	| "unavailable"
	| "unsupported";

interface AppleResourceContext {
	ownerId: string;
	deviceId: string;
	sessionId: string;
}

interface Revision {
	id: string;
	revision: number;
}

const EMPTY_STATUS = {
	"apple-calendar": "unsupported",
	"apple-photos": "unsupported",
	"apple-notes": "unsupported",
} as const;

async function invokeAppleResource<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`plugin:yonder-apple-resources|${command}`, args);
}

export async function appleResourceStatuses(): Promise<Record<AppleConnectorId, AppleResourcePermission>> {
	if (!isTauri()) return EMPTY_STATUS;
	try {
		const statuses = await invokeAppleResource<Partial<Record<AppleConnectorId, AppleResourcePermission>>>("statuses");
		return { ...EMPTY_STATUS, ...statuses };
	} catch {
		return EMPTY_STATUS;
	}
}

export const requestAppleResourcePermission = (connectorId: AppleConnectorId) =>
	invokeAppleResource<AppleResourcePermission>("request_permission", { connectorId });

export const activateAppleResources = (context: AppleResourceContext) =>
	invokeAppleResource<void>("activate", { context });

export const resetAppleResources = (context: AppleResourceContext) => invokeAppleResource<void>("reset", { context });

export const writeAppleResourceGrant = (
	context: AppleResourceContext,
	grant: Revision & { connectorId: AppleConnectorId },
) => invokeAppleResource<void>("authorize", { context, grant });

export const revokeAppleResourceGrant = (context: AppleResourceContext, connectionId: string) =>
	invokeAppleResource<void>("revoke", { context, connectionId });

export const readyAppleResourceGrants = (context: AppleResourceContext, connections: readonly Revision[]) =>
	invokeAppleResource<Revision[]>("ready", { context, connections });

export const executeAppleResource = (
	context: AppleResourceContext,
	command: ConnectorCommand & { expiresAtMs: number },
) =>
	invokeAppleResource<AppleConnectorResult>("execute", { context, command: { ...command, args: command.args ?? {} } });

export const cancelAppleResource = (commandId: string) => invokeAppleResource<void>("cancel", { commandId });

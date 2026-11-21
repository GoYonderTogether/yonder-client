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
	"apple-voice-memos": "unsupported",
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

export const openAppleResourceSettings = (connectorId: AppleConnectorId) =>
	invokeAppleResource<void>("open_settings", { connectorId });

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

export async function executeAppleResourceFile(
	context: AppleResourceContext,
	command: ConnectorCommand & { expiresAtMs: number },
): Promise<File> {
	const buffer = await invokeAppleResource<ArrayBuffer>("execute_attachment", {
		context,
		command: { ...command, args: command.args ?? {} },
	});
	if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= 4) throw new Error("read_failed");
	const metadataLength = new DataView(buffer).getUint32(0);
	const start = 4 + metadataLength;
	if (metadataLength === 0 || metadataLength > 4096 || start >= buffer.byteLength) throw new Error("read_failed");
	const maxBytes = (command.operation === "apple_voice_memos_transcribe" ? 8 : 20) * 1024 * 1024;
	if (buffer.byteLength - start > maxBytes) throw new Error("too_large");
	const metadata: unknown = JSON.parse(
		new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, 4, metadataLength)),
	);
	if (
		!metadata ||
		typeof metadata !== "object" ||
		!("name" in metadata) ||
		typeof metadata.name !== "string" ||
		!metadata.name ||
		!("mimeType" in metadata) ||
		typeof metadata.mimeType !== "string" ||
		!metadata.mimeType
	)
		throw new Error("read_failed");
	return new File([new Uint8Array(buffer, start)], metadata.name, { type: metadata.mimeType });
}

export const cancelAppleResource = (commandId: string) => invokeAppleResource<void>("cancel", { commandId });

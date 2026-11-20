import type { DeviceInfo } from "../auth/auth.ts";

export interface ConnectorDefinition {
	id: "local-files" | "computer-control";
	kind: "device";
	name: string;
	description: string;
	platforms: DeviceInfo["platform"][];
}

export type ConnectorScope = "folder" | "device";
export interface ConnectorCapabilities {
	fileTools: boolean;
}

export interface ConnectorInstance {
	id: string;
	connectorId: ConnectorDefinition["id"];
	scope: ConnectorScope;
	capabilities: ConnectorCapabilities;
	revision: number;
	deviceId: string;
	deviceName: string;
	name: string;
	/** Online only when a valid device session reports this connection's local grant ready. */
	status: "online" | "offline";
	currentDevice: boolean;
	createdAt: string;
}

export type ConnectorId = ConnectorDefinition["id"];

/** `pending` → `dispatched` → `granted`; `cancelled`, `expired` and `failed` are side exits. */
export type ConnectorRequestState = "pending" | "dispatched" | "granted" | "cancelled" | "expired" | "failed";

/**
 * A Bot's request for connector access, as every endpoint sees it. One card can carry several
 * connectors; `deviceId` and `connectionIds` exist only after the user allows it.
 */
export interface ConnectorRequestView {
	id: string;
	connectorIds: ConnectorId[];
	/** The Bot's one-line reason, not the user's own message. */
	reason: string;
	state: ConnectorRequestState;
	deviceId: string | null;
	deviceName: string | null;
	/** Same order as `connectorIds`. */
	connectionIds: string[];
	/** The real reason when `state` is `failed`. */
	failure: string | null;
}

/** One grant a device session is asked to store; the device reports readiness through `connector.ready`. */
export interface ConnectorGrant {
	connectionId: string;
	connectorId: ConnectorId;
	scope: "device";
	capabilities: ConnectorCapabilities;
	revision: number;
}

/** A device a pending request could be authorized on. */
export interface ConnectorRequestDevice {
	id: string;
	name: string;
	platform: DeviceInfo["platform"];
	online: boolean;
	supported: boolean;
}

export interface ConnectorRequestDevicesResponse {
	items: ConnectorRequestDevice[];
}

export interface ConnectorCatalogResponse {
	items: ConnectorDefinition[];
}
export interface ConnectorListResponse {
	items: ConnectorInstance[];
}
export interface CreateConnectorRequest {
	connectorId: ConnectorDefinition["id"];
	deviceId: string;
	name: string;
	/** Omitting scope preserves the old selected-folder grant; never silently widens it. */
	scope?: ConnectorScope;
	capabilities?: ConnectorCapabilities;
}

export interface UpdateConnectorRequest {
	expectedRevision: number;
	scope?: ConnectorScope;
	capabilities?: ConnectorCapabilities;
}

export type ConnectorOperation = "list" | "read" | "search" | "index" | "create" | "edit" | "delete" | "restore";
export interface ConnectorCommandArgs {
	query?: string;
	content?: string;
	expectedHash?: string;
	recoveryId?: string;
}

export interface ConnectorCommand {
	/** The server-authenticated Bot and conversation that issued this device command, when known. */
	origin?: { botId: string; conversationId: string };
	id: string;
	connectionId: string;
	deviceId: string;
	connectorId: ConnectorDefinition["id"];
	scope: ConnectorScope;
	capabilities: ConnectorCapabilities;
	revision: number;
	operation: ConnectorOperation;
	/** Folder grants use relative paths. Device grants use OS paths, resolved only on the device. */
	path: string;
	args?: ConnectorCommandArgs;
	expiresAt: string;
}

export type LocalFilesResult =
	| { kind: "list"; path: string; entries: { name: string; type: "file" | "directory" }[]; truncated: boolean }
	| { kind: "read"; path: string; content: string; truncated: boolean; hash?: string }
	| {
			kind: "search" | "index";
			path: string;
			entries: { path: string; type: "file" | "directory" }[];
			truncated: boolean;
	  }
	| { kind: "create" | "edit" | "restore"; path: string; hash: string }
	| { kind: "delete"; path: string; recoveryId: string };

export type ConnectorExecutionError =
	| "permission_denied"
	| "not_found"
	| "path_invalid"
	| "unsupported_file"
	| "too_large"
	| "disconnected"
	| "cancelled"
	| "read_failed"
	| "conflict"
	| "already_exists"
	| "operation_failed";
export type ConnectorCommandResult =
	| { ok: true; result: LocalFilesResult }
	| { ok: false; error: ConnectorExecutionError };

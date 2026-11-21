import type { DeviceInfo } from "../auth/auth.ts";
import type { Attachment } from "../chat/chat.ts";

export type FileConnectorId = "local-files" | "computer-control";
export type AppleConnectorId = "apple-calendar" | "apple-photos" | "apple-notes" | "apple-voice-memos";
export type ConnectorId = FileConnectorId | AppleConnectorId;

export interface ConnectorDefinition {
	id: ConnectorId;
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

/** `pending` → `dispatched` → `granted`; `cancelled`, `expired` and `failed` are side exits. */
export type ConnectorRequestState = "pending" | "dispatched" | "granted" | "cancelled" | "expired" | "failed";

/**
 * A Bot's request for connector access, as every endpoint sees it. One card can carry several
 * connectors; `deviceId` and `connectionIds` exist only after the user allows it.
 */
export interface ConnectorRequestView {
	id: string;
	connectorIds: FileConnectorId[];
	/** The Bot's one-line reason, not the user's own message. */
	reason: string;
	state: ConnectorRequestState;
	deviceId: string | null;
	deviceName: string | null;
	/** The device the Bot asked for, as the picker's default; never the target until the user allows. */
	deviceHintId?: string | null;
	/** Same order as `connectorIds`. */
	connectionIds: string[];
	/** The real reason when `state` is `failed`. */
	failure: string | null;
	/** Which dispatch this view describes: the server adds one each time the request is dispatched. */
	dispatchSeq?: number;
	/** A granted card's subsequent task; absent for historical cards or older servers. */
	continuation?: "pending" | "started" | "failed";
	/** A permanent continuation failure; keep the grant and show the reason in the card. */
	continuationFailure?: "grant_changed" | "target_unavailable";
}

/** One grant a device session is asked to store; the device reports readiness through `connector.ready`. */
export interface ConnectorGrant {
	connectionId: string;
	connectorId: FileConnectorId;
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

export type FileConnectorOperation = "list" | "read" | "search" | "index" | "create" | "edit" | "delete" | "restore";
export type AppleConnectorOperation =
	| "apple_calendar_list"
	| "apple_calendar_read"
	| "apple_photos_list"
	| "apple_photos_read"
	| "apple_notes_list"
	| "apple_notes_read"
	| "apple_notes_attachment_read"
	| "apple_voice_memos_list"
	| "apple_voice_memos_read"
	| "apple_voice_memos_transcribe";
export type ConnectorOperation = FileConnectorOperation | AppleConnectorOperation;
export interface ConnectorCommandArgs {
	query?: string;
	content?: string;
	expectedHash?: string;
	recoveryId?: string;
	/** OS-local resource id, never a filesystem path or a script. */
	id?: string;
	attachmentId?: string;
	/** YYYY-MM-DD in the device's local calendar, inclusive. */
	dateFrom?: string;
	dateTo?: string;
	limit?: number;
	offset?: number;
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

export interface AppleSourceIdentity {
	globalId?: string;
	contentSha256?: string;
}

export interface AppleNoteAttachment {
	id: string;
	name: string;
	mimeType: string;
	size?: number;
}

export interface AppleCalendarEvent {
	id: string;
	title: string;
	startsAt: string;
	endsAt: string;
	allDay: boolean;
	calendar: string;
	sourceIdentity?: AppleSourceIdentity;
}

export type AppleConnectorResult =
	| { kind: "apple_calendar_list"; events: AppleCalendarEvent[]; more: boolean }
	| {
			kind: "apple_calendar_read";
			event: AppleCalendarEvent & { notes?: string; location?: string; url?: string };
	  }
	| {
			kind: "apple_photos_list";
			photos: {
				id: string;
				createdAt: string | null;
				width: number;
				height: number;
				sourceIdentity?: AppleSourceIdentity;
			}[];
			more: boolean;
	  }
	| { kind: "apple_photos_read"; id: string; text: string; truncated?: boolean; labels?: string[] }
	| {
			kind: "apple_notes_list";
			notes: { id: string; title: string; modifiedAt: string | null; sourceIdentity?: AppleSourceIdentity }[];
			more: boolean;
	  }
	| { kind: "apple_notes_read"; id: string; text: string; truncated?: boolean; attachments?: AppleNoteAttachment[] }
	| { kind: "apple_notes_attachment_read"; id: string; attachmentId: string; attachment: Attachment }
	| {
			kind: "apple_voice_memos_list";
			recordings: {
				id: string;
				title: string;
				createdAt: string | null;
				durationMs: number | null;
				sourceIdentity?: AppleSourceIdentity;
			}[];
			more: boolean;
	  }
	| { kind: "apple_voice_memos_read"; id: string; attachment: Attachment }
	| { kind: "apple_voice_memos_transcribe"; id: string; text: string };

export type ConnectorResult = LocalFilesResult | AppleConnectorResult;

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
	| { ok: true; result: ConnectorResult }
	| { ok: false; error: ConnectorExecutionError };

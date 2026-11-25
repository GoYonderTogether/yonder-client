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

export type FileConnectorOperation =
	| "list"
	| "read"
	| "grep"
	| "search"
	| "index"
	| "create"
	| "edit"
	| "delete"
	| "restore";
export type AppleConnectorOperation =
	| "apple_calendar_list"
	| "apple_calendar_read"
	| "apple_photos_list"
	| "apple_photos_read"
	| "apple_photos_image"
	| "apple_notes_list"
	| "apple_notes_read"
	| "apple_notes_attachment_read"
	| "apple_voice_memos_list"
	| "apple_voice_memos_read"
	| "apple_voice_memos_transcribe";
export type ConnectorOperation = FileConnectorOperation | AppleConnectorOperation | "asset_original";
export interface ConnectorCommandArgs {
	/** `search`: a file-name substring. `grep`: a regular expression (Rust `regex` syntax). Apple calendar: an event search term. */
	query?: string;
	/** `create`/`edit`: the whole new UTF-8 text of the file. */
	content?: string;
	/** The SHA-256 hex of the file as the device will find it; `edit` and `delete` require it. */
	expectedHash?: string;
	recoveryId?: string;
	/** OS-local resource id, never a filesystem path or a script. */
	id?: string;
	attachmentId?: string;
	/** YYYY-MM-DD in the device's local calendar, inclusive. */
	dateFrom?: string;
	dateTo?: string;
	/** File `read`: the first line to return, 1-based. Apple paging: zero-based. */
	offset?: number;
	/** The page size for file read (1 to 2000), grep (1 to 200), or an Apple list operation. */
	limit?: number;
	/**
	 * `apple_photos_image`: the long edge the device encodes a picture to. 1280 is what a model keeps
	 * of a single photo; 512 is the batch size it decodes at (D3/D4), and sending it saves the
	 * owner's uplink on a run of twenty.
	 */
	edge?: number;
	/** `edit`: exact text to replace. It must occur exactly once unless `replaceAll` is true. */
	oldString?: string;
	/** `edit`: the text written in place of `oldString`. */
	newString?: string;
	/** `edit`: replace every occurrence of `oldString` instead of requiring exactly one. */
	replaceAll?: boolean;
	/** `search`/`grep`: only consider files whose path matches this glob, e.g. `*.ts` or `**\/*.test.ts`. */
	glob?: string;
	/** `grep`: treat `query` as literal text instead of a regular expression. */
	literal?: boolean;
	/** `grep`: match case-sensitively. Default false. */
	caseSensitive?: boolean;
	/** `search`/`index`: include entries that `.gitignore` rules exclude. */
	includeIgnored?: boolean;
	/** `search`/`index`: include dot files and dot directories. */
	includeHidden?: boolean;
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

/** Why a bounded result stopped: it reached its result cap, or its scan budget ran out first. */
export type ConnectorStopReason = "results" | "budget";

export type LocalFilesResult =
	| { kind: "list"; path: string; entries: { name: string; type: "file" | "directory" }[]; truncated: boolean }
	| {
			kind: "read";
			path: string;
			/** The returned lines joined with "\n"; at most 65536 UTF-8 bytes, cut at a line boundary. */
			content: string;
			/** True when lines after `endLine` remain. */
			truncated: boolean;
			/** The first returned line, 1-based. */
			startLine?: number;
			/** The last returned line, 1-based; startLine - 1 when nothing was returned. */
			endLine?: number;
			/** All lines in the file, not only the returned ones. */
			totalLines?: number;
			/** SHA-256 of the whole file, so a later edit can verify it even when only part was read. */
			hash?: string;
	  }
	| {
			kind: "grep";
			/** The file or directory the search started from. */
			path: string;
			/** One entry per matching line; `path` is ready to pass to `read`, `line` is 1-based. */
			matches: { path: string; line: number; text: string }[];
			truncated: boolean;
			/** Present when `truncated`: the result cap or the scan budget ended the search. */
			stopReason?: ConnectorStopReason;
	  }
	| {
			kind: "search" | "index";
			path: string;
			entries: { path: string; type: "file" | "directory" }[];
			truncated: boolean;
			/** Present when `truncated`: the result cap or the scan budget ended the scan. */
			stopReason?: ConnectorStopReason;
	  }
	| { kind: "create" | "restore"; path: string; hash: string }
	| {
			kind: "edit";
			path: string;
			hash: string;
			/** How many occurrences of `oldString` were replaced; absent for a whole-file rewrite. */
			replacements?: number;
	  }
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
	| {
			kind: "apple_photos_read";
			id: string;
			text: string;
			truncated?: boolean;
			labels?: string[];
			/** Which local copy the text came from: the original on the device, or the system thumbnail. */
			source?: "local" | "thumbnail";
	  }
	/** `view` asked for one photo's picture; carries the normalized copy, never the original. */
	| { kind: "apple_photos_image"; id: string; attachment: Attachment }
	| {
			kind: "apple_notes_list";
			notes: { id: string; title: string; modifiedAt: string | null; sourceIdentity?: AppleSourceIdentity }[];
			more: boolean;
	  }
	| {
			kind: "apple_notes_read";
			id: string;
			text: string;
			truncated?: boolean;
			attachments?: AppleNoteAttachment[];
			moreAttachments?: boolean;
	  }
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

export type ConnectorResult =
	| LocalFilesResult
	| AppleConnectorResult
	| { kind: "asset_original"; attachment: Attachment };

export type ConnectorExecutionError =
	| "permission_denied"
	| "not_found"
	| "path_invalid"
	| "unsupported_file"
	| "too_large"
	| "line_too_long"
	| "invalid_pattern"
	| "disconnected"
	| "cancelled"
	| "read_failed"
	| "conflict"
	| "already_exists"
	| "no_match"
	| "multiple_matches"
	/**
	 * The library has the photo but not its pixels: only iCloud holds the original and the device
	 * did not fetch it. A real state the model is told, not a generic read failure.
	 */
	| "icloud_only"
	/** The asset itself is absent or the system's copy is unreadable (deleted, still uploading). */
	| "unavailable"
	| "operation_failed";
export type ConnectorCommandResult =
	| { ok: true; result: ConnectorResult }
	| { ok: false; error: ConnectorExecutionError; candidateLines?: number[] };

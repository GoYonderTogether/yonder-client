import type { DeviceInfo } from "../auth/auth.ts";
import type { Attachment } from "../chat/chat.ts";
import type { AppleConnectorId, AppleConnectorOperation, AppleConnectorResult } from "./apple.ts";
import type {
	BrowserActAction,
	BrowserConnectorOperation,
	BrowserConnectorResult,
	BrowserExecutionError,
	BrowserSessionAction,
} from "./browser.ts";
import type { DesktopConnectorResult, DesktopInputAction, DesktopPermission } from "./desktop.ts";
import type { ShellJobAction, TerminalConnectorResult } from "./terminal.ts";

// Desktop, terminal and browser shapes live in their own modules, re-exported here for one entry point.
export * from "./apple.ts";
export * from "./browser.ts";
export * from "./desktop.ts";
export * from "./terminal.ts";

export type FileConnectorId = "local-files" | "computer-control";
export type ConnectorId = FileConnectorId | AppleConnectorId;

export interface ConnectorDefinition {
	id: ConnectorId;
	kind: "device";
	name: string;
	description: string;
	platforms: DeviceInfo["platform"][];
	brand?: import("../brands.ts").BrandId;
}

export type ConnectorScope = "folder" | "device";
export interface ConnectorCapabilities {
	fileTools: boolean;
	/**
	 * `computer-control` only: the Bot may run any command on this device as the owner's system
	 * user. Its own capability, never implied by `fileTools`; an existing grant does not gain it
	 * (TOOLS-V3 §4). Off by default.
	 */
	terminal: boolean;
	/**
	 * `computer-control` only: computer use — the Bot may see the screen and operate the mouse and
	 * keyboard on this device (desktop control design §5). Its own capability, never implied by
	 * `fileTools` or `terminal`; an existing grant does not gain it. Off by default. Carried only by
	 * `computer-control`, and only on macOS and Windows builds.
	 */
	desktop: boolean;
	/**
	 * `computer-control` only: the Bot may drive a Chrome or Edge window on this device through the
	 * browser-control connector. Its own capability, never implied by `terminal` or `fileTools`; an
	 * existing grant does not gain it, and only a device that reports version 10 executes it. Off by
	 * default.
	 */
	browser: boolean;
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
	/** Any connector a card may name; wider than the file pair so a terminal grant can be asked for. */
	connectorIds: ConnectorId[];
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
	/** As wide as `ConnectorRequestView.connectorIds`: the device stores what the card asked for. */
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
/** Shell on `computer-control` with `terminal`: start a command, or manage jobs it left running. */
export type TerminalConnectorOperation = "shell" | "shell_job";
/** Computer use on `computer-control` with `desktop` (design §5): windows, AX tree, shot, input. */
export type DesktopConnectorOperation = "desktop_windows" | "desktop_ax" | "desktop_shot" | "desktop_input";
export type ConnectorOperation =
	| FileConnectorOperation
	| TerminalConnectorOperation
	| DesktopConnectorOperation
	| BrowserConnectorOperation
	| AppleConnectorOperation
	| "asset_original"
	| "file_preview";
export interface ConnectorCommandArgs {
	/** `search`: a file-name substring. `grep`: a regular expression (Rust `regex` syntax). Apple calendar: an event search term. */
	query?: string;
	/** `create`/`edit`: the whole new UTF-8 text of the file. */
	content?: string;
	/** The SHA-256 hex of the file as the device will find it; `edit` and `delete` require it. */
	expectedHash?: string;
	/** `file_preview`: the exact version the requesting client already verified. */
	knownSha256?: string;
	recoveryId?: string;
	/** OS-local resource id, never a filesystem path or a script. */
	id?: string;
	attachmentId?: string;
	/**
	 * `apple_voice_memos_transcribe`: where the two-minute transcription window starts, in
	 * milliseconds from the recording's beginning. Absent is 0; a longer memo is read window by window.
	 */
	startMs?: number;
	/** YYYY-MM-DD in the device's local calendar, inclusive. */
	dateFrom?: string;
	dateTo?: string;
	/** File `read`: the first line to return, 1-based. Apple paging: zero-based. `shell_job` `log`: a byte offset. */
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
	/**
	 * `shell`: the command line to run, verbatim; no allowlist and no rewriting (TOOLS-V3 §4). Unix
	 * runs it through the owner's default shell, Windows through PowerShell.
	 */
	command?: string;
	/** `shell`: the process's working directory; must be an absolute path. Absent is the user's home. */
	workdir?: string;
	/** `shell`: a hard timeout in milliseconds. Unset means none; the foreground window is separate. */
	timeoutMs?: number;
	/** `shell`: return a background job at once instead of waiting out the foreground window. */
	background?: boolean;
	/** `shell`: notify the Bot when the job finishes. Defaults to true on the server. */
	notify?: boolean;
	/** `shell`: open a standard-input pipe the Bot can write to. Default false: no TTY, no stdin. */
	stdin?: boolean;
	/** `shell`: run this one command with administrator rights, approved by the owner at that computer. */
	elevated?: boolean;
	/** `shell`: the question the owner answers in the elevation dialog. Present exactly when `elevated` is true. */
	justification?: string;
	/** `shell_job`: list | status | log | wait | write | kill. `desktop_input`: what the operation does. `browser_session`: start | stop | list. `browser_act`: click | fill | press | select | hover | scroll | screenshot. */
	action?: ShellJobAction | DesktopInputAction | BrowserSessionAction | BrowserActAction;
	/** `shell_job`: which job, by full id or an unambiguous prefix. */
	jobId?: string;
	/**
	 * `shell_job` `log`: the absolute byte offset to read from; absent is 0. The same field as a
	 * file `read`'s first line, interpreted per operation.
	 */
	// `offset` above is shared with file reads; shell_job reuses it as a byte offset.
	/** `shell_job` `write`: text for the job's standard input. `desktop_input` `type`: the text to type. */
	text?: string;
	/** `shell_job` `write`: close standard input after writing. */
	eof?: boolean;
	/** File `read`: the first byte to return, 0-based; exclusive with `offset`. Continue a truncated line with the previous `endByte`. */
	byteOffset?: number;
	/** `grep`: `matches` (default) returns matching lines; `files` returns each matching file with its match count. */
	output?: "matches" | "files";
	/** `desktop_ax` / `desktop_input` / `desktop_shot`: which window, by id from `desktop_windows`. */
	windowId?: string;
	/** `desktop_ax`: how many levels of the accessibility tree to read (default 6, max 12). */
	depth?: number;
	/** `desktop_ax`: cap on returned nodes (default 400, max 2000). */
	maxNodes?: number;
	/** `desktop_input`: the opaque ref of an accessibility element, from a `desktop_ax` read in the same run. */
	ref?: string;
	/** `desktop_input`: window-relative x for a point action (click/drag). */
	x?: number;
	/** `desktop_input`: window-relative y for a point action. */
	y?: number;
	/** `desktop_input`: key or chord for `key`, e.g. `Return`, `cmd+s`. */
	key?: string;
	/** `desktop_input`: scroll amount for `scroll`; positive scrolls down. */
	deltaY?: number;
	/** `desktop_input`: window-relative drag target x. */
	toX?: number;
	/** `desktop_input`: window-relative drag target y. */
	toY?: number;
	/** `desktop_input`: `background` (default, does not take focus) or `foreground` (may take focus and move the cursor). */
	delivery?: "background" | "foreground";
	/** `browser_session` `start`/`stop`, `browser_observe`, `browser_act`: which Agent Window session. */
	sessionId?: string;
	/** `browser_navigate`: the http(s) URL, or `about:blank`. Never file: or javascript:. */
	url?: string;
	/** `browser_navigate`: wait until the document loads, or only until the DOM is ready. Default load. */
	waitUntil?: "load" | "domcontentloaded";
	/** `browser_observe`: `text` (default) for readable text, `snapshot` for ref-addressable elements. */
	mode?: "text" | "snapshot";
	/** `browser_act` `fill`: the text to type. `select`: the option value or label. */
	value?: string;
	/** `browser_act` `screenshot`: capture the whole scrollable page instead of the viewport. Default false. */
	fullPage?: boolean;
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
			/** True when the first returned line was cut because it exceeds 65536 bytes; continue with `byteOffset: endByte`. */
			lineTruncated?: boolean;
			/** Total bytes of that line without its newline; present with `lineTruncated`. */
			lineBytes?: number;
			/** Byte position in the file where the returned content starts, 0-based. */
			startByte?: number;
			/** Byte position in the file just after the returned content; the next `byteOffset`. */
			endByte?: number;
	  }
	| {
			kind: "grep";
			/** The file or directory the search started from. */
			path: string;
			/** One entry per matching line; `path` is ready to pass to `read`, `line` is 1-based. `byteOffset` is the hit's byte position in the file and `column` its byte position in the line, both 0-based. */
			matches: { path: string; line: number; text: string; byteOffset?: number; column?: number }[];
			/** `output: "files"` only: each matching file with its count of matching lines; `matches` is then empty. */
			files?: { path: string; count: number }[];
			/** Binary files the search skipped, so a missing hit is not read as absence. */
			binaryFilesSkipped?: number;
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

export type ConnectorFilePreviewStatus =
	| { kind: "directory"; entries: { name: string; type: "file" | "directory" }[]; truncated: boolean }
	| { kind: "unchanged"; sha256: string };

export type ConnectorFilePreviewResult =
	| ConnectorFilePreviewStatus
	| { kind: "file"; sha256: string; attachment: Attachment };

export type ConnectorResult =
	| LocalFilesResult
	| TerminalConnectorResult
	| DesktopConnectorResult
	| BrowserConnectorResult
	| AppleConnectorResult
	| ConnectorFilePreviewResult
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
	/** A terminal command exceeded its own `timeoutMs` and was killed. */
	| "timeout"
	/** The job's log cannot be read now: deleted, unreadable, or before its first byte was written. */
	| "output_unavailable"
	/** No job on this device matches the id or prefix. */
	| "job_not_found"
	/** The job's process is gone with no `.exit` record: it died across a client restart. */
	| "job_lost"
	/** The owner refused an elevated command's administrator prompt; stop and ask, never retry another way. */
	| "elevation_denied"
	/** The administrator prompt went unanswered for too long; the command did not run. */
	| "elevation_timeout"
	/** The device cannot raise an administrator prompt (platform, permissions or session). */
	| "elevation_unavailable"
	/** Desktop control: a required system permission is missing; the failure carries `permission`. */
	| "desktop_permission_required"
	/** Desktop control: no window with that `windowId` exists now (it closed, or belongs to another read). */
	| "window_not_found"
	/** Desktop control: the `ref` names no element in this read (stale or from an earlier read). */
	| "element_not_found"
	| "operation_failed"
	/** `read` met a binary file (a NUL byte or a known binary header); the failure carries `size` and `fileType`. */
	| "binary_file"
	/** Browser control's own states: not installed, no attached browser, or the session is gone (browser.md §5). */
	| BrowserExecutionError;
export type ConnectorCommandResult =
	| { ok: true; result: ConnectorResult }
	| {
			ok: false;
			error: ConnectorExecutionError;
			candidateLines?: number[];
			/** `binary_file` only: the file's size in bytes. */
			size?: number;
			/** `binary_file` only: the recognised kind (`sqlite`, `pdf`, `zip`, `gzip`, `png`, `jpeg`, `gif`) or `unknown`. */
			fileType?: string;
			/** `desktop_permission_required` only: which macOS permission is missing. */
			permission?: DesktopPermission;
	  };

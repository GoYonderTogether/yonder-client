import type { CustomConnectorId } from "./connectors.ts";

/**
 * A connector the Bot wrote for the owner's own device (20261128-people-archive 03, 03b).
 *
 * The manifest is the contract between the device package and the server: the tools a call may
 * name and the events the package may report. The package itself stays on the device; only this
 * manifest and the entry file's SHA-256 travel, so the owner confirms what the Bot wrote by what it
 * can see: names, tool modes, and each event's level.
 */

export type CustomConnectorStatus = "pending" | "installed" | "needs_reauth" | "disabled" | "removed";

export type CustomToolMode = "query" | "act";

/** One tool the package exposes; it becomes the model tool `<slug>_<name>`. */
export interface CustomConnectorToolSpec {
	/** snake_case; prefixed with the slug into a tool name. */
	name: string;
	description: string;
	mode: CustomToolMode;
	/** JSON Schema with `additionalProperties: false`; the package parses the same arguments. */
	input: Record<string, unknown>;
}

/**
 * One event the package may report. Levels 2 and 3 are not accepted for a custom connector: 3 finds
 * the owner and 2 spends the background pool, and only the manifests we ship may do that. The card
 * states every level so the owner knows what will be recorded.
 */
export interface CustomConnectorEventSpec {
	level: 0 | 1;
	timeline: "direct" | "review" | "none";
	weight: 0 | 1 | 2 | 3;
	visibility: "private" | "public" | "secret";
	reason: string;
}

/** How the device polls the package's own entry for events. */
export interface CustomConnectorPollSpec {
	/** The package tool that returns `{events, cursor}`. */
	tool: string;
	/** Never below 30: a package must not drag the device down. */
	everySeconds: number;
	reason: string;
}

export interface CustomConnectorManifest {
	/** The slug; the connector id is `custom:<slug>`. */
	id: string;
	name: string;
	description: string;
	/** An id in the client's icon registry (see 04). */
	brand: string;
	tools: CustomConnectorToolSpec[];
	events: Record<string, CustomConnectorEventSpec>;
	poll?: CustomConnectorPollSpec;
}

/** A custom connector as the owner's screens and the Bot read it. */
export interface CustomConnectorView {
	id: string;
	connectorId: CustomConnectorId;
	slug: string;
	deviceId: string;
	deviceName: string;
	status: CustomConnectorStatus;
	/** The confirmed entry hash's revision; a call names it and a late one is refused. */
	revision: number;
	entrySha256: string;
	manifest: CustomConnectorManifest;
	createdAt: string;
}

/** One event the device reports; the server keeps only the excerpt and dedupes by `sourceId`. */
export interface CustomConnectorEventInput {
	sourceId: string;
	occurredAt: string;
	title: string;
	/** The excerpt only; the original stays on the device. The server cuts it at 2000 characters. */
	body: string;
	/**
	 * Which of the manifest's declared event types this is. Required when the manifest declares more
	 * than one; a package that declares exactly one may omit it.
	 */
	type?: string;
	/** Names from the event, kept in the payload for the archive; matching to profiles is a later task. */
	participants?: string[];
	conversation?: string;
}

/** A result must fit this; anything larger fails the call rather than filling the run's context. */
export const CUSTOM_CALL_RESULT_MAX_BYTES = 64 * 1024;
/** The server-side excerpt cap for an event body (03b: 2000 characters). */
export const CUSTOM_EVENT_BODY_MAX = 2000;
/** The slowest a package may be polled (03b: 30 seconds). */
export const CUSTOM_POLL_MIN_SECONDS = 30;

/** What a card shows for a custom connector the Bot proposed (03 §2). */
export interface CustomConnectorProposal {
	connectorId: CustomConnectorId;
	slug: string;
	manifest: CustomConnectorManifest;
	entrySha256: string;
	deviceId: string | null;
	deviceName: string | null;
}

/**
 * The server hands one tool call to the device that holds the package (03 §4). The entry runs
 * without a shell: its arguments arrive as JSON on stdin, its working directory is the package's,
 * and stdout is the JSON result. `revision` is the confirmed entry-hash revision, so a call written
 * for an old package cannot be executed against a newer one.
 */
export interface CustomCallRequest {
	callId: string;
	connectionId: string;
	revision: number;
	/** The manifest tool name, without the slug prefix. */
	tool: string;
	args: Record<string, unknown>;
	expiresAt: string;
}

/** The device's answer: one JSON value, or the package's own reason for failing. */
export type CustomCallResult =
	| { callId: string; ok: true; result: unknown }
	| { callId: string; ok: false; error: string };

/**
 * One batch the device reports from polling the package (03b). The server writes each event through
 * `recordEvent` and only then acknowledges the batch; the device keeps its cursor until then, so a
 * lost ack means the same events are sent again and the source-id upsert makes that harmless.
 */
export interface CustomEventBatch {
	connectionId: string;
	revision: number;
	batchId: string;
	events: CustomConnectorEventInput[];
}

/**
 * The device's half of the device-local relay, shaped exactly as the gateway reads it
 * (`provider-local-wire.ts` and `provider-relay.ts` on the server): which endpoints this device
 * offers, and the head / ordered parts / end it answers one relayed call with.
 *
 * Pure, so every rule below can be checked without a shell or a socket.
 */
import type { ClientEvent, DeviceModelEndpoint, DeviceModelError, ServerEvent } from "@yonder/protocol";

type RelayRequest = Extract<ServerEvent, { type: "provider.relay.request" }>;
export type DeviceLocalRequest = Extract<RelayRequest, { mode: "device-local" }>;

const ENDPOINT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RELAY_ID = /^[a-z0-9_-]{1,100}$/iu;
const LABEL_FORBIDDEN = /[:/@\\]/u;

/** The server refuses a call whose deadline is further out than this. */
export const MAX_LIFETIME_MS = 120_000;
export const MAX_ENDPOINTS = 16;
export const MAX_DISCOVER_BYTES = 1024 * 1024;
export const MAX_PART_BYTES = 64 * 1024;
/** The one frame the server holds back until it reads the end of an OpenAI-shaped answer. */
export const OPENAI_TERMINAL = "data: [DONE]\n\n";

const ERRORS = new Set<DeviceModelError>([
	"endpoint_unavailable",
	"model_not_found",
	"invalid_response",
	"timeout",
	"cancelled",
	"upstream_rejected",
]);

/** A device error the server accepts; anything else would be read as an invalid answer. */
export function deviceModelError(value: unknown): DeviceModelError {
	const code = value instanceof Error ? value.message : String(value);
	return ERRORS.has(code as DeviceModelError) ? (code as DeviceModelError) : "endpoint_unavailable";
}

/**
 * One `provider.relay.request` addressed to this device's local endpoints, or null for anything
 * else on the wire — including the legacy relay, which carries a URL and is another runtime's.
 */
export function deviceLocalRequest(event: unknown): DeviceLocalRequest | null {
	const value = event as Record<string, unknown> | null;
	if (value?.type !== "provider.relay.request" || value.mode !== "device-local") return null;
	const { relayId, endpointId, revision, expiresAt, operation, protocol, body } = value;
	const expiresAtMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
	if (
		typeof relayId !== "string" ||
		!RELAY_ID.test(relayId) ||
		typeof endpointId !== "string" ||
		!ENDPOINT_ID.test(endpointId) ||
		typeof revision !== "number" ||
		!Number.isSafeInteger(revision) ||
		revision < 1 ||
		!Number.isSafeInteger(expiresAtMs) ||
		(operation !== "discover" && operation !== "chat") ||
		(protocol !== "openai" && protocol !== "anthropic") ||
		(operation === "discover" ? body !== undefined : !body || typeof body !== "object" || Array.isArray(body))
	)
		return null;
	return value as unknown as DeviceLocalRequest;
}

/**
 * The endpoints this device announces. The server rejects the whole announcement if one row is
 * wrong, so a row it would refuse is left out rather than taking every other endpoint with it.
 */
export function readyEndpoints(value: readonly unknown[]): DeviceModelEndpoint[] {
	const found = new Map<string, DeviceModelEndpoint>();
	for (const row of value.slice(0, MAX_ENDPOINTS * 4)) {
		if (!row || typeof row !== "object") continue;
		const { endpointId, revision, label, protocol } = row as Record<string, unknown>;
		if (
			typeof endpointId !== "string" ||
			!ENDPOINT_ID.test(endpointId) ||
			found.has(endpointId) ||
			typeof revision !== "number" ||
			!Number.isSafeInteger(revision) ||
			revision < 1 ||
			typeof label !== "string" ||
			!label.trim() ||
			label.length > 60 ||
			LABEL_FORBIDDEN.test(label) ||
			[...label].some((character) => character.charCodeAt(0) < 32) ||
			(protocol !== "openai" && protocol !== "anthropic")
		)
			continue;
		found.set(endpointId, { endpointId, revision, label: label.trim(), protocol });
		if (found.size === MAX_ENDPOINTS) break;
	}
	return [...found.values()];
}

export function readyMessage(endpoints: readonly DeviceModelEndpoint[]): ClientEvent {
	return { type: "provider.relay.ready", endpoints: [...endpoints] };
}

export function headMessage(relayId: string, contentType: "application/json" | "text/event-stream"): ClientEvent {
	return { type: "provider.relay.head", mode: "device-local", relayId, status: 200, contentType };
}

export function chunkMessage(relayId: string, seq: number, part: string): ClientEvent {
	return { type: "provider.relay.chunk", mode: "device-local", relayId, seq, part };
}

/** `nextSeq` is the number of parts sent; the server refuses an end that disagrees. */
export function endMessage(relayId: string, nextSeq: number, error?: DeviceModelError): ClientEvent {
	return { type: "provider.relay.end", mode: "device-local", relayId, nextSeq, ...(error ? { error } : {}) };
}

/** The discovery answer, in the shape the server's model-list reader expects. */
export function discoveryBody(models: readonly string[]): string {
	return JSON.stringify({ data: models.map((id) => ({ id })) });
}

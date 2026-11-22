import { expect, test, vi } from "vitest";
import { deviceModelRequest } from "./device-model-runtime.tsx";
import { type DeviceModelReply, deviceModelRelay } from "./device-model-stream.ts";
import { isLegacyRelayRequest } from "./provider-relay-runtime.tsx";

const base = { mode: "device-local", relayId: "relay_test" } as const;

test.each([
	["openai", 'data: {"choices":[]}\n\n', "data: [DONE]\n\n"],
	["anthropic", 'event: ping\ndata: {"type":"ping"}\n\n', 'event: message_stop\ndata: {"type":"message_stop"}\n\n'],
] as const)("sends %s stream in canonical socket order", (protocol, upstream, terminal) => {
	const sent: DeviceModelReply[] = [];
	const relay = deviceModelRelay(base.relayId, "chat", protocol, (event) => {
		sent.push(event);
		return true;
	});
	expect(relay.push(upstream)).toBe(true);
	expect(relay.finishChat()).toBe(true);
	expect(relay.push(upstream)).toBe(false);
	expect(sent).toEqual([
		{ ...base, type: "provider.relay.head", status: 200, contentType: "text/event-stream" },
		{ ...base, type: "provider.relay.chunk", seq: 0, part: upstream },
		{ ...base, type: "provider.relay.chunk", seq: 1, part: terminal },
		{ ...base, type: "provider.relay.end", nextSeq: 2 },
	]);
});

test("returns only scoped discovery model IDs as canonical JSON", () => {
	const sent: DeviceModelReply[] = [];
	const relay = deviceModelRelay(base.relayId, "discover", "anthropic", (event) => {
		sent.push(event);
		return true;
	});
	expect(relay.finishDiscovery(["local-test"])).toBe(true);
	expect(sent).toEqual([
		{ ...base, type: "provider.relay.head", status: 200, contentType: "application/json" },
		{ ...base, type: "provider.relay.chunk", seq: 0, part: '{"data":[{"id":"local-test"}]}' },
		{ ...base, type: "provider.relay.end", nextSeq: 1 },
	]);
});

test("a disconnect stops writes and never replays or fabricates a success marker", () => {
	const send = vi.fn((event: DeviceModelReply) => event.type === "provider.relay.head");
	const relay = deviceModelRelay(base.relayId, "chat", "openai", send);
	expect(relay.push("data: {}\n\n")).toBe(false);
	expect(relay.finishChat()).toBe(false);
	expect(relay.fail("cancelled")).toBe(false);
	expect(send).toHaveBeenCalledTimes(2);
});

test("invalid UTF-8-length and native failures fail at the exact next sequence", () => {
	const send = vi.fn((_event: DeviceModelReply) => true);
	const relay = deviceModelRelay(base.relayId, "chat", "anthropic", send);
	expect(relay.push("录".repeat(22_000))).toBe(false);
	expect(relay.finishChat()).toBe(false);
	expect(send.mock.calls).toEqual([[{ ...base, type: "provider.relay.end", nextSeq: 0, error: "invalid_response" }]]);

	const streamed = deviceModelRelay(base.relayId, "chat", "anthropic", send);
	streamed.push('event: ping\ndata: {"type":"ping"}\n\n');
	streamed.fail("timeout");
	expect(send).toHaveBeenLastCalledWith({ ...base, type: "provider.relay.end", nextSeq: 1, error: "timeout" });
	expect(streamed.finishChat()).toBe(false);
});

test("only the authenticated device-local shape reaches native, not legacy or mixed addresses and keys", () => {
	const event = {
		type: "provider.relay.request",
		...base,
		endpointId: "3d9a2c05-5123-4e7a-9091-023471317af2",
		revision: 1,
		expiresAt: "2026-11-22T12:00:00.000Z",
		operation: "discover",
		protocol: "openai",
	};
	const expected = {
		requestId: event.relayId,
		endpointId: event.endpointId,
		revision: 1,
		expiresAtMs: Date.parse(event.expiresAt),
		operation: "discover",
	};
	expect(deviceModelRequest({ ...event, path: "/unused" })).toEqual(expected);
	expect(deviceModelRequest({ ...event, protocol: "anthropic" })).toEqual({ ...expected, protocol: "anthropic" });
	expect(deviceModelRequest({ ...event, mode: undefined })).toBeNull();
	expect(deviceModelRequest({ ...event, type: "device_model.request" })).toBeNull();
	expect(deviceModelRequest({ ...event, url: "http://example.invalid" })).toBeNull();
	expect(deviceModelRequest({ ...event, headers: {} })).toBeNull();
	expect(deviceModelRequest({ ...event, apiKey: "synthetic" })).toBeNull();
	expect(deviceModelRequest({ ...event, relayId: "../result" })).toBeNull();
	expect(deviceModelRequest({ ...event, body: {}, operation: "discover" })).toBeNull();
	expect(deviceModelRequest({ ...event, operation: "chat" })).toBeNull();
});

test("legacy relay accepts only raw no-mode requests", () => {
	const event = {
		type: "provider.relay.request",
		eventId: "event",
		at: "2026-11-22T00:00:00Z",
		relayId: "relay",
	} as const;
	expect(isLegacyRelayRequest({ ...event, url: "http://127.0.0.1:8788/v1/models", headers: {}, body: "" })).toBe(true);
	expect(
		isLegacyRelayRequest({
			...event,
			mode: "device-local",
			endpointId: "00000000-0000-4000-8000-000000000001",
			revision: 1,
			expiresAt: event.at,
			operation: "discover",
			protocol: "anthropic",
		}),
	).toBe(false);
});

import { expect, test } from "vitest";
import {
	chunkMessage,
	deviceLocalRequest,
	deviceModelError,
	discoveryBody,
	endMessage,
	headMessage,
	readyEndpoints,
	readyMessage,
} from "./device-local-wire.ts";

const endpointId = "3d9a2c05-5123-4e7a-9091-023471317af2";
const request = {
	type: "provider.relay.request",
	eventId: "event-1",
	at: "2026-11-22T12:00:00.000Z",
	mode: "device-local",
	relayId: "relay-1",
	operation: "chat",
	protocol: "openai-chat",
	endpointId,
	revision: 1,
	expiresAt: "2026-11-22T12:01:00.000Z",
	body: { model: "m", messages: [], max_tokens: 8, stream: true, stream_options: { include_usage: true } },
};

test("only a device-local request reaches this runtime, never the URL-shaped relay", () => {
	expect(deviceLocalRequest(request)).toMatchObject({ relayId: "relay-1", endpointId, protocol: "openai-chat" });
	// The legacy relay carries a URL and belongs to another runtime.
	expect(
		deviceLocalRequest({ type: "provider.relay.request", relayId: "r", url: "http://x", headers: {}, body: "" }),
	).toBeNull();
	expect(deviceLocalRequest({ ...request, mode: undefined })).toBeNull();
	expect(deviceLocalRequest({ ...request, type: "provider.relay.cancel" })).toBeNull();
});

test("a request the server could not have sent is refused rather than run", () => {
	for (const broken of [
		{ ...request, relayId: "" },
		{ ...request, relayId: "../result" },
		{ ...request, endpointId: "not-an-endpoint" },
		{ ...request, revision: 0 },
		{ ...request, revision: 1.5 },
		{ ...request, expiresAt: "later" },
		{ ...request, operation: "upload" },
		{ ...request, protocol: "gemini" },
		{ ...request, operation: "discover", body: {} },
		{ ...request, body: [] },
	])
		expect(deviceLocalRequest(broken)).toBeNull();
});

test("the announcement keeps only rows the server would accept", () => {
	const rows = [
		{ endpointId, revision: 1, label: "Local Claude", protocol: "anthropic-messages" },
		{ endpointId, revision: 2, label: "Duplicate", protocol: "openai-chat" },
		{ endpointId: "3d9a2c05-5123-4e7a-9091-023471317af3", revision: 1, label: "bad:label", protocol: "openai-chat" },
		{ endpointId: "3d9a2c05-5123-4e7a-9091-023471317af4", revision: 1, label: "No protocol" },
		{ endpointId: "3d9a2c05-5123-4e7a-9091-023471317af5", revision: 0, label: "Bad revision", protocol: "openai-chat" },
	];
	expect(readyEndpoints(rows)).toEqual([
		{ endpointId, revision: 1, label: "Local Claude", protocol: "anthropic-messages" },
	]);
	expect(readyEndpoints(["nonsense", null, 7])).toEqual([]);
	expect(readyMessage([{ endpointId, revision: 1, label: "A", protocol: "openai-chat" }])).toEqual({
		type: "provider.relay.ready",
		endpoints: [{ endpointId, revision: 1, label: "A", protocol: "openai-chat" }],
	});
});

test("answers carry the mode, the sequence and the count the server checks", () => {
	expect(headMessage("relay-1", "application/json")).toEqual({
		type: "provider.relay.head",
		mode: "device-local",
		relayId: "relay-1",
		status: 200,
		contentType: "application/json",
	});
	expect(chunkMessage("relay-1", 2, "data: {}\n\n")).toEqual({
		type: "provider.relay.chunk",
		mode: "device-local",
		relayId: "relay-1",
		seq: 2,
		part: "data: {}\n\n",
	});
	expect(endMessage("relay-1", 3)).toEqual({
		type: "provider.relay.end",
		mode: "device-local",
		relayId: "relay-1",
		nextSeq: 3,
	});
	expect(endMessage("relay-1", 0, "timeout")).toMatchObject({ nextSeq: 0, error: "timeout" });
	expect(discoveryBody(["a", "b"])).toBe('{"data":[{"id":"a"},{"id":"b"}]}');
});

test("a failure the server does not recognise becomes the one it does", () => {
	expect(deviceModelError(new Error("timeout"))).toBe("timeout");
	expect(deviceModelError("upstream_rejected")).toBe("upstream_rejected");
	expect(deviceModelError(new Error("connect_failed"))).toBe("endpoint_unavailable");
	expect(deviceModelError(undefined)).toBe("endpoint_unavailable");
});

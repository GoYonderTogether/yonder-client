import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deviceModelRequest } from "./device-model-runtime.tsx";
import { type DeviceModelBatch, deviceModelStream } from "./device-model-stream.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("serializes acknowledged data batches and sends DONE only in the terminal batch", async () => {
	let acknowledge!: () => void;
	const held = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	const sent: DeviceModelBatch[] = [];
	const relay = deviceModelStream(async (batch) => {
		sent.push(batch);
		if (!batch.seq) await held;
	}, vi.fn());
	relay.push('data: {"choices":[]}\n\n');
	await vi.advanceTimersByTimeAsync(0);
	relay.push('data: {"choices":[{}]}\n\n');
	const finish = relay.finish();
	expect(sent).toHaveLength(1);
	acknowledge();
	await finish;
	expect(sent).toEqual([
		{ seq: 0, data: 'data: {"choices":[]}\n\n', done: false },
		{ seq: 1, data: 'data: {"choices":[{}]}\n\n', done: false },
		{ seq: 2, data: "data: [DONE]\n\n", done: true },
	]);
});

test("an unacknowledged or stopped stream never replays or sends a success sentinel", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {
		throw new Error("ambiguous receipt");
	});
	const relay = deviceModelStream(post, fail);
	relay.push("data: {}\n\n");
	await relay.finish();
	expect(post).toHaveBeenCalledTimes(1);
	expect(fail).toHaveBeenCalledTimes(1);

	const cancelled = deviceModelStream(post, fail);
	cancelled.push("data: {}\n\n");
	cancelled.stop();
	await vi.runAllTimersAsync();
	expect(post).toHaveBeenCalledTimes(1);
});

test("rejects oversized UTF-8 data before handing anything to the result API", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {});
	const relay = deviceModelStream(post, fail);
	relay.push("录".repeat(22_000));
	await relay.finish();
	expect(fail).toHaveBeenCalledTimes(1);
	expect(post).not.toHaveBeenCalled();
});

test("only forwards scoped request fields to native, never upstream addresses or headers", () => {
	const event = {
		type: "device_model.request",
		requestId: "request-1",
		endpointId: "3d9a2c05-5123-4e7a-9091-023471317af2",
		revision: 1,
		expiresAt: "2026-11-22T12:00:00.000Z",
		operation: "discover",
	};
	expect(deviceModelRequest({ ...event, url: "not forwarded", headers: {} })).toEqual({
		requestId: event.requestId,
		endpointId: event.endpointId,
		revision: 1,
		expiresAtMs: Date.parse(event.expiresAt),
		operation: "discover",
	});
	expect(deviceModelRequest({ ...event, requestId: "../result" })).toBeNull();
	expect(deviceModelRequest({ ...event, body: {}, operation: "discover" })).toBeNull();
	expect(deviceModelRequest({ ...event, operation: "chat" })).toBeNull();
});

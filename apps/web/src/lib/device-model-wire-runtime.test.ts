import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type DeviceModelBatch, deviceModelBatches, OPENAI_DONE } from "./device-model-batches.ts";
import { deviceModelWireRequest } from "./device-model-wire-runtime.tsx";

const request = {
	type: "device_model.request",
	requestId: "request-1",
	endpointId: "3d9a2c05-5123-4e7a-9091-023471317af2",
	revision: 1,
	expiresAt: "2026-11-22T12:00:00.000Z",
	operation: "discover",
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("serializes acknowledged batches and sends the done marker only in the terminal batch", async () => {
	let acknowledge!: () => void;
	const held = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	const sent: DeviceModelBatch[] = [];
	const stream = deviceModelBatches(async (batch) => {
		sent.push(batch);
		if (!batch.seq) await held;
	}, vi.fn());
	stream.push('data: {"choices":[]}\n\n');
	await vi.advanceTimersByTimeAsync(0);
	stream.push('data: {"choices":[{}]}\n\n');
	const finish = stream.finish();
	expect(sent).toHaveLength(1);
	acknowledge();
	await finish;
	expect(sent).toEqual([
		{ seq: 0, data: 'data: {"choices":[]}\n\n', done: false },
		{ seq: 1, data: 'data: {"choices":[{}]}\n\n', done: false },
		{ seq: 2, data: OPENAI_DONE, done: true },
	]);
});

test("an unacknowledged batch stops the stream and never sends the done marker", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {
		throw new Error("ambiguous receipt");
	});
	const stream = deviceModelBatches(post, fail);
	stream.push("data: {}\n\n");
	await stream.finish();
	expect(post).toHaveBeenCalledTimes(1);
	expect(fail).toHaveBeenCalledTimes(1);
});

test("a failure after streaming ends with the error and never a done marker", async () => {
	const sent: DeviceModelBatch[] = [];
	const stream = deviceModelBatches(async (batch) => {
		sent.push(batch);
	}, vi.fn());
	stream.push("data: {}\n\n");
	await stream.finish("timeout");
	expect(sent).toEqual([
		{ seq: 0, data: "data: {}\n\n", done: false },
		{ seq: 1, data: "", done: true, error: "timeout" },
	]);
});

test("rejects oversized UTF-8 batches before any post", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {});
	const stream = deviceModelBatches(post, fail);
	stream.push("录".repeat(22_000));
	await vi.runAllTimersAsync();
	expect(fail).toHaveBeenCalledTimes(1);
	expect(post).not.toHaveBeenCalled();
});

test("only forwards scoped device_model.request fields, never a URL or headers", () => {
	expect(deviceModelWireRequest({ ...request, url: "not forwarded", headers: {} })).toBeNull();
	expect(deviceModelWireRequest(request)).toEqual({
		requestId: request.requestId,
		endpointId: request.endpointId,
		revision: 1,
		expiresAtMs: Date.parse(request.expiresAt),
		operation: "discover",
	});
	expect(deviceModelWireRequest({ ...request, requestId: "../result" })).toBeNull();
	expect(deviceModelWireRequest({ ...request, body: {}, operation: "discover" })).toBeNull();
	expect(deviceModelWireRequest({ ...request, operation: "chat" })).toBeNull();
	expect(
		deviceModelWireRequest({
			...request,
			operation: "chat",
			body: { model: "m", messages: [], max_tokens: 1, stream: true },
		}),
	).toMatchObject({ operation: "chat" });
});

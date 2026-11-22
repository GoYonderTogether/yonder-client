import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deviceModelStream } from "./device-model-stream.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("sends ordered parts and reports the count the end must carry", async () => {
	let acknowledge!: () => void;
	const held = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	const sent: [number, string][] = [];
	const stream = deviceModelStream(async (seq, part) => {
		sent.push([seq, part]);
		if (!seq) await held;
	}, vi.fn());
	stream.push('data: {"choices":[]}\n\n');
	await vi.advanceTimersByTimeAsync(0);
	stream.push('data: {"choices":[{}]}\n\n');
	const finish = stream.finish("data: [DONE]\n\n");
	expect(sent).toEqual([[0, 'data: {"choices":[]}\n\n']]);
	acknowledge();
	expect(await finish).toBe(3);
	expect(sent).toEqual([
		[0, 'data: {"choices":[]}\n\n'],
		[1, 'data: {"choices":[{}]}\n\n'],
		[2, "data: [DONE]\n\n"],
	]);
	expect(stream.count()).toBe(3);
});

test("an unacknowledged or stopped stream never replays a part and never reports success", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {
		throw new Error("ambiguous receipt");
	});
	const stream = deviceModelStream(post, fail);
	stream.push("data: {}\n\n");
	expect(await stream.finish()).toBeNull();
	expect(post).toHaveBeenCalledTimes(1);
	expect(fail).toHaveBeenCalledTimes(1);

	const cancelled = deviceModelStream(post, fail);
	cancelled.push("data: {}\n\n");
	cancelled.stop();
	await vi.runAllTimersAsync();
	expect(post).toHaveBeenCalledTimes(1);
	expect(await cancelled.finish()).toBeNull();
});

test("rejects a part that would exceed the server's part or total limit before sending it", async () => {
	const fail = vi.fn();
	const post = vi.fn(async () => {});
	const stream = deviceModelStream(post, fail);
	stream.push("录".repeat(22_000));
	await vi.runAllTimersAsync();
	expect(fail).toHaveBeenCalledTimes(1);
	expect(post).not.toHaveBeenCalled();

	const large = deviceModelStream(post, vi.fn());
	expect(await large.finish("x".repeat(65_537))).toBeNull();
	expect(post).not.toHaveBeenCalled();
});

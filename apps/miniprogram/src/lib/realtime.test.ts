import { afterEach, expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({ connectSocket: vi.fn() }));
vi.mock("@tarojs/taro", () => ({ default: mock }));

import { configureRealtime, resumeRealtime, suspendRealtime } from "./realtime";

afterEach(() => {
	suspendRealtime();
	vi.useRealTimers();
});

test("a socket network error reconnects without rotating or losing the account", async () => {
	vi.useFakeTimers();
	let networkError = () => {};
	let close = (_event: { code: number }) => {};
	const task = {
		onOpen() {},
		onMessage() {},
		onClose(callback: (event: { code: number }) => void) {
			close = callback;
		},
		onError(callback: () => void) {
			networkError = callback;
		},
		close: vi.fn(),
		send: vi.fn(),
	};
	mock.connectSocket.mockResolvedValue(task);
	const refresh = vi.fn(async () => false);
	const lost = vi.fn();
	configureRealtime({ baseUrl: "https://example.test", token: () => "access", refresh, lost });
	await resumeRealtime();
	networkError();
	expect(lost).not.toHaveBeenCalled();
	expect(refresh).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1000);
	expect(mock.connectSocket).toHaveBeenCalledTimes(2);
	close({ code: 4401 });
	await Promise.resolve();
	expect(refresh).toHaveBeenCalledOnce();
	expect(lost).not.toHaveBeenCalled();
});

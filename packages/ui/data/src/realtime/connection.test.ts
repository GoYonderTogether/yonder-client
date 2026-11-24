// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { RealtimeConnection } from "./connection.ts";

class TestSocket extends EventTarget {
	static instances: TestSocket[] = [];
	readyState = 1;
	constructor(readonly url: string) {
		super();
		TestSocket.instances.push(this);
	}
	close() {}
	send(_data: string) {}
}

test("dev observers preserve app handlers and stale socket closes cannot create another connection", () => {
	TestSocket.instances = [];
	const schedule = vi.fn();
	const handleEvent = vi.fn();
	const sessionLost = vi.fn();
	const observer = vi.fn();
	window.addEventListener("yonder-dev-realtime-event", observer);
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		schedule,
	});
	connection.setHandlers({ onEvent: handleEvent, onSessionLost: sessionLost });
	connection.connect();
	connection.connect();
	expect(TestSocket.instances).toHaveLength(1);
	const oldSocket = TestSocket.instances[0] as TestSocket;
	connection.stop();
	connection.connect();
	expect(TestSocket.instances).toHaveLength(2);
	const newSocket = TestSocket.instances[1] as TestSocket;

	oldSocket.dispatchEvent(new CloseEvent("close", { code: 4403 }));
	expect(schedule).not.toHaveBeenCalled();
	expect(sessionLost).not.toHaveBeenCalled();
	newSocket.dispatchEvent(new Event("open"));
	const event = { type: "session.revoked", at: "2026-11-14T00:00:00.000Z", eventId: "event-1", sessionId: "s1" };
	newSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
	expect(handleEvent).toHaveBeenCalledWith(event);
	expect(observer).toHaveBeenCalledTimes(1);
	expect((observer.mock.calls[0]?.[0] as CustomEvent | undefined)?.detail).toEqual({
		type: event.type,
		at: event.at,
		eventId: event.eventId,
	});
	connection.stop();
	window.removeEventListener("yonder-dev-realtime-event", observer);
});

test("native tool listeners share the account socket without replacing its cache handler", () => {
	TestSocket.instances = [];
	const cache = vi.fn();
	const native = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
	});
	connection.setHandlers({ onEvent: cache });
	const stop = connection.subscribeEvents(native);
	expect(connection.send({ type: "connector.ready", connectionIds: [] })).toBe(false);
	connection.connect();
	const socket = TestSocket.instances[0] as TestSocket;
	const send = vi.spyOn(socket, "send");
	const ready = { type: "connector.ready" as const, connectionIds: ["con_a"] };
	expect(connection.send(ready)).toBe(true);
	expect(send).toHaveBeenCalledWith(JSON.stringify(ready));
	const event = { type: "connectors.changed", at: new Date().toISOString(), eventId: "evt_a" };
	socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
	expect(cache).toHaveBeenCalledWith(event);
	expect(native).toHaveBeenCalledWith(event);
	stop();
	socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
	expect(native).toHaveBeenCalledTimes(1);
	connection.stop();
});

test("a stopped socket cannot publish a late notification after sign-out", () => {
	vi.stubEnv("DEV", false);
	TestSocket.instances = [];
	const handleEvent = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		onEvent: handleEvent,
	});
	try {
		connection.connect();
		const old = TestSocket.instances[0] as TestSocket;
		connection.stop();
		old.dispatchEvent(new MessageEvent("message", { data: '{"type":"notification.created"}' }));
		expect(handleEvent).not.toHaveBeenCalled();
	} finally {
		connection.stop();
		vi.unstubAllEnvs();
	}
});

test("reconnect backs off with jitter capped at three seconds and resets after opening", () => {
	TestSocket.instances = [];
	const schedule = vi.fn((_retry: () => void, _delay: number) => Symbol());
	const cancel = vi.fn();
	const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		schedule,
		cancel,
	});
	const close = () => TestSocket.instances.at(-1)?.dispatchEvent(new CloseEvent("close", { code: 1006 }));
	try {
		connection.connect();
		for (let i = 0; i < 7; i += 1) {
			close();
			expect(connection.status).toBe("reconnecting");
			schedule.mock.lastCall?.[0]();
		}
		expect(schedule.mock.calls.map(([, delay]) => delay)).toEqual([1245, 2490, 2995, 2995, 2995, 2995, 2995]);

		TestSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
		expect(connection.status).toBe("open");
		close();
		expect(schedule.mock.lastCall?.[1]).toBe(1245);

		const pendingRetry = schedule.mock.lastCall?.[0];
		connection.stop();
		expect(cancel).toHaveBeenLastCalledWith(schedule.mock.results.at(-1)?.value);
		pendingRetry?.();
		expect(TestSocket.instances).toHaveLength(8);
	} finally {
		connection.stop();
		random.mockRestore();
	}
});

test.each([4401, 4403])("does not retry a session rejected with close code %s", (code) => {
	TestSocket.instances = [];
	const schedule = vi.fn();
	const onSessionLost = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		schedule,
		onSessionLost,
	});
	connection.connect();
	TestSocket.instances[0]?.dispatchEvent(new CloseEvent("close", { code }));
	expect(connection.status).toBe("stopped");
	expect(onSessionLost).toHaveBeenCalledOnce();
	expect(schedule).not.toHaveBeenCalled();
});

function currentSocket() {
	const socket = TestSocket.instances.at(-1);
	if (!socket) throw new Error("Expected a socket");
	return socket;
}

function failUpgrade() {
	currentSocket().dispatchEvent(new CloseEvent("close", { code: 1006 }));
}

test("a failed upgrade refreshes an expired token once and advances the retry with the new token", async () => {
	TestSocket.instances = [];
	let token = "expired";
	const refreshSession = vi.fn(async () => {
		token = "fresh";
		return true;
	});
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => token,
		refreshSession,
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
	});
	try {
		connection.connect();
		expect(new URL(currentSocket().url).searchParams.get("token")).toBe("expired");
		failUpgrade();
		expect(connection.status).toBe("reconnecting");
		await Promise.resolve();
		expect(refreshSession).toHaveBeenCalledOnce();
		expect(new URL(currentSocket().url).searchParams.get("token")).toBe("fresh");
		currentSocket().dispatchEvent(new Event("open"));
		expect(connection.status).toBe("open");
	} finally {
		connection.stop();
	}
});

test("failed pre-open attempts are rate limited and a stale refresh cannot reconnect after stop", async () => {
	vi.useFakeTimers();
	TestSocket.instances = [];
	let finishRefresh: ((value: boolean) => void) | undefined;
	const refreshSession = vi
		.fn()
		.mockResolvedValueOnce(false)
		.mockImplementationOnce(
			() =>
				new Promise<boolean>((resolve) => {
					finishRefresh = resolve;
				}),
		);
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		refreshSession,
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
	});
	try {
		connection.connect();
		failUpgrade();
		await Promise.resolve();
		for (let i = 0; i < 5; i++) {
			connection.resume();
			failUpgrade();
		}
		expect(refreshSession).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		failUpgrade();
		expect(refreshSession).toHaveBeenCalledTimes(2);
		connection.stop();
		const before = TestSocket.instances.length;
		finishRefresh?.(true);
		await vi.runOnlyPendingTimersAsync();
		connection.resume();
		expect(TestSocket.instances).toHaveLength(before);
		expect(connection.status).toBe("stopped");
	} finally {
		connection.stop();
		vi.useRealTimers();
	}
});

test("resume verifies a healthy socket without rotating it and ignores heartbeat replies as app events", async () => {
	vi.useFakeTimers();
	TestSocket.instances = [];
	const onEvent = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		onEvent,
	});
	try {
		connection.connect();
		const socket = currentSocket();
		socket.dispatchEvent(new Event("open"));
		const send = vi.spyOn(socket, "send");
		connection.resume();
		connection.resume();
		expect(send).toHaveBeenCalledOnce();
		socket.dispatchEvent(new MessageEvent("message", { data: '{"type":"pong"}' }));
		await vi.advanceTimersByTimeAsync(9000);
		expect(TestSocket.instances).toEqual([socket]);
		expect(connection.status).toBe("open");
		expect(onEvent).not.toHaveBeenCalled();
	} finally {
		connection.stop();
		vi.useRealTimers();
	}
});

test("an unresponsive hidden socket recovers without focus and does not replay the lost request", async () => {
	vi.useFakeTimers();
	TestSocket.instances = [];
	const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
	const onEvent = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => "access",
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		onEvent,
	});
	const ready = {
		type: "device_model.ready",
		endpoints: [{ endpointId: "3d9a2c05-5123-4e7a-9091-023471317af2", revision: 1, label: "Mock", protocol: "openai" }],
	} satisfies Parameters<typeof connection.send>[0];
	const pending = new Set(["in-flight"]);
	const status = connection.subscribe(() => {
		if (connection.status === "open") connection.send(ready);
		else pending.clear();
	});
	try {
		connection.connect();
		const oldSocket = currentSocket();
		oldSocket.dispatchEvent(new Event("open"));
		pending.add("in-flight");
		await vi.advanceTimersByTimeAsync(38_000);
		expect(connection.status).toBe("reconnecting");
		expect(pending.size).toBe(0);
		expect(connection.send({ type: "connector.ready", connectionIds: [] })).toBe(false);
		await vi.advanceTimersByTimeAsync(3000);
		const replacement = currentSocket();
		expect(replacement).not.toBe(oldSocket);
		const send = vi.spyOn(replacement, "send");
		replacement.dispatchEvent(new Event("open"));
		expect(send.mock.calls).toEqual([[JSON.stringify(ready)]]);
		oldSocket.dispatchEvent(new MessageEvent("message", { data: '{"type":"device_model.request"}' }));
		expect(onEvent).not.toHaveBeenCalled();
	} finally {
		status();
		connection.stop();
		visibility.mockRestore();
		vi.useRealTimers();
	}
});

test("network recovery can retry a temporarily unavailable refresh without signing out", async () => {
	TestSocket.instances = [];
	let token = "expired";
	const onSessionLost = vi.fn();
	const refreshSession = vi
		.fn()
		.mockRejectedValueOnce(new Error("offline"))
		.mockImplementationOnce(async () => {
			token = "fresh";
			return true;
		});
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => token,
		refreshSession,
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		onSessionLost,
	});
	try {
		connection.connect();
		failUpgrade();
		await Promise.resolve();
		connection.resume();
		failUpgrade();
		expect(refreshSession).toHaveBeenCalledOnce();
		connection.resume(true);
		failUpgrade();
		await Promise.resolve();
		expect(refreshSession).toHaveBeenCalledTimes(2);
		expect(onSessionLost).not.toHaveBeenCalled();
		expect(new URL(currentSocket().url).searchParams.get("token")).toBe("fresh");
	} finally {
		connection.stop();
	}
});

test("a conclusive server refresh rejection stops recovery just like an explicit revoked close", async () => {
	TestSocket.instances = [];
	let token: string | null = "expired";
	const onSessionLost = vi.fn();
	const connection = new RealtimeConnection({
		baseUrl: "http://localhost",
		getAccessToken: () => token,
		refreshSession: async () => {
			token = null;
			return false;
		},
		WebSocketImpl: TestSocket as unknown as typeof WebSocket,
		onSessionLost,
	});
	connection.connect();
	failUpgrade();
	await Promise.resolve();
	connection.resume(true);
	expect(connection.status).toBe("stopped");
	expect(TestSocket.instances).toHaveLength(1);
	expect(onSessionLost).toHaveBeenCalledOnce();
});

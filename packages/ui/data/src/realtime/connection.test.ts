// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { RealtimeConnection } from "./connection.ts";

class TestSocket extends EventTarget {
	static instances: TestSocket[] = [];
	readyState = 1;
	constructor() {
		super();
		TestSocket.instances.push(this);
	}
	close() {}
	send() {}
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

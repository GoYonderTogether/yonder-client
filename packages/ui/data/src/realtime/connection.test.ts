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

// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
	closeContactWindow,
	notifyContactAdded,
	requestMainAccessToken,
	serveContactWindowSession,
} from "./contact-window.ts";

const bridge = vi.hoisted(() => ({
	callbacks: new Map<string, (event: { payload: unknown }) => unknown>(),
	invoke: vi.fn(),
	stop: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => unknown) => {
		bridge.callbacks.set(name, callback);
		return bridge.stop;
	}),
}));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	bridge.callbacks.clear();
	bridge.invoke.mockReset();
	bridge.stop.mockReset();
});

test("a missing main window times out without leaving its token listener alive", async () => {
	vi.useFakeTimers();
	const token = requestMainAccessToken();
	await vi.advanceTimersByTimeAsync(10_001);
	expect(await token).toBeNull();
	expect(bridge.stop).toHaveBeenCalledOnce();
});

test("opening a conversation from the contacts window invokes the native close-and-focus command", async () => {
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, location: { pathname: "/contacts/add" } });
	vi.stubGlobal("navigator", { userAgent: "Macintosh" });
	await notifyContactAdded("conv-1");
	expect(bridge.invoke).toHaveBeenCalledWith("contact_added", { conversationId: "conv-1" });
});

test("the main window serves access-only sessions through its existing refresh owner", async () => {
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, location: { pathname: "/messages" } });
	vi.stubGlobal("navigator", { userAgent: "Macintosh" });
	const client = {
		accessToken: "old",
		refreshSession: vi.fn(async () => {
			client.accessToken = "new";
			return true;
		}),
	};
	await serveContactWindowSession(client);
	await bridge.callbacks.get("contacts-session-request")?.({ payload: "request-1" });
	expect(client.refreshSession).toHaveBeenCalledOnce();
	expect(bridge.invoke).toHaveBeenCalledWith("provide_contacts_session", {
		requestId: "request-1",
		accessToken: "new",
	});
	await closeContactWindow();
	expect(bridge.invoke).toHaveBeenCalledWith("close_add_contacts");
});

test("the main window lends its current access token during a temporary refresh failure", async () => {
	vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, location: { pathname: "/messages" } });
	vi.stubGlobal("navigator", { userAgent: "Macintosh" });
	await serveContactWindowSession({ accessToken: "existing", refreshSession: async () => false });
	await bridge.callbacks.get("contacts-session-request")?.({ payload: "request-1" });
	expect(bridge.invoke).toHaveBeenCalledWith("provide_contacts_session", {
		requestId: "request-1",
		accessToken: "existing",
	});
});

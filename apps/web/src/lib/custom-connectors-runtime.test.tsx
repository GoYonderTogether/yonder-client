// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ConnectorInstance, CustomCallRequest } from "@yonder/protocol";
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * The bridge between the socket and the device's native commands. The native invoke and the socket
 * are mocked here; the pure helpers below are imported from the real module, so what the runtime
 * sends is what the shell would receive.
 */

const native = vi.hoisted(() => ({
	context: { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" },
	invoke: vi.fn(),
	connections: [] as ConnectorInstance[],
	status: "open" as string,
	events: [] as ((event: unknown) => void)[],
	statuses: [] as (() => void)[],
	listeners: new Map<string, (payload: unknown) => void>(),
	send: vi.fn(() => true),
}));

type Row = Pick<ConnectorInstance, "id" | "deviceId" | "revision" | "connectorId">;

const realtime = {
	get status() {
		return native.status;
	},
	send: native.send,
	subscribe: (listener: () => void) => {
		native.statuses.push(listener);
		return () => {
			const index = native.statuses.indexOf(listener);
			if (index >= 0) native.statuses.splice(index, 1);
		};
	},
	subscribeEvents: (listener: (event: unknown) => void) => {
		native.events.push(listener);
		return () => {
			const index = native.events.indexOf(listener);
			if (index >= 0) native.events.splice(index, 1);
		};
	},
};

vi.mock("@yonder/ui-data", () => ({
	useData: () => ({ realtime }),
	useConnectors: () => ({ data: { items: native.connections } }),
}));
vi.mock("./local-files.ts", () => ({
	invokeLocalFiles: native.invoke,
	useLocalFilesContext: () => native.context,
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: async (name: string, listener: (event: { payload: unknown }) => void) => {
		// The real `listen` callback receives `{ payload }`; the mock keeps the same shape.
		native.listeners.set(name, (payload) => listener({ payload }));
		return () => native.listeners.delete(name);
	},
}));

import {
	CustomConnectorsRuntime,
	customCallEligible,
	customResultMessage,
	newBatchId,
	pollIntervals,
	refusalCode,
} from "./custom-connectors-runtime.tsx";

const connection = (overrides: Partial<Row> = {}): ConnectorInstance =>
	({
		id: "con_c",
		deviceId: "dev_a",
		revision: 3,
		connectorId: "custom:notes",
		scope: "device",
		capabilities: { fileTools: false, terminal: false, desktop: false, browser: false },
		deviceName: "Mac",
		name: "notes",
		status: "online",
		currentDevice: true,
		createdAt: "2026-11-28T00:00:00.000Z",
		...overrides,
	}) as ConnectorInstance;

const call = (overrides: Partial<CustomCallRequest> = {}): CustomCallRequest => ({
	callId: "ccc_1",
	connectionId: "con_c",
	revision: 3,
	tool: "lookup",
	args: { q: "x" },
	expiresAt: new Date(Date.now() + 60_000).toISOString(),
	...overrides,
});

afterEach(() => {
	native.invoke.mockReset();
	native.send.mockClear();
	native.connections = [];
	native.status = "open";
	native.events = [];
	native.statuses = [];
	native.listeners.clear();
});

describe("eligibility", () => {
	test("a call is eligible only for a custom connection of this device at its revision", () => {
		const rows = [connection()];
		expect(customCallEligible(call(), rows, "dev_a")).toBe(true);
		expect(customCallEligible(call({ revision: 2 }), rows, "dev_a")).toBe(false);
		expect(customCallEligible(call(), rows, "dev_other")).toBe(false);
		expect(customCallEligible(call({ connectionId: "con_missing" }), rows, "dev_a")).toBe(false);
		// A built-in connector's id never reaches a package's entry.
		expect(customCallEligible(call(), [connection({ connectorId: "local-files" })], "dev_a")).toBe(false);
	});
	test("an expired call is refused before the shell sees it", () => {
		const expired = call({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
		expect(customCallEligible(expired, [connection()], "dev_a")).toBe(false);
		expect(customCallEligible(call({ expiresAt: "not-a-date" }), [connection()], "dev_a")).toBe(false);
	});
});

describe("wire messages", () => {
	test("a result carries the value, never the package's entry hash or slug", () => {
		expect(customResultMessage("ccc_1", { ok: true, result: { text: "hi" } })).toEqual({
			type: "connector.custom.result",
			callId: "ccc_1",
			ok: true,
			result: { text: "hi" },
		});
		expect(customResultMessage("ccc_1", { ok: false, error: "needs_reauth" })).toEqual({
			type: "connector.custom.result",
			callId: "ccc_1",
			ok: false,
			error: "needs_reauth",
		});
	});
	test("a native refusal keeps its code and anything else becomes a fixed generic one", () => {
		expect(refusalCode(new Error("needs_reauth"))).toBe("needs_reauth");
		expect(refusalCode(new Error("bad output: /Users/zoran/secret"))).toBe("operation_failed");
		expect(refusalCode("")).toBe("operation_failed");
		expect(refusalCode(42)).toBe("operation_failed");
	});
	test("a batch id is bounded and made of the connection id plus a short salt", () => {
		const id = newBatchId("con_c", 1_700_000_000_000);
		expect(id.startsWith("con_c-")).toBe(true);
		expect(id.length).toBeLessThan(80);
		expect(id).toMatch(/^[a-z0-9_-]+$/);
	});
	test("the poll plan reads the shell's own interval answer", () => {
		expect(
			pollIntervals({
				installed: [
					{ connectionId: "con_c", revision: 3, everySeconds: 60 },
					{ connectionId: "con_d", revision: 1, everySeconds: null },
				],
				blocked: [],
			}),
		).toEqual(
			new Map<string, number | null>([
				["con_c", 60],
				["con_d", null],
			]),
		);
	});
});

describe("runtime", () => {
	test("an accepted call reaches the shell once and its answer is sent once", async () => {
		native.connections = [connection()];
		native.invoke.mockImplementation(async (command: string) => {
			if (command === "custom_connector_poll")
				return { installed: [{ connectionId: "con_c", revision: 3, everySeconds: 60 }], blocked: [] };
			if (command === "custom_connector_execute") return { ok: true, result: { text: "hello" } };
			return undefined;
		});
		const { unmount } = render(<CustomConnectorsRuntime />);
		await vi.waitFor(() => expect(native.listeners.size).toBe(2));
		expect(native.invoke).toHaveBeenCalledWith(
			"custom_connector_poll",
			expect.objectContaining({
				connections: [{ connectionId: "con_c", revision: 3 }],
			}),
		);
		native.events[0]?.({ type: "connector.custom.call", call: call(), eventId: "e1", at: "" });
		await vi.waitFor(() =>
			expect(native.send).toHaveBeenCalledWith({
				type: "connector.custom.result",
				callId: "ccc_1",
				ok: true,
				result: { text: "hello" },
			}),
		);
		expect(native.send).toHaveBeenCalledTimes(1);
		unmount();
	});

	test("a call for another device or an expired one is answered permission_denied and never runs", async () => {
		native.connections = [connection()];
		native.invoke.mockResolvedValue({ installed: [], blocked: [] });
		render(<CustomConnectorsRuntime />);
		await vi.waitFor(() => expect(native.listeners.size).toBe(2));
		native.events[0]?.({ type: "connector.custom.call", call: call({ revision: 2 }), eventId: "e1", at: "" });
		await vi.waitFor(() =>
			expect(native.send).toHaveBeenCalledWith({
				type: "connector.custom.result",
				callId: "ccc_1",
				ok: false,
				error: "permission_denied",
			}),
		);
		expect(native.invoke.mock.calls.filter(([name]) => name === "custom_connector_execute")).toHaveLength(0);
	});

	test("a native throw becomes a fixed refusal code, never its own message", async () => {
		native.connections = [connection()];
		native.invoke.mockImplementation(async (command: string) => {
			if (command === "custom_connector_poll") return { installed: [], blocked: [] };
			throw new Error("/Users/zoran/Library/secret: needs_reauth");
		});
		render(<CustomConnectorsRuntime />);
		await vi.waitFor(() => expect(native.listeners.size).toBe(2));
		native.events[0]?.({ type: "connector.custom.call", call: call(), eventId: "e1", at: "" });
		await vi.waitFor(() =>
			expect(native.send).toHaveBeenCalledWith({
				type: "connector.custom.result",
				callId: "ccc_1",
				ok: false,
				error: "operation_failed",
			}),
		);
	});

	test("an ack tells the shell, and a polled batch goes on the socket as it arrived", async () => {
		native.connections = [connection()];
		native.invoke.mockResolvedValue({ installed: [], blocked: [] });
		render(<CustomConnectorsRuntime />);
		await vi.waitFor(() => expect(native.listeners.size).toBe(2));
		native.events[0]?.({ type: "connector.event.ack", connectionId: "con_c", batchId: "b-1", eventId: "e", at: "" });
		await vi.waitFor(() =>
			expect(native.invoke).toHaveBeenCalledWith(
				"custom_connector_ack",
				expect.objectContaining({ connectionId: "con_c", batchId: "b-1" }),
			),
		);
		const batch = {
			type: "connector.event",
			connectionId: "con_c",
			revision: 3,
			batchId: "b-2",
			events: [{ sourceId: "n1" }],
		};
		native.listeners.get("custom-connector-event")?.(batch);
		await vi.waitFor(() => expect(native.send).toHaveBeenCalledWith(batch));
	});

	test("a ready report the device wrote after confirmation goes to the socket", async () => {
		native.connections = [connection()];
		native.invoke.mockResolvedValue({ installed: [], blocked: [] });
		render(<CustomConnectorsRuntime />);
		await vi.waitFor(() => expect(native.listeners.size).toBe(2));
		const ready = {
			type: "connector.custom.ready",
			connectionId: "con_c",
			slug: "notes",
			entrySha256: "a".repeat(64),
			revision: 3,
		};
		native.listeners.get("custom-connector-ready")?.(ready);
		await vi.waitFor(() => expect(native.send).toHaveBeenCalledWith(ready));
	});

	test("a device without a session context runs nothing", async () => {
		native.context = { ownerId: "", deviceId: "", sessionId: "" };
		native.invoke.mockResolvedValue({ installed: [], blocked: [] });
		render(<CustomConnectorsRuntime />);
		expect(native.invoke).not.toHaveBeenCalled();
	});
});

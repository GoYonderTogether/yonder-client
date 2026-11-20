// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import type { ServerEvent } from "@yonder/protocol";
import { afterEach, expect, test, vi } from "vitest";

const setup = vi.hoisted(() => {
	const context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
	let onEvent: ((event: ServerEvent) => void) | undefined;
	let onStatus: (() => void) | undefined;
	const realtime = {
		status: "open",
		send: vi.fn(() => true),
		subscribe: (listener: () => void) => {
			onStatus = listener;
			return () => {
				onStatus = undefined;
			};
		},
		subscribeEvents: (listener: (event: ServerEvent) => void) => {
			onEvent = listener;
			return () => {
				onEvent = undefined;
			};
		},
	};
	return {
		context,
		account: { current: context },
		status(next: string) {
			realtime.status = next;
			onStatus?.();
		},
		query: { getQueryData: vi.fn() },
		beginTrayWork: vi.fn(() => ({ attribute: vi.fn(), finish: vi.fn(), update: vi.fn() })),
		conversations: vi.fn(),
		realtime,
		submit: vi.fn(async () => ({ ok: true })),
		fail: vi.fn(async () => ({ id: "request", state: "failed" })),
		invoke: vi.fn(),
		event: (event: ServerEvent) => onEvent?.(event),
	};
});
vi.mock("@yonder/ui-data", () => ({
	keys: { conversations: { list: () => ["conversations"] } },
	useDataQueryClient: () => setup.query,
	useConnectors: () => ({ data: { items: [{ id: "con_a", deviceId: "dev_a", revision: 2 }] } }),
	useData: () => ({
		api: {
			submitConnectorResult: setup.submit,
			failConnectorRequest: setup.fail,
			conversations: setup.conversations,
		},
		realtime: setup.realtime,
	}),
}));
vi.mock("./local-files.ts", () => ({
	invokeLocalFiles: setup.invoke,
	onLocalFilesChanged: () => () => {},
	useLocalFilesContext: () => setup.account.current,
}));

vi.mock("./tray-bridge.ts", () => ({ beginTrayConnectorWork: setup.beginTrayWork }));

import { LocalFilesRuntime } from "./local-files-runtime.tsx";

afterEach(() => {
	setup.fail.mockClear();
	setup.realtime.send.mockClear();
	setup.invoke.mockReset();
	setup.beginTrayWork.mockClear();
	setup.query.getQueryData.mockReset();
	setup.conversations.mockReset();
	setup.account.current = setup.context;
	setup.status("open");
});

const grant = (overrides: Partial<{ connectionId: string; connectorId: "local-files" | "computer-control" }> = {}) => ({
	connectionId: "con_a",
	connectorId: "local-files" as const,
	scope: "device" as const,
	capabilities: { fileTools: false },
	revision: 2,
	...overrides,
});

test("a dispatched grant is written locally and then reported ready over the existing socket", async () => {
	setup.invoke.mockImplementation(async (command: string) =>
		command === "local_files_ready" ? [{ id: "con_a", revision: 2 }] : undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenCalledWith({
			type: "connector.ready",
			connections: [{ id: "con_a", revision: 2 }],
		}),
	);
	setup.invoke.mockClear();
	setup.realtime.send.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_grant",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [grant()],
		}),
	);
	await waitFor(() =>
		expect(setup.invoke).toHaveBeenCalledWith("local_files_authorize", {
			context: setup.context,
			config: {
				id: "con_a",
				connectorId: "local-files",
				scope: "device",
				capabilities: { fileTools: false },
				revision: 2,
			},
		}),
	);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenCalledWith({
			type: "connector.ready",
			connections: [{ id: "con_a", revision: 2 }],
		}),
	);
	expect(setup.fail).not.toHaveBeenCalled();
	unmount();
});

test("a grant for a new connection is reported ready without waiting for the connection list", async () => {
	setup.invoke.mockImplementation(async (command: string) =>
		command === "local_files_ready" ? [{ id: "con_new", revision: 5 }] : undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	setup.realtime.send.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_new",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [{ ...grant({ connectionId: "con_new" }), revision: 5 }],
		}),
	);
	await waitFor(() =>
		expect(setup.invoke).toHaveBeenCalledWith("local_files_ready", {
			context: setup.context,
			connections: expect.arrayContaining([{ id: "con_new", revision: 5 }]),
		}),
	);
	unmount();
});

test("a failed local grant reports the real error instead of claiming readiness", async () => {
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2 }];
		if (command === "local_files_authorize") throw new Error("permission_denied");
		return undefined;
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	setup.realtime.send.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_fail",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [grant()],
		}),
	);
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "permission_denied"));
	expect(setup.realtime.send).not.toHaveBeenCalledWith(
		expect.objectContaining({ type: "connector.ready", connections: expect.arrayContaining([expect.anything()]) }),
	);
	unmount();
});

test("an unknown native failure is reported as a real code, never silently dropped", async () => {
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [];
		if (command === "local_files_authorize") throw new Error("disk full");
		return undefined;
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_unknown",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [grant()],
		}),
	);
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "operation_failed"));
	unmount();
});

test("ready uses the existing socket and cancelled or foreign-device work cannot deliver local file content", async () => {
	let finish: ((value: unknown) => void) | undefined;
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2 }];
		if (command === "local_files_execute")
			return new Promise((resolve) => {
				finish = resolve;
			});
		return undefined;
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenCalledWith({
			type: "connector.ready",
			connections: [{ id: "con_a", revision: 2 }],
		}),
	);
	const command = {
		id: "cmd_a",
		connectorId: "local-files" as const,
		scope: "device" as const,
		capabilities: { fileTools: false },
		revision: 2,
		connectionId: "con_a",
		deviceId: "dev_a",
		operation: "read" as const,
		path: "note.txt",
		expiresAt: new Date(Date.now() + 15000).toISOString(),
	};
	act(() => setup.event({ type: "connector.command", eventId: "event_a", at: new Date().toISOString(), command }));
	await waitFor(() => expect(finish).toBeDefined());
	act(() =>
		setup.event({
			type: "connector.command.cancelled",
			eventId: "event_b",
			at: new Date().toISOString(),
			commandId: command.id,
		}),
	);
	await act(async () =>
		finish?.({ ok: true, result: { kind: "read", path: command.path, content: "fixture", truncated: false } }),
	);
	expect(setup.submit).not.toHaveBeenCalled();
	act(() =>
		setup.event({
			type: "connector.command",
			eventId: "event_c",
			at: new Date().toISOString(),
			command: { ...command, id: "cmd_other", deviceId: "dev_other" },
		}),
	);
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith("cmd_other", { ok: false, error: "permission_denied" }),
	);
	expect(setup.invoke.mock.calls.filter(([name]) => name === "local_files_execute")).toHaveLength(1);
	unmount();
	expect(setup.realtime.send).toHaveBeenLastCalledWith({ type: "connector.ready", connections: [] });
});

test("only accepted local commands appear in the tray, using their exact Bot and conversation", async () => {
	let finish: ((value: unknown) => void) | undefined;
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2 }];
		if (command === "local_files_execute")
			return new Promise((resolve) => {
				finish = resolve;
			});
		return undefined;
	});
	setup.query.getQueryData.mockReturnValue({
		items: [{ id: "chat_a", title: "Work chat", members: [{ memberId: "bot_a", kind: "bot", displayName: "Bot A" }] }],
	});
	const { unmount } = render(<LocalFilesRuntime />);
	const command = {
		id: "cmd_a",
		connectorId: "local-files" as const,
		scope: "device" as const,
		capabilities: { fileTools: false },
		revision: 2,
		connectionId: "con_a",
		deviceId: "dev_other",
		operation: "read" as const,
		path: "note.txt",
		expiresAt: new Date(Date.now() + 15000).toISOString(),
		origin: { botId: "bot_a", conversationId: "chat_a" },
	};
	const emit = (value: typeof command) =>
		setup.event({ type: "connector.command", eventId: value.id, at: new Date().toISOString(), command: value });
	act(() => emit(command));
	expect(setup.beginTrayWork).not.toHaveBeenCalled();

	act(() => emit({ ...command, id: "cmd_local", deviceId: "dev_a" }));
	expect(setup.beginTrayWork).toHaveBeenCalledWith({
		botId: "bot_a",
		botName: "Bot A",
		conversationId: "chat_a",
		conversationTitle: "Work chat",
		activity: expect.any(String),
	});
	const released = setup.beginTrayWork.mock.results[0]?.value.finish;
	expect(released).not.toHaveBeenCalled();
	await act(async () => finish?.({ ok: false, error: "cancelled" }));
	expect(setup.beginTrayWork.mock.results[0]?.value.update).toHaveBeenCalledOnce();
	expect(released).toHaveBeenCalledOnce();
	unmount();
});

test("unknown local connector work clears on disconnect, cancellation and account change", async () => {
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2 }];
		if (command === "local_files_execute") return new Promise(() => {});
		return undefined;
	});
	const { rerender, unmount } = render(<LocalFilesRuntime />);
	const emit = (id: string) =>
		setup.event({
			type: "connector.command",
			eventId: id,
			at: new Date().toISOString(),
			command: {
				id,
				connectorId: "local-files",
				scope: "device",
				capabilities: { fileTools: false },
				revision: 2,
				connectionId: "con_a",
				deviceId: "dev_a",
				operation: "read",
				path: "note.txt",
				expiresAt: new Date(Date.now() + 15000).toISOString(),
			},
		});
	act(() => emit("cmd_a"));
	expect(setup.beginTrayWork).toHaveBeenCalledWith(null);
	const first = setup.beginTrayWork.mock.results[0]?.value.finish;
	act(() => setup.status("reconnecting"));
	expect(first).toHaveBeenCalledOnce();

	act(() => setup.status("open"));
	act(() => emit("cmd_b"));
	const second = setup.beginTrayWork.mock.results[1]?.value.finish;
	act(() =>
		setup.event({
			type: "connector.command.cancelled",
			eventId: "evt_b",
			at: new Date().toISOString(),
			commandId: "cmd_b",
		}),
	);
	expect(second).toHaveBeenCalledOnce();

	act(() => emit("cmd_c"));
	const third = setup.beginTrayWork.mock.results[2]?.value.finish;
	setup.account.current = { ...setup.context, ownerId: "mem_other" };
	rerender(<LocalFilesRuntime />);
	expect(third).toHaveBeenCalledOnce();
	unmount();
});

test("cold-cache commands execute immediately, share one authenticated lookup, and never revive cancelled rows", async () => {
	let resolve!: (value: unknown) => void;
	setup.conversations.mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2 }];
		if (command === "local_files_execute") return new Promise(() => {});
	});
	const { unmount } = render(<LocalFilesRuntime />);
	const send = (id: string) =>
		setup.event({
			type: "connector.command",
			eventId: id,
			at: new Date().toISOString(),
			command: {
				id,
				connectorId: "local-files",
				scope: "device",
				capabilities: { fileTools: false },
				revision: 2,
				connectionId: "con_a",
				deviceId: "dev_a",
				operation: "read",
				path: "note.txt",
				expiresAt: new Date(Date.now() + 15000).toISOString(),
				origin: { botId: "bot_a", conversationId: "chat_a" },
			},
		});
	act(() => {
		send("cmd_cold_a");
		send("cmd_cold_b");
	});
	expect(setup.conversations).toHaveBeenCalledOnce();
	expect(setup.invoke.mock.calls.filter(([name]) => name === "local_files_execute")).toHaveLength(2);
	act(() =>
		setup.event({
			type: "connector.command.cancelled",
			eventId: "cancel",
			at: new Date().toISOString(),
			commandId: "cmd_cold_b",
		}),
	);
	await act(async () =>
		resolve({
			items: [
				{ id: "chat_a", title: "Cold chat", members: [{ memberId: "bot_a", kind: "bot", displayName: "Bot A" }] },
			],
		}),
	);
	expect(setup.beginTrayWork.mock.results[0]?.value.attribute).toHaveBeenCalledWith(
		expect.objectContaining({ conversationTitle: "Cold chat", botName: "Bot A" }),
	);
	expect(setup.beginTrayWork.mock.results[1]?.value.attribute).not.toHaveBeenCalled();
	unmount();
});

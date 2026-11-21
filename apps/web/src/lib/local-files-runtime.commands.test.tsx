// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { setup } from "./local-files-runtime.mock.ts";

import { LocalFilesRuntime } from "./local-files-runtime.tsx";

afterEach(() => {
	setup.submit.mockClear();
	setup.realtime.send.mockClear();
	setup.invoke.mockReset();
	setup.beginTrayWork.mockClear();
	setup.query.getQueryData.mockReset();
	setup.conversations.mockReset();
	setup.account.current = setup.context;
	setup.resetConnections();
	setup.status("open");
});

test("ready uses the existing socket and cancelled or foreign-device work cannot deliver local file content", async () => {
	let finish: ((value: unknown) => void) | undefined;
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2, toolsVersion: 2 }];
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
			connections: [{ id: "con_a", revision: 2, toolsVersion: 2 }],
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
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2, toolsVersion: 2 }];
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
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2, toolsVersion: 2 }];
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
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2, toolsVersion: 2 }];
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

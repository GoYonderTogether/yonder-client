// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import type { ServerEvent } from "@yonder/protocol";
import { expect, test, vi } from "vitest";

const setup = vi.hoisted(() => {
	const context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
	let onEvent: ((event: ServerEvent) => void) | undefined;
	const realtime = {
		status: "open",
		send: vi.fn(() => true),
		subscribe: vi.fn(() => () => {}),
		subscribeEvents: (listener: (event: ServerEvent) => void) => {
			onEvent = listener;
			return () => {
				onEvent = undefined;
			};
		},
	};
	return {
		context,
		realtime,
		submit: vi.fn(async () => ({ ok: true })),
		invoke: vi.fn(),
		event: (event: ServerEvent) => onEvent?.(event),
	};
});
vi.mock("@yonder/ui-data", () => ({
	useConnectors: () => ({ data: { items: [{ id: "con_a", deviceId: "dev_a", revision: 2 }] } }),
	useData: () => ({ api: { submitConnectorResult: setup.submit }, realtime: setup.realtime }),
}));
vi.mock("./local-files.ts", () => ({
	invokeLocalFiles: setup.invoke,
	onLocalFilesChanged: () => () => {},
	useLocalFilesContext: () => setup.context,
}));

import { LocalFilesRuntime } from "./local-files-runtime.tsx";

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

// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import type { ConnectorCommand } from "@yonder/protocol";
import { expect, test } from "vitest";
import { setup } from "./local-files-runtime.mock.ts";
import { LocalFilesRuntime } from "./local-files-runtime.tsx";

test("publishes one readiness snapshot and blocks stale or revoked Apple command results", async () => {
	const file = { id: "con_file", deviceId: "dev_a", revision: 1 };
	const apple = {
		id: "con_calendar",
		deviceId: "dev_a",
		connectorId: "apple-calendar",
		scope: "device",
		capabilities: { fileTools: false },
		revision: 2,
	} as const;
	setup.connections.set([file, apple]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: file.id, revision: file.revision }] : undefined,
	);
	setup.readyApple.mockImplementation(async (_context, connections) => connections);
	let complete: ((result: unknown) => void) | undefined;
	setup.executeApple.mockImplementation(
		() =>
			new Promise((resolve) => {
				complete = resolve;
			}),
	);
	const { unmount } = render(<LocalFilesRuntime apple />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenLastCalledWith({
			type: "connector.ready",
			connections: [
				{ id: file.id, revision: 1 },
				{ id: apple.id, revision: 2 },
			],
		}),
	);
	const command: ConnectorCommand = {
		id: "cmd_calendar",
		connectionId: apple.id,
		deviceId: apple.deviceId,
		connectorId: apple.connectorId,
		scope: apple.scope,
		capabilities: apple.capabilities,
		revision: apple.revision,
		operation: "apple_calendar_list",
		path: "",
		args: { dateFrom: "2026-11-21", dateTo: "2026-11-21" },
		expiresAt: new Date(Date.now() + 15000).toISOString(),
	};
	const dispatch = (value: ConnectorCommand) =>
		act(() =>
			setup.event({ type: "connector.command", eventId: value.id, at: new Date().toISOString(), command: value }),
		);
	dispatch({ ...command, id: "stale", revision: 1 });
	await waitFor(() => expect(setup.submit).toHaveBeenCalledWith("stale", { ok: false, error: "permission_denied" }));
	expect(setup.executeApple).not.toHaveBeenCalled();
	dispatch(command);
	await waitFor(() => expect(complete).toBeDefined());
	act(() => setup.connections.set([file]));
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenLastCalledWith({
			type: "connector.ready",
			connections: [{ id: file.id, revision: 1 }],
		}),
	);
	await act(async () => complete?.({ kind: "apple_calendar_list", events: [], more: false }));
	expect(setup.submit).toHaveBeenCalledWith(command.id, { ok: false, error: "cancelled" });
	unmount();
});

// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import type { ConnectorCommand } from "@yonder/protocol";
import { afterEach, expect, test } from "vitest";
import { setup } from "./local-files-runtime.mock.ts";

import { LocalFilesRuntime } from "./local-files-runtime.tsx";

afterEach(() => {
	setup.submit.mockClear();
	setup.realtime.send.mockClear();
	setup.invoke.mockReset();
	setup.executeShell.mockReset();
	setup.executeDesktop.mockReset();
	setup.cancelShell.mockClear();
	setup.beginTrayWork.mockClear();
	setup.query.getQueryData.mockReset();
	setup.conversations.mockReset();
	setup.account.current = setup.context;
	setup.resetConnections();
	setup.status("open");
});

const desktop = {
	id: "con_desktop",
	deviceId: "dev_a",
	revision: 5,
	connectorId: "computer-control",
	scope: "device",
	capabilities: { fileTools: false, terminal: false, desktop: true, browser: false },
} as const;

function command(overrides: Partial<ConnectorCommand> = {}): ConnectorCommand {
	return {
		id: "cmd_desktop",
		connectionId: desktop.id,
		deviceId: desktop.deviceId,
		connectorId: desktop.connectorId,
		scope: desktop.scope,
		capabilities: desktop.capabilities,
		revision: desktop.revision,
		operation: "desktop_windows",
		path: "",
		args: {},
		expiresAt: new Date(Date.now() + 15000).toISOString(),
		...overrides,
	};
}

function dispatch(value: ConnectorCommand) {
	return act(() =>
		setup.event({ type: "connector.command", eventId: value.id, at: new Date().toISOString(), command: value }),
	);
}

test("a desktop command goes to the native backend and its result goes back unchanged", async () => {
	setup.connections.set([desktop]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: desktop.id, revision: desktop.revision }] : undefined,
	);
	setup.executeDesktop.mockResolvedValue({
		ok: true,
		result: { kind: "desktop_windows", windows: [] },
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command());
	await waitFor(() => expect(setup.submit).toHaveBeenCalledOnce());
	const [id, result] = setup.submit.mock.calls[0] as unknown as [string, { ok: boolean }];
	expect(id).toBe("cmd_desktop");
	expect(result).toMatchObject({ ok: true, result: { kind: "desktop_windows" } });
	const [context, sent] = setup.executeDesktop.mock.calls[0] as [unknown, { operation: string; expiresAtMs: number }];
	expect(context).toEqual(setup.context);
	expect(sent.operation).toBe("desktop_windows");
	expect(typeof sent.expiresAtMs).toBe("number");
	// Desktop never falls through to the file executor or the shell.
	expect(setup.invoke).not.toHaveBeenCalledWith("local_files_execute", expect.anything());
	expect(setup.executeShell).not.toHaveBeenCalled();
	unmount();
});

test("a desktop command on a grant without the desktop capability is refused before the device is asked", async () => {
	setup.connections.set([
		{
			...desktop,
			id: "con_write",
			capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
			revision: 6,
		},
	]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: "con_write", revision: 6 }] : undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(
		command({
			connectionId: "con_write",
			capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
			revision: 6,
		}),
	);
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith("cmd_desktop", { ok: false, error: "permission_denied" }),
	);
	expect(setup.executeDesktop).not.toHaveBeenCalled();
	unmount();
});

test("a missing screen-recording permission reaches the server with which permission to ask for", async () => {
	setup.connections.set([desktop]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: desktop.id, revision: desktop.revision }] : undefined,
	);
	// The native command answers its own body so the permission passes through unchanged.
	setup.executeDesktop.mockResolvedValue({
		ok: false,
		error: "desktop_permission_required",
		permission: "screen_recording",
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command({ operation: "desktop_shot" }));
	await waitFor(() => expect(setup.submit).toHaveBeenCalledOnce());
	const [, result] = setup.submit.mock.calls[0] as unknown as [string, { ok: boolean; error?: string }];
	expect(result).toMatchObject({
		ok: false,
		error: "desktop_permission_required",
		permission: "screen_recording",
	});
	unmount();
});

test("stopping the round cancels a desktop command without touching the shell", async () => {
	setup.connections.set([desktop]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: desktop.id, revision: desktop.revision }] : undefined,
	);
	setup.executeDesktop.mockImplementation(() => new Promise(() => {}));
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command({ operation: "desktop_ax", args: { windowId: "w1" } }));
	await waitFor(() => expect(setup.executeDesktop).toHaveBeenCalledOnce());
	act(() =>
		setup.event({
			type: "connector.command.cancelled",
			eventId: "evt_cancel",
			at: new Date().toISOString(),
			commandId: "cmd_desktop",
		}),
	);
	// Desktop cancels go through `local_files_cancel` (the generic path), not `shell_cancel`.
	expect(setup.cancelShell).not.toHaveBeenCalled();
	unmount();
});

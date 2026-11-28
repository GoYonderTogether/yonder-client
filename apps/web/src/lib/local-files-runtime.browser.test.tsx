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
	setup.executeBrowser.mockReset();
	setup.cancelBrowser.mockClear();
	setup.executeShell.mockReset();
	setup.beginTrayWork.mockClear();
	setup.query.getQueryData.mockReset();
	setup.conversations.mockReset();
	setup.account.current = setup.context;
	setup.resetConnections();
	setup.status("open");
});

const browser = {
	id: "con_browser",
	deviceId: "dev_a",
	revision: 3,
	connectorId: "computer-control",
	scope: "device",
	capabilities: { fileTools: false, terminal: false, browser: true },
} as const;

function command(overrides: Partial<ConnectorCommand> = {}): ConnectorCommand {
	return {
		id: "cmd_browser",
		connectionId: browser.id,
		deviceId: browser.deviceId,
		connectorId: browser.connectorId,
		scope: browser.scope,
		capabilities: browser.capabilities,
		revision: browser.revision,
		operation: "browser_status",
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

test("a browser command runs on the device and its result goes back unchanged", async () => {
	setup.connections.set([browser]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: browser.id, revision: browser.revision }] : undefined,
	);
	setup.executeBrowser.mockResolvedValue({
		ok: true,
		result: { kind: "browser_status", installed: true, daemonRunning: true, connected: true, browsers: [], hint: "ok" },
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command());
	await waitFor(() => expect(setup.submit).toHaveBeenCalledOnce());
	const [id, result] = setup.submit.mock.calls[0] as unknown as [string, { ok: boolean; result: { kind: string } }];
	expect(id).toBe("cmd_browser");
	expect(result).toMatchObject({ ok: true, result: { kind: "browser_status" } });
	// The native call carries the command the server dispatched, with the expiry as a number.
	const [context, sent] = setup.executeBrowser.mock.calls[0] as [unknown, { operation: string; expiresAtMs: number }];
	expect(context).toEqual(setup.context);
	expect(sent.operation).toBe("browser_status");
	expect(typeof sent.expiresAtMs).toBe("number");
	expect(setup.invoke).not.toHaveBeenCalledWith("local_files_execute", expect.anything());
	unmount();
});

test("a browser command on a grant without browser control is refused before the device is asked", async () => {
	setup.connections.set([
		{ ...browser, id: "con_write", capabilities: { fileTools: true, terminal: false, browser: false }, revision: 4 },
	]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: "con_write", revision: 4 }] : undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(
		command({
			connectionId: "con_write",
			capabilities: { fileTools: true, terminal: false, browser: false },
			revision: 4,
		}),
	);
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith("cmd_browser", { ok: false, error: "permission_denied" }),
	);
	expect(setup.executeBrowser).not.toHaveBeenCalled();
	unmount();
});

test("the browser errors the device reports reach the server as themselves", async () => {
	setup.connections.set([browser]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: browser.id, revision: browser.revision }] : undefined,
	);
	setup.executeBrowser.mockRejectedValue(new Error("browser_not_installed"));
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command({ operation: "browser_navigate", args: { sessionId: "aa11", url: "https://x.test" } }));
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith("cmd_browser", { ok: false, error: "browser_not_installed" }),
	);
	unmount();
});

test("stopping the round marks the browser command, not a shell or file job", async () => {
	setup.connections.set([browser]);
	setup.invoke.mockImplementation(async (name: string) =>
		name === "local_files_ready" ? [{ id: browser.id, revision: browser.revision }] : undefined,
	);
	setup.executeBrowser.mockImplementation(() => new Promise(() => {}));
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	dispatch(command());
	await waitFor(() => expect(setup.executeBrowser).toHaveBeenCalledOnce());
	act(() =>
		setup.event({
			type: "connector.command.cancelled",
			eventId: "evt_cancel",
			at: new Date().toISOString(),
			commandId: "cmd_browser",
		}),
	);
	expect(setup.cancelBrowser).toHaveBeenCalledWith("cmd_browser");
	expect(setup.cancelShell).not.toHaveBeenCalled();
	unmount();
});

// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { grant, setup } from "./local-files-runtime.mock.ts";

import { LocalFilesRuntime } from "./local-files-runtime.tsx";

afterEach(() => {
	setup.fail.mockClear();
	setup.realtime.send.mockClear();
	setup.invoke.mockReset();
	setup.beginTrayWork.mockClear();
	setup.query.getQueryData.mockReset();
	setup.conversations.mockReset();
	setup.account.current = setup.context;
	setup.resetConnections();
	setup.status("open");
});

test("a dispatched grant is written locally and then reported ready over the existing socket", async () => {
	setup.invoke.mockImplementation(async (command: string) =>
		command === "local_files_ready" ? [{ id: "con_a", revision: 2, toolsVersion: 2 }] : undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenCalledWith({
			type: "connector.ready",
			connections: [{ id: "con_a", revision: 2, toolsVersion: 2 }],
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
			connections: [{ id: "con_a", revision: 2, toolsVersion: 2 }],
		}),
	);
	expect(setup.fail).not.toHaveBeenCalled();
	unmount();
});

test("a grant for a new connection is reported ready without waiting for the connection list", async () => {
	setup.invoke.mockImplementation(async (command: string) =>
		command === "local_files_ready" ? [{ id: "con_new", revision: 5, toolsVersion: 2 }] : undefined,
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
		if (command === "local_files_ready") return [{ id: "con_a", revision: 2, toolsVersion: 2 }];
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
			dispatchSeq: 3,
			grants: [grant()],
		}),
	);
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "permission_denied", 3));
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
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "operation_failed", undefined));
	unmount();
});

test("a connection list refresh during the first write still writes the second grant and reports both ready", async () => {
	const authorized: string[] = [];
	type Ready = { id: string; revision: number }[];
	setup.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
		if (command === "local_files_ready")
			return (args as { connections: Ready }).connections.map((item) => ({ ...item, toolsVersion: 2 }));
		if (command === "local_files_authorize") {
			const id = (args?.config as { id: string } | undefined)?.id ?? "";
			// `connectors.changed` arrives after a dispatch; its refetch lands before the next write.
			if (id === "con_a")
				await act(async () =>
					setup.connections.set([
						{ id: "con_a", deviceId: "dev_a", revision: 2 },
						{ id: "con_b", deviceId: "dev_a", revision: 7 },
					]),
				);
			authorized.push(id);
		}
		return undefined;
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	setup.realtime.send.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_refresh",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [
				grant(),
				grant({
					connectionId: "con_b",
					connectorId: "computer-control",
					revision: 7,
					capabilities: { fileTools: true },
				}),
			],
		}),
	);
	await waitFor(() => expect(authorized).toEqual(["con_a", "con_b"]));
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenCalledWith({
			type: "connector.ready",
			connections: [
				{ id: "con_a", revision: 2, toolsVersion: 2 },
				{ id: "con_b", revision: 7, toolsVersion: 2 },
			],
		}),
	);
	expect(setup.fail).not.toHaveBeenCalled();
	unmount();
});

test("both capability shapes reach the native layer exactly as the server dispatched them", async () => {
	type Ready = { id: string; revision: number }[];
	setup.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) =>
		command === "local_files_ready"
			? (args as { connections: Ready }).connections.map((item) => ({ ...item, toolsVersion: 2 }))
			: undefined,
	);
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	setup.invoke.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_caps",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [
				grant({ connectionId: "con_read", connectorId: "local-files", capabilities: { fileTools: false } }),
				grant({ connectionId: "con_write", connectorId: "computer-control", capabilities: { fileTools: true } }),
			],
		}),
	);
	await waitFor(() =>
		expect(
			setup.invoke.mock.calls.filter(([name]) => name === "local_files_authorize").map(([, args]) => args),
		).toEqual([
			{
				context: setup.context,
				config: {
					id: "con_read",
					connectorId: "local-files",
					scope: "device",
					capabilities: { fileTools: false },
					revision: 2,
				},
			},
			{
				context: setup.context,
				config: {
					id: "con_write",
					connectorId: "computer-control",
					scope: "device",
					capabilities: { fileTools: true },
					revision: 2,
				},
			},
		]),
	);
	expect(setup.fail).not.toHaveBeenCalled();
	unmount();
});

test("a readiness check that throws fails the request with its real code", async () => {
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") throw new Error("disconnected");
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	setup.fail.mockClear();
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_ready_fail",
			at: new Date().toISOString(),
			requestId: "request",
			dispatchSeq: 4,
			grants: [grant()],
		}),
	);
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "disconnected", 4));
	unmount();
});

test("a readiness check that throws an unknown code fails the request as operation_failed", async () => {
	setup.invoke.mockImplementation(async (command: string) => {
		if (command === "local_files_ready") throw new Error("grant file is locked");
	});
	const { unmount } = render(<LocalFilesRuntime />);
	await waitFor(() => expect(setup.realtime.send).toHaveBeenCalled());
	act(() =>
		setup.event({
			type: "connector.grant.request",
			eventId: "event_ready_unknown",
			at: new Date().toISOString(),
			requestId: "request",
			grants: [grant()],
		}),
	);
	await waitFor(() => expect(setup.fail).toHaveBeenCalledWith("request", "operation_failed", undefined));
	unmount();
});

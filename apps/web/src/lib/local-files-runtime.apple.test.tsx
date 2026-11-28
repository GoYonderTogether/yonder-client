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
		capabilities: { fileTools: false, terminal: false, desktop: false },
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
	expect(setup.cancelApple).toHaveBeenCalledWith(command.id);
	expect(setup.submit).not.toHaveBeenCalledWith(command.id, expect.anything());
	unmount();
});

test("uploads Apple audio under its command and only submits the server attachment", async () => {
	const apple = {
		id: "con_recording",
		deviceId: "dev_a",
		connectorId: "apple-voice-memos",
		scope: "device",
		capabilities: { fileTools: false, terminal: false, desktop: false },
		revision: 1,
	} as const;
	setup.connections.set([apple]);
	setup.invoke.mockResolvedValue(undefined);
	const audio = new File(["test"], "recording.m4a", { type: "audio/mp4" });
	const attachment = { id: "attachment-a", kind: "audio", name: "recording.m4a", mimeType: "audio/mp4", size: 4 };
	setup.readyApple.mockImplementation(async (_context, connections) => connections);
	setup.executeAppleFile.mockResolvedValueOnce(audio);
	setup.data.api.uploadConnectorAttachment.mockResolvedValueOnce(attachment);
	const { unmount } = render(<LocalFilesRuntime apple />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenLastCalledWith({
			type: "connector.ready",
			connections: [{ id: apple.id, revision: apple.revision }],
		}),
	);
	const command = {
		...apple,
		id: "cmd_recording",
		connectionId: apple.id,
		operation: "apple_voice_memos_read",
		path: "",
		args: { id: "recording-a" },
		expiresAt: new Date(Date.now() + 15000).toISOString(),
	} as const;
	act(() => setup.event({ type: "connector.command", eventId: command.id, at: new Date().toISOString(), command }));
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith(command.id, {
			ok: true,
			result: { kind: command.operation, id: command.args.id, attachment },
		}),
	);
	expect(setup.data.api.uploadConnectorAttachment).toHaveBeenCalledWith(command.id, audio, expect.any(AbortSignal));
	unmount();
});

test("a photo picture is encoded on the device, uploaded under its command, and only the receipt is reported", async () => {
	const apple = {
		id: "con_photos",
		deviceId: "dev_a",
		connectorId: "apple-photos",
		scope: "device",
		capabilities: { fileTools: false, terminal: false, desktop: false },
		revision: 2,
	} as const;
	setup.connections.set([apple]);
	setup.invoke.mockResolvedValue(undefined);
	const jpeg = new File(["jpeg"], "asset-a.jpg", { type: "image/jpeg" });
	const attachment = { id: "attachment-p", kind: "image", name: "asset-a.jpg", mimeType: "image/jpeg", size: 4 };
	setup.readyApple.mockImplementation(async (_context, connections) => connections);
	setup.executeAppleFile.mockResolvedValueOnce(jpeg);
	setup.data.api.uploadConnectorAttachment.mockResolvedValueOnce(attachment);
	const { unmount } = render(<LocalFilesRuntime apple />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenLastCalledWith({
			type: "connector.ready",
			connections: [{ id: apple.id, revision: apple.revision }],
		}),
	);
	const command = {
		...apple,
		id: "cmd_photo",
		connectionId: apple.id,
		operation: "apple_photos_image",
		path: "",
		args: { id: "asset-a", edge: 512 },
		expiresAt: new Date(Date.now() + 15000).toISOString(),
	} as const;
	act(() => setup.event({ type: "connector.command", eventId: command.id, at: new Date().toISOString(), command }));
	await waitFor(() =>
		expect(setup.submit).toHaveBeenCalledWith(command.id, {
			ok: true,
			result: { kind: "apple_photos_image", id: command.args.id, attachment },
		}),
	);
	// The edge the server named travels to the device untouched.
	expect(setup.executeAppleFile).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ args: command.args }),
	);
	unmount();
});

test("an iCloud-only photo reports its real code instead of a generic read failure", async () => {
	const apple = {
		id: "con_photos2",
		deviceId: "dev_a",
		connectorId: "apple-photos",
		scope: "device",
		capabilities: { fileTools: false, terminal: false, desktop: false },
		revision: 1,
	} as const;
	setup.connections.set([apple]);
	setup.readyApple.mockImplementation(async (_context, connections) => connections);
	setup.executeApple.mockRejectedValueOnce(new Error("icloud_only"));
	const { unmount } = render(<LocalFilesRuntime apple />);
	await waitFor(() =>
		expect(setup.realtime.send).toHaveBeenLastCalledWith({
			type: "connector.ready",
			connections: [{ id: apple.id, revision: apple.revision }],
		}),
	);
	const command = {
		...apple,
		id: "cmd_read_photo",
		connectionId: apple.id,
		operation: "apple_photos_read",
		path: "",
		args: { id: "asset-b" },
		expiresAt: new Date(Date.now() + 15000).toISOString(),
	} as const;
	act(() => setup.event({ type: "connector.command", eventId: command.id, at: new Date().toISOString(), command }));
	await waitFor(() => expect(setup.submit).toHaveBeenCalledWith(command.id, { ok: false, error: "icloud_only" }));
	unmount();
});

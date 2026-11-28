import { createHash } from "node:crypto";
import type { ConnectorInstance } from "@yonder/protocol";
import { beforeEach, expect, test, vi } from "vitest";

const { invokeLocalFiles } = vi.hoisted(() => ({ invokeLocalFiles: vi.fn() }));
vi.mock("./local-files.ts", () => ({ invokeLocalFiles }));

import { executeLocalFilePreview, prepareLocalFilePreview } from "./local-file-preview.ts";

const context = { ownerId: "mem_test", deviceId: "dev_test", sessionId: "ses_test" };
const command = {
	id: "cmd_test",
	connectionId: "con_test",
	deviceId: context.deviceId,
	connectorId: "local-files",
	scope: "device",
	capabilities: { fileTools: false, terminal: false, desktop: false, browser: false },
	revision: 1,
	operation: "file_preview",
	path: "~/Documents/文件.md",
	expiresAt: "2026-11-28T00:00:00.000Z",
	expiresAtMs: 1795824000000,
} as const;
const source: ConnectorInstance = {
	id: command.connectionId,
	deviceId: context.deviceId,
	connectorId: command.connectorId,
	scope: command.scope,
	capabilities: command.capabilities,
	revision: command.revision,
	name: "文件",
	deviceName: "测试 Mac",
	createdAt: "2026-11-28T00:00:00.000Z",
	currentDevice: true,
	status: "offline",
};

beforeEach(() => {
	invokeLocalFiles.mockReset();
});

test("same-device reading initializes the existing grant and preserves every authorized local connector", async () => {
	const control: ConnectorInstance = {
		...source,
		id: "con_control",
		connectorId: "computer-control",
		capabilities: { fileTools: true, terminal: false, desktop: false, browser: false },
	};
	const remote = { ...source, id: "con_remote", deviceId: "dev_other", currentDevice: false };
	const grantList = [
		{ id: source.id, revision: 1 },
		{ id: control.id, revision: 1 },
	];
	invokeLocalFiles.mockResolvedValueOnce(undefined).mockResolvedValueOnce(grantList);
	await prepareLocalFilePreview(context, source, [source, control, remote], new AbortController().signal);
	expect(invokeLocalFiles.mock.calls).toEqual([
		["local_files_activate", { context }],
		["local_files_ready", { context, connections: grantList }],
	]);
});

test("same-device initialization rejects expired revisions and stops if the reader closes", async () => {
	await expect(
		prepareLocalFilePreview(context, source, [{ ...source, revision: 2 }], new AbortController().signal),
	).rejects.toThrow("permission_denied");
	expect(invokeLocalFiles).not.toHaveBeenCalled();
	const controller = new AbortController();
	invokeLocalFiles.mockImplementationOnce(async () => controller.abort());
	await expect(prepareLocalFilePreview(context, source, [source], controller.signal)).rejects.toThrow("aborted");
	expect(invokeLocalFiles.mock.calls).toEqual([["local_files_activate", { context }]]);
});

test.each(["fetch", "postMessage"])("the %s native IPC transport preserves the original bytes", async (transport) => {
	const original = Uint8Array.of(0, 128, 255, 10);
	const sha256 = createHash("sha256").update(original).digest("hex");
	const header = new TextEncoder().encode(
		JSON.stringify({ kind: "file", name: "文件.md", mimeType: "text/markdown", sha256 }),
	);
	const packet = new Uint8Array(4 + header.length + original.length);
	new DataView(packet.buffer).setUint32(0, header.length);
	packet.set(header, 4);
	packet.set(original, 4 + header.length);
	invokeLocalFiles.mockResolvedValueOnce(transport === "fetch" ? packet.buffer : Array.from(packet));
	const result = await executeLocalFilePreview(context, command);
	expect(result.kind).toBe("file");
	if (result.kind !== "file") throw new Error("Expected original file");
	expect(result.name).toBe("文件.md");
	expect(result.sha256).toBe(sha256);
	expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(original);
});

test("the fallback rejects invalid bytes and oversized packets before converting them", async () => {
	for (const payload of [
		[0, 0, 0, 1, 256],
		[0, 0, 0, 1, -1],
		[0, 0, 0, 1, 1.2],
		[0, 0, 0, 1, "0"],
	]) {
		invokeLocalFiles.mockResolvedValueOnce(payload);
		await expect(executeLocalFilePreview(context, command)).rejects.toThrow("read_failed");
	}
	invokeLocalFiles.mockResolvedValueOnce(Array(21 * 1024 * 1024));
	await expect(executeLocalFilePreview(context, command)).rejects.toThrow("too_large");
	invokeLocalFiles.mockResolvedValueOnce({ ok: false, error: "permission_denied" });
	await expect(executeLocalFilePreview(context, command)).rejects.toThrow("permission_denied");
});

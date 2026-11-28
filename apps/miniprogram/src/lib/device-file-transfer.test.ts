import { createHash } from "node:crypto";
import { type ApiClient, ApiError } from "@yonder/api-client";
import type { ConnectorInstance } from "@yonder/protocol";
import { beforeEach, expect, test, vi } from "vitest";

const f = vi.hoisted(() => ({
	storage: new Map<string, unknown>(),
	files: new Map<string, ArrayBuffer>(),
	download: vi.fn(),
	steps: [] as string[],
	persistence: true,
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		env: { USER_DATA_PATH: "/private" },
		getStorageSync: (key: string) => f.storage.get(key),
		setStorageSync: (key: string, value: unknown) => {
			if (key.startsWith("yonder.mini.images") && !f.persistence) throw new Error("Storage full");
			f.storage.set(key, value);
		},
		removeStorageSync: (key: string) => f.storage.delete(key),
		getStorageInfoSync: () => ({ keys: [...f.storage.keys()] }),
		downloadFile: f.download,
		getFileSystemManager: () => ({
			readFileSync: (path: string) => f.files.get(path),
			accessSync: (path: string) => {
				if (!f.files.has(path)) throw new Error("Not found");
			},
			mkdirSync: () => {},
			statSync: (path: string) => ({ size: f.files.get(path)?.byteLength }),
			unlink: ({ filePath }: { filePath: string }) => f.files.delete(filePath),
			saveFileSync: (from: string, to: string) => {
				const bytes = f.files.get(from);
				if (!bytes) throw new Error("Not found");
				f.files.set(to, bytes);
				f.steps.push("save");
				return to;
			},
		}),
	},
}));

import { clearDeviceFileTransfers, readDeviceFile } from "./device-file-transfer";

const path = "~/Documents/文件.txt";
const source: ConnectorInstance = {
	id: "con_fixture",
	connectorId: "local-files",
	deviceId: "dev_fixture",
	deviceName: "Mac",
	currentDevice: false,
	scope: "device",
	capabilities: { fileTools: false, terminal: false, desktop: false, browser: false },
	revision: 1,
	status: "online",
	name: "文件",
	createdAt: "2026-11-28T00:00:00Z",
};
const baseUrl = "https://yonder.zethai.cn";
const owner = "mem_fixture";
const request = vi.fn();
const scope = { client: { request } as unknown as ApiClient, baseUrl, owner, source, path, current: () => {} };
const hash = (content: string) => createHash("sha256").update(content).digest("hex");
const response = (value: unknown) => ({ json: async () => value });
const page = (content: string, sha256: string, offset: number, nextOffset: number | null) =>
	response({
		kind: "text_page",
		name: "文件.txt",
		mimeType: "text/plain",
		sha256,
		offset,
		nextOffset,
		content,
		pageSha256: hash(content),
	});

beforeEach(() => {
	clearDeviceFileTransfers(owner, baseUrl);
	f.persistence = true;
	f.storage.clear();
	f.files.clear();
	f.steps.length = 0;
	f.download.mockReset();
	request.mockReset();
});

test("verified pages survive reopening and are isolated by source revision", async () => {
	const first = "\uFEFF点石\r\n";
	const second = "第二页";
	const sha256 = hash(first + second);
	const offset = Buffer.byteLength(first);
	request
		.mockResolvedValueOnce(page(first, sha256, 0, offset))
		.mockResolvedValueOnce(page(second, sha256, offset, null));
	await expect(readDeviceFile(scope)).resolves.toMatchObject({ kind: "text_page", content: first, nextOffset: offset });
	const next = { ...scope, position: { offset, expectedSha256: sha256 } };
	await expect(readDeviceFile(next)).resolves.toMatchObject({ kind: "text_page", content: second });
	await expect(readDeviceFile(next)).resolves.toMatchObject({ kind: "text_page", content: second });
	expect(request).toHaveBeenCalledTimes(2);
	request.mockResolvedValueOnce(response({ kind: "unchanged", sha256 }));
	await expect(readDeviceFile(scope)).resolves.toMatchObject({ kind: "text_page", content: first });
	expect(request.mock.calls[2]?.[1].body.knownSha256).toBe(sha256);
	request.mockResolvedValueOnce(page("新的文件", hash("新的文件"), 0, null));
	await readDeviceFile({ ...scope, source: { ...source, revision: 2 } });
	expect(request.mock.calls[3]?.[1].body.knownSha256).toBeUndefined();
});

test("the exact legacy unsupported-delivery error falls back once", async () => {
	request
		.mockRejectedValueOnce(new ApiError({ code: "invalid_request", status: 400, message: "invalid file preview" }))
		.mockResolvedValueOnce(response({ kind: "directory", entries: [], truncated: false }));
	await expect(readDeviceFile(scope)).resolves.toMatchObject({ kind: "directory" });
	expect(request.mock.calls[1]?.[1].body).toEqual({ path });
	request.mockRejectedValueOnce(
		new ApiError({
			code: "invalid_request",
			status: 400,
			message: "invalid file preview",
			details: { reason: "path_invalid" },
		}),
	);
	await expect(readDeviceFile(scope)).rejects.toMatchObject({ status: 400 });
	expect(request).toHaveBeenCalledTimes(3);
});

test.each(["saved", "full", "corrupt"])(
	"signed files ACK only after verification and file persistence (%s)",
	async (mode) => {
		f.persistence = mode !== "full";
		const bytes = new TextEncoder().encode(mode === "corrupt" ? "NO" : "OK").buffer;
		f.files.set("/temporary", bytes);
		f.download.mockResolvedValue({ statusCode: 200, tempFilePath: "/temporary" });
		request.mockImplementation(async (endpoint: string) => {
			if (endpoint.endsWith("/ack")) {
				f.steps.push("ack");
				return { ok: true };
			}
			return response({
				kind: "download",
				name: "原件.pdf",
				mimeType: "application/pdf",
				size: 2,
				sha256: hash("OK"),
				url: "https://files.example.test/signed",
				receipt: "att_x",
			});
		});
		if (mode === "corrupt") await expect(readDeviceFile(scope)).rejects.toThrow("file checksum failed");
		else await expect(readDeviceFile(scope)).resolves.toMatchObject({ name: "原件.pdf" });
		expect(f.steps).toEqual(mode === "saved" ? ["save", "ack"] : mode === "full" ? ["save"] : []);
	},
);

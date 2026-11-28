// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	choose: vi.fn(),
	chooseFile: vi.fn(),
	header: vi.fn(),
	stat: vi.fn(),
	compress: vi.fn(),
	next: 0,
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		chooseMedia: mock.choose,
		chooseMessageFile: mock.chooseFile,
		getFileSystemManager: () => ({ readFileSync: mock.header, statSync: mock.stat }),
		getImageInfo: async () => ({ width: 3000, height: 4000 }),
		compressImage: mock.compress,
	},
}));
vi.mock("../../lib/i18n", () => ({ t: (zh: string) => zh }));
vi.mock("../../lib/runtime", () => ({ newNonce: () => `n${++mock.next}` }));

import { useChatUploads } from "./use-uploads";

let state: ReturnType<typeof useChatUploads>;
function Probe({ owner }: { owner: string }) {
	state = useChatUploads(owner, "conversation");
	return null;
}
const file = (n: number, size = 1) => ({ tempFilePath: `/tmp/${n}`, size });
test("limits batches, removes selected files and clears selections on an account change", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.choose
		.mockResolvedValueOnce({ tempFiles: Array.from({ length: 9 }, (_, n) => file(n)) })
		.mockResolvedValueOnce({ tempFiles: [file(10)] });
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { owner: "a" })));
	await act(async () => {
		await state.addImages();
	});
	expect(mock.choose.mock.calls[0][0].count).toBe(9);
	expect(state.uploads).toHaveLength(9);
	await act(async () => {
		await state.addImages();
	});
	expect(mock.choose.mock.calls[1][0].count).toBe(1);
	expect(state.uploads).toHaveLength(10);
	const removed = state.uploads[0].key;
	await act(async () => state.removeUpload(removed));
	expect(state.uploads).toHaveLength(9);
	await act(async () => root.render(createElement(Probe, { owner: "b" })));
	expect(state.uploads).toEqual([]);
	await act(async () => root.unmount());
});

test("compresses only oversized still photos and prepares only files that fit", async () => {
	mock.choose.mockReset().mockResolvedValueOnce({
		tempFiles: [file(1, 21 * 1024 * 1024), file(2), file(3, 21 * 1024 * 1024), file(4, 21 * 1024 * 1024)],
	});
	mock.header
		.mockReset()
		.mockReturnValueOnce(new Uint8Array([0xff, 0xd8, 0xff]).buffer)
		.mockReturnValueOnce(new Uint8Array([0xff, 0xd8, 0xff]).buffer)
		.mockReturnValueOnce(new TextEncoder().encode("GIF89a").buffer);
	mock.compress
		.mockReset()
		.mockResolvedValueOnce({ tempFilePath: "/tmp/fit.jpg" })
		.mockResolvedValueOnce({ tempFilePath: "/tmp/still-big.jpg" });
	mock.stat
		.mockReset()
		.mockReturnValueOnce({ size: 1000 })
		.mockReturnValueOnce({ size: 20 * 1024 * 1024 + 1 });
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(createElement(Probe, { owner: "a" })));
	await act(async () => state.addImages());
	expect(mock.compress.mock.calls.map(([option]) => option)).toEqual([
		{ src: "/tmp/1", quality: 75, compressedHeight: 2048 },
		{ src: "/tmp/3", quality: 75, compressedHeight: 2048 },
	]);
	expect(state.uploads.map(({ path }) => path)).toEqual(["/tmp/fit.jpg", "/tmp/2"]);
	expect(state.uploads.map(({ size }) => size)).toEqual([1000, 1]);
	expect(state.error).toContain("20 MiB");

	mock.compress.mockClear();
	mock.chooseFile.mockResolvedValueOnce({
		tempFiles: [{ path: "/tmp/document.png", name: "document.png", size: 21 * 1024 * 1024 }],
	});
	await act(async () => state.addFiles());
	expect(mock.compress).not.toHaveBeenCalled();
	expect(state.uploads).toHaveLength(2);
	await act(async () => root.unmount());
});

test("does not queue a previously opened image when the owner changes during local compression", async () => {
	mock.choose.mockReset().mockResolvedValueOnce({ tempFiles: [file(1, 21 * 1024 * 1024)] });
	mock.header.mockReset().mockReturnValue(new Uint8Array([0xff, 0xd8, 0xff]).buffer);
	mock.stat.mockReset().mockReturnValue({ size: 1000 });
	let finish: (value: { tempFilePath: string }) => void = () => {};
	mock.compress.mockReset().mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(createElement(Probe, { owner: "a" })));
	let pending: Promise<void> | undefined;
	await act(async () => {
		pending = state.addImages();
	});
	expect(mock.compress).toHaveBeenCalledOnce();
	await act(async () => root.render(createElement(Probe, { owner: "b" })));
	await act(async () => {
		finish({ tempFilePath: "/tmp/old.jpg" });
		await pending;
	});
	expect(state.uploads).toEqual([]);
	await act(async () => root.unmount());
});

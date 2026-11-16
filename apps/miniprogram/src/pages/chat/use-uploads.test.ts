// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({ choose: vi.fn(), upload: vi.fn(), next: 0 }));
vi.mock("@tarojs/taro", () => ({ default: { chooseMedia: mock.choose } }));
vi.mock("../../lib/i18n", () => ({ t: (zh: string) => zh }));
vi.mock("../../lib/runtime", () => ({ newNonce: () => `n${++mock.next}`, uploadAttachment: mock.upload }));

import { useChatUploads } from "./use-uploads";

let state: ReturnType<typeof useChatUploads>;
function Probe({ owner }: { owner: string }) {
	state = useChatUploads(owner, "conversation");
	return null;
}
const file = (n: number, size = 1) => ({ tempFilePath: `/tmp/${n}`, size });
test("limits batches, aborts removal and ignores an old owner's upload", async () => {
	vi.stubGlobal("AbortController", undefined);
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.choose
		.mockResolvedValueOnce({ tempFiles: Array.from({ length: 9 }, (_, n) => file(n)) })
		.mockResolvedValueOnce({ tempFiles: [file(10)] });
	const pending: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
	mock.upload.mockImplementation(
		(_path: string, _key: string, signal: AbortSignal) => new Promise((resolve) => pending.push({ signal, resolve })),
	);
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
	expect(pending[0].signal.aborted).toBe(true);
	await act(async () => root.render(createElement(Probe, { owner: "b" })));
	expect(pending[1].signal.aborted).toBe(true);
	await act(async () => {
		pending[1].resolve({ id: "old" });
		await Promise.resolve();
	});
	expect(state.uploads).toEqual([]);
	await act(async () => root.unmount());
	vi.unstubAllGlobals();
});

test("rejects oversized files and retries an upload with the same identity", async () => {
	mock.choose.mockReset();
	mock.upload.mockReset();
	mock.choose.mockResolvedValueOnce({ tempFiles: [file(1, 20 * 1024 * 1024 + 1), file(2)] });
	mock.upload.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "uploaded" });
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(Probe, { owner: "a" })));
	await act(async () => {
		await state.addImages();
	});
	await act(async () => {
		await Promise.resolve();
	});
	expect(state.uploads).toHaveLength(1);
	expect(state.error).toContain("20 MiB");
	expect(state.uploads[0].error).toBeTruthy();
	const key = state.uploads[0].key;
	await act(async () => {
		state.retryUpload(key);
		await Promise.resolve();
	});
	expect(mock.upload.mock.calls.map((call) => call[1])).toEqual([key, key]);
	expect(state.uploads[0].attachment).toEqual({ id: "uploaded" });
	await act(async () => root.unmount());
});

// @vitest-environment jsdom
// Send failures, and cancelling an upload in flight; the shared mocks mirror use-chat-draft.test.tsx.
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useChatDraft } from "./use-chat-draft.ts";

const local = vi.hoisted(() => ({
	values: new Map<string, unknown>(),
	generation: 0,
	upload: vi.fn(),
	transcribe: vi.fn(),
	prepare: vi.fn(),
	failWrite: vi.fn((_key: string) => false),
	waitWrite: vi.fn<() => Promise<void> | undefined>(),
}));
vi.mock("../lib/prepare-image.ts", () => ({
	isImageFile: (_name: string, mime: string) => mime.startsWith("image/"),
	prepareImage: local.prepare,
}));
vi.mock("@yonder/ui-data", async () => ({
	// The real error class, so a refusal the hook recognises is the same one the API client throws.
	ApiError: (await import("@yonder/api-client")).ApiError,
	useApi: () => ({ uploadAttachment: local.upload, transcribeAudio: local.transcribe }),
	attachmentCacheKey: (owner: string, id: string) => `blob:${owner}:${id}`,
	chatCacheGeneration: () => local.generation,
	readChatCache: async (key: string) => local.values.get(key),
	writeChatCache: async (key: string, value: unknown, generation = local.generation) => {
		if (local.failWrite(key)) throw new Error("quota_exceeded");
		const pending = local.waitWrite();
		if (pending) await pending;
		if (generation === local.generation) local.values.set(key, value);
	},
	updateChatCache: async (key: string, update: (value: unknown) => unknown, generation: number) => {
		if (generation === local.generation) local.values.set(key, update(local.values.get(key)));
	},
	removeChatCache: async (key: string) => {
		local.values.delete(key);
	},
}));
beforeEach(() => {
	local.values.clear();
	local.generation = 0;
	local.failWrite.mockReset().mockReturnValue(false);
	local.waitWrite.mockReset();
	local.prepare.mockReset().mockResolvedValue(undefined);
	local.transcribe.mockReset();
	local.upload
		.mockReset()
		.mockResolvedValue({ id: "att_uploaded", kind: "file", name: "notes.txt", mimeType: "text/plain", size: 4 });
});

test("a refused send keeps the draft and shows the server's own reason instead of the generic line", async () => {
	const { ApiError } = await import("@yonder/api-client");
	const cases = [
		["visit_limit", "errors.visit_limit"],
		["visit_denied", "errors.visit_denied"],
		["visit_cap", "errors.visit_cap"],
	] as const;
	for (const [code, key] of cases) {
		local.values.clear();
		const result = renderHook(() => useChatDraft("alice", `refused-${code}`));
		await waitFor(() => expect(result.result.current.loaded).toBe(true));
		act(() => result.result.current.setText(`blocked by ${code}`));
		const send = vi.fn().mockRejectedValue(new ApiError({ code, status: 409, message: code }));
		await act(() => result.result.current.submit(send));
		expect(result.result.current.error).toBe(key);
		expect(result.result.current.text).toBe(`blocked by ${code}`);
		result.unmount();
	}
});

test("an ordinary failure and a plain network error keep the generic preserved-draft line", async () => {
	const result = renderHook(() => useChatDraft("alice", "generic"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => result.result.current.setText("still here"));
	await act(() => result.result.current.submit(vi.fn().mockRejectedValue(new Error("network"))));
	expect(result.result.current.error).toBe("chat.sendPreserved");
	expect(result.result.current.text).toBe("still here");
});

test("cancelling an in-flight upload aborts it, restores the draft and keeps the file ready", async () => {
	const result = renderHook(() => useChatDraft("alice", "cancel"));
	await waitFor(() => expect(result.result.current.loaded).toBe(true));
	act(() => {
		result.result.current.setText("slow upload");
		result.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	let reject!: (error: unknown) => void;
	let signal!: AbortSignal | undefined;
	local.upload.mockImplementation(
		(_file: File, _nonce: string, next?: AbortSignal) =>
			new Promise((_resolve, fail) => {
				signal = next;
				reject = fail;
			}),
	);
	const send = vi.fn();
	let pending!: Promise<unknown>;
	act(() => {
		pending = result.result.current.submit(send);
	});
	await waitFor(() => expect(local.upload).toHaveBeenCalledOnce());
	expect(result.result.current.sending).toBe(true);
	expect(signal).toBeInstanceOf(AbortSignal);
	act(() => result.result.current.cancelSend());
	expect(signal?.aborted).toBe(true);
	await act(async () => {
		const abort = new Error("aborted");
		abort.name = "AbortError";
		reject(abort);
		await pending;
	});
	expect(send).not.toHaveBeenCalled();
	expect(result.result.current.sending).toBe(false);
	expect(result.result.current.text).toBe("slow upload");
	expect(result.result.current.files[0]?.status).toBe("ready");
	expect(result.result.current.error).toBe("");
	local.upload.mockResolvedValue({
		id: "att_uploaded",
		kind: "file",
		name: "notes.txt",
		mimeType: "text/plain",
		size: 4,
	});
	await act(() => result.result.current.submit(send));
	expect(send).toHaveBeenCalledOnce();
});

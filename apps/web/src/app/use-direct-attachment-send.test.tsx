// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useChatDraft } from "./use-chat-draft.ts";
import { useDirectAttachmentSend } from "./use-direct-attachment-send.ts";

const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useApi: () => ({}),
	readChatCache: async (key: string) => cache.get(key),
	writeChatCache: async (key: string, value: unknown) => cache.set(key, value),
	updateChatCache: async (key: string, update: (value: unknown) => unknown) => {
		const value = update(cache.get(key));
		if (value === undefined) cache.delete(key);
		else cache.set(key, value);
		return value;
	},
}));

const uploadKey = "direct-attachment-upload:alice:one";
const photo = new File(["raw image"], "photo.png", { type: "image/png" });
const document = new File(["notes"], "notes.txt", { type: "text/plain" });
beforeEach(() => cache.clear());

function chat(send = vi.fn()) {
	return renderHook(
		({ conversation }) => ({
			draft: useChatDraft("alice", conversation),
			direct: useDirectAttachmentSend({ owner: "alice", conversation, send, knownNonce: () => false }),
		}),
		{ initialProps: { conversation: "one" } },
	);
}

test("a failed local handoff restores and retries the same attachment batch without changing the composer draft", async () => {
	const send = vi.fn().mockResolvedValue({}).mockRejectedValueOnce(new Error("storage full"));
	const first = chat(send);
	await waitFor(() => expect(first.result.current.draft.loaded && first.result.current.direct.ready).toBe(true));
	act(() => {
		first.result.current.draft.setText("still being edited");
		first.result.current.draft.addFiles([document]);
		first.result.current.direct.send([photo], false);
		first.result.current.direct.send([photo], false);
	});
	await waitFor(() => expect(first.result.current.direct.failed).toBe(true));
	expect(send).toHaveBeenCalledOnce();
	expect(cache.get(uploadKey)).toMatchObject({ files: [{ blob: photo }], nonce: expect.any(String) });
	const firstRequest = send.mock.calls[0]?.[0];
	first.unmount();

	const restored = chat(send);
	await waitFor(() => expect(restored.result.current.direct.failed).toBe(true));
	act(() => restored.result.current.direct.retry());
	await waitFor(() => expect(restored.result.current.direct.failed).toBe(false));
	expect(send).toHaveBeenLastCalledWith(firstRequest);
	expect(cache.has(uploadKey)).toBe(false);
	expect(restored.result.current.draft.text).toBe("still being edited");
	expect(restored.result.current.draft.files).toMatchObject([{ name: document.name }]);
});

test("a direct send hands off the original Blob to its conversation even if the user opens another chat", async () => {
	let saved: (() => void) | undefined;
	const send = vi.fn().mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				saved = resolve;
			}),
	);
	const { result, rerender } = chat(send);
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	const oldSend = result.current.direct.send;
	act(() => oldSend([photo], true));
	expect(send).toHaveBeenCalledWith({
		type: "text",
		body: "",
		clientNonce: expect.any(String),
		files: [expect.objectContaining({ name: photo.name, blob: photo, optimize: false })],
	});
	rerender({ conversation: "two" });
	act(() => saved?.());
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	act(() => oldSend([photo], true));
	expect(send).toHaveBeenCalledOnce();
	expect(result.current.direct.failed).toBe(false);
});

test("oversized compressible images can be queued; oversized documents and original images cannot", async () => {
	const bytes = new Uint8Array(20 * 1024 * 1024 + 1);
	const large = new File([bytes], "large.png", { type: "image/png" });
	const send = vi.fn().mockResolvedValue(undefined);
	const { result } = chat(send);
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	act(() => result.current.direct.send([new File([bytes], "notes.txt", { type: "text/plain" })], false));
	expect(result.current.direct.error).toBe("chat.fileTooLarge");
	act(() => result.current.direct.send([large], true));
	expect(result.current.direct.error).toBe("chat.fileTooLarge");
	expect(send).not.toHaveBeenCalled();

	act(() => result.current.direct.send([large], false));
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ files: [expect.objectContaining({ blob: large, optimize: true })] }),
	);
});

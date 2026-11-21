// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useChatDraft } from "./use-chat-draft.ts";
import { useDirectAttachmentSend } from "./use-direct-attachment-send.ts";

const local = vi.hoisted(() => ({ cache: new Map<string, unknown>(), upload: vi.fn(), prepareImage: vi.fn() }));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useApi: () => ({ uploadAttachment: local.upload }),
	readChatCache: async (key: string) => local.cache.get(key),
	writeChatCache: async (key: string, value: unknown) => local.cache.set(key, value),
	updateChatCache: async (key: string, update: (value: unknown) => unknown) => {
		const value = update(local.cache.get(key));
		if (value === undefined) local.cache.delete(key);
		else local.cache.set(key, value);
		return value;
	},
	removeChatCache: async (key: string) => local.cache.delete(key),
}));
vi.mock("../lib/prepare-image.ts", async (original) => ({
	...(await original<typeof import("../lib/prepare-image.ts")>()),
	prepareImage: local.prepareImage,
}));

const uploadKey = "direct-attachment-upload:alice:one";
const draftKey = "draft:alice:one";
const photo = new File(["raw image"], "photo.png", { type: "image/png" });
const document = new File(["notes"], "notes.txt", { type: "text/plain" });

beforeEach(() => {
	local.cache.clear();
	local.prepareImage
		.mockReset()
		.mockResolvedValue({ blob: new Blob(["optimized"]), name: "photo.jpg", mimeType: "image/jpeg" });
	local.upload.mockReset().mockImplementation(async (file: File, nonce: string) => ({
		id: `attachment-${nonce}`,
		name: file.name,
		mimeType: file.type,
		size: file.size,
		kind: "file",
	}));
});

function chat(send = vi.fn(), knownNonce = () => false) {
	return renderHook(
		({ conversation }) => {
			const draft = useChatDraft("alice", conversation);
			const direct = useDirectAttachmentSend({
				owner: "alice",
				conversation,
				uploadFile: draft.uploadDirectFile,
				send,
				knownNonce,
			});
			return { draft, direct };
		},
		{ initialProps: { conversation: "one" } },
	);
}

test("a failed upload restores and retries the same independent attachment batch, preserving the prior draft", async () => {
	const send = vi.fn().mockResolvedValue({});
	const first = chat(send);
	await waitFor(() => expect(first.result.current.draft.loaded && first.result.current.direct.ready).toBe(true));
	act(() => {
		first.result.current.draft.setText("still being edited");
		first.result.current.draft.addFiles([document]);
	});
	const previousDraft = first.result.current.draft.files;
	local.upload.mockRejectedValueOnce(new Error("offline"));
	act(() => {
		first.result.current.direct.send([photo], false);
		first.result.current.direct.send([photo], false);
	});
	await waitFor(() => expect(first.result.current.direct.failed).toBe(true));
	expect(local.upload).toHaveBeenCalledTimes(1);
	expect(send).not.toHaveBeenCalled();
	expect(first.result.current.draft.files).toEqual(previousDraft);
	expect(local.cache.get(uploadKey)).toMatchObject({ files: [{ blob: photo }], nonce: expect.any(String) });
	const previousNonce = (local.cache.get(uploadKey) as { nonce: string }).nonce;
	first.unmount();

	const restored = chat(send);
	await waitFor(() => expect(restored.result.current.direct.failed).toBe(true));
	act(() => restored.result.current.direct.retry());
	await waitFor(() => expect(restored.result.current.direct.sending).toBe(false));
	const fileNonce = local.upload.mock.calls[0]?.[1];
	expect(local.upload.mock.calls[1]?.[1]).toBe(fileNonce);
	expect(send).toHaveBeenCalledExactlyOnceWith({
		type: "text",
		body: "",
		clientNonce: previousNonce,
		attachmentIds: [`attachment-${fileNonce}`],
		attachments: [expect.objectContaining({ name: "photo.jpg", mimeType: "image/jpeg" })],
	});
	expect(local.cache.has(uploadKey)).toBe(false);
	expect(local.cache.get(draftKey)).toMatchObject({ text: "still being edited", files: previousDraft });
	expect(restored.result.current.draft.text).toBe("still being edited");
	expect(restored.result.current.draft.files).toEqual(previousDraft);
});

test("after uploads finish the message outbox alone owns a failed POST; original mode uses the source bytes", async () => {
	const send = vi.fn().mockRejectedValue(new Error("POST failed"));
	const { result } = chat(send);
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	act(() => result.current.direct.send([photo], true));
	await waitFor(() => expect(result.current.direct.sending).toBe(false));
	expect(local.prepareImage).not.toHaveBeenCalled();
	expect(local.upload.mock.calls[0]?.[0]).toMatchObject({ name: photo.name, type: photo.type, size: photo.size });
	expect(send).toHaveBeenCalledOnce();
	expect(result.current.direct.failed).toBe(false);
	expect(local.cache.has(uploadKey)).toBe(false);
	act(() => result.current.direct.retry());
	expect(send).toHaveBeenCalledOnce();
});

test("changing conversations aborts an upload before posting and leaves the retry in the original room", async () => {
	const send = vi.fn();
	const { result, rerender } = chat(send);
	local.upload.mockImplementationOnce(
		(_file, _nonce, signal: AbortSignal) =>
			new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(signal.reason));
			}),
	);
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	const oldSend = result.current.direct.send;
	act(() => oldSend([document], true));
	await waitFor(() => expect(local.upload).toHaveBeenCalledOnce());
	rerender({ conversation: "two" });
	await waitFor(() => expect(result.current.direct.ready).toBe(true));
	expect(local.upload.mock.calls[0]?.[2]).toHaveProperty("aborted", true);
	expect(result.current.direct.failed).toBe(false);
	act(() => oldSend([document], true));
	expect(local.upload).toHaveBeenCalledOnce();
	expect(send).not.toHaveBeenCalled();
	expect(local.cache.has(uploadKey)).toBe(true);
	rerender({ conversation: "one" });
	await waitFor(() => expect(result.current.direct.failed).toBe(true));
});

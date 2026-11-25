// @vitest-environment jsdom
// The immediate clear on send, and the restore a failed send makes.
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useChatDraft } from "./use-chat-draft.ts";

const local = vi.hoisted(() => ({
	values: new Map<string, unknown>(),
	generation: 0,
	upload: vi.fn(),
	transcribe: vi.fn(),
	prepare: vi.fn(),
}));
vi.mock("../lib/prepare-image.ts", () => ({
	isImageFile: (_name: string, mime: string) => mime.startsWith("image/"),
	prepareImage: local.prepare,
}));
vi.mock("@yonder/ui-data", async () => ({
	ApiError: (await import("@yonder/api-client")).ApiError,
	useApi: () => ({ uploadAttachment: local.upload, transcribeAudio: local.transcribe }),
	attachmentCacheKey: (owner: string, id: string) => `blob:${owner}:${id}`,
	chatCacheGeneration: () => local.generation,
	readChatCache: async (key: string) => local.values.get(key),
	writeChatCache: async (key: string, value: unknown, generation = local.generation) => {
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
	local.prepare.mockReset().mockResolvedValue(undefined);
	local.transcribe.mockReset();
	local.upload
		.mockReset()
		.mockResolvedValue({ id: "att_uploaded", kind: "file", name: "notes.txt", mimeType: "text/plain", size: 4 });
});

test("a successful send empties the field, its files and its bindings before the server answers", async () => {
	const hook = renderHook(() => useChatDraft("alice", "instant"));
	await waitFor(() => expect(hook.result.current.loaded).toBe(true));
	act(() => {
		hook.result.current.setText("/pdf hello");
		hook.result.current.acceptCompletion("/pdf hello ", { id: "s1", kind: "skill", marker: "/pdf", start: 0, end: 4 });
		hook.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	expect(hook.result.current.skillIds).toEqual(["s1"]);
	let finish!: () => void;
	const send = vi.fn(
		(_input: unknown) =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	let submission!: Promise<unknown>;
	act(() => {
		submission = hook.result.current.submit(send);
	});
	// The attachment upload is a resolved promise; let the send reach the request.
	await waitFor(() => expect(send).toHaveBeenCalledOnce());
	// The bubble is on screen through the optimistic insert by now, and the field is already empty.
	expect(hook.result.current.text).toBe("");
	expect(hook.result.current.files).toEqual([]);
	expect(hook.result.current.skillIds).toEqual([]);
	expect(send.mock.calls[0]?.[0]).toMatchObject({ body: "/pdf hello", skillIds: ["s1"] });
	await act(async () => {
		finish();
		await submission;
	});
	expect(hook.result.current.text).toBe("");
});

test("a failed send puts the message back in the field, with its file and its bindings", async () => {
	const hook = renderHook(() => useChatDraft("alice", "restore"));
	await waitFor(() => expect(hook.result.current.loaded).toBe(true));
	act(() => {
		hook.result.current.setText("/pdf hello");
		hook.result.current.acceptCompletion("/pdf hello ", { id: "s1", kind: "skill", marker: "/pdf", start: 0, end: 4 });
		hook.result.current.addFiles([new File(["text"], "notes.txt", { type: "text/plain" })]);
	});
	await act(() => hook.result.current.submit(vi.fn().mockRejectedValue(new Error("network"))));
	expect(hook.result.current.text).toBe("/pdf hello ");
	expect(hook.result.current.files).toHaveLength(1);
	expect(hook.result.current.files[0]).toMatchObject({ uploaded: { id: "att_uploaded" }, status: "ready" });
	expect(hook.result.current.skillIds).toEqual(["s1"]);
	expect(hook.result.current.error).toBe("chat.sendPreserved");
});

test("a failed send does not overwrite a message the person has started typing", async () => {
	const hook = renderHook(() => useChatDraft("alice", "typed-over"));
	await waitFor(() => expect(hook.result.current.loaded).toBe(true));
	act(() => hook.result.current.setText("first message"));
	let fail!: (error: unknown) => void;
	const send = vi.fn(
		() =>
			new Promise<void>((_resolve, reject) => {
				fail = reject;
			}),
	);
	let submission!: Promise<unknown>;
	act(() => {
		submission = hook.result.current.submit(send);
	});
	await waitFor(() => expect(send).toHaveBeenCalledOnce());
	// The next message, typed before the refusal arrives.
	act(() => hook.result.current.setText("second message"));
	await act(async () => {
		fail(new Error("network"));
		await submission;
	});
	expect(hook.result.current.text).toBe("second message");
	expect(hook.result.current.error).toBe("chat.sendPreserved");
	// Storage holds the newer message too, so a reload does not bring the sent one back.
	expect(local.values.get("draft:alice:typed-over")).toMatchObject({ text: "second message" });
});

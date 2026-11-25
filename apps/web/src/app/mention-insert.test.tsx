// @vitest-environment jsdom
/**
 * One @ from a message's own control goes through the draft's completion bindings, so the send
 * carries `mentionedMemberIds`. These cases pin the three things that matter: the text shape, the
 * binding surviving a later edit, and a mention that the reader typed over no longer naming them.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { insertMention } from "./mention-insert.ts";
import { useChatDraft } from "./use-chat-draft.ts";

const local = vi.hoisted(() => ({ values: new Map<string, unknown>(), generation: 0 }));
vi.mock("../lib/prepare-image.ts", () => ({ isImageFile: () => false, prepareImage: async () => undefined }));
vi.mock("@yonder/ui-data", async () => ({
	ApiError: (await import("@yonder/api-client")).ApiError,
	useApi: () => ({ uploadAttachment: vi.fn(), transcribeAudio: vi.fn() }),
	attachmentCacheKey: (owner: string, id: string) => `blob:${owner}:${id}`,
	chatCacheGeneration: () => local.generation,
	readChatCache: async (key: string) => local.values.get(key),
	writeChatCache: async (key: string, value: unknown) => void local.values.set(key, value),
	updateChatCache: async (key: string, update: (value: unknown) => unknown) =>
		void local.values.set(key, update(local.values.get(key))),
	removeChatCache: async (key: string) => void local.values.delete(key),
}));
beforeEach(() => local.values.clear());

async function ready(conversation = "mention") {
	const hook = renderHook(() => useChatDraft("alice", conversation));
	await waitFor(() => expect(hook.result.current.loaded).toBe(true));
	return hook;
}

test("an @ control writes `@name ` and binds that member for the send", async () => {
	const hook = await ready();
	act(() => expect(insertMention(hook.result.current, "mem_a", "林知夏")).toBe(true));
	expect(hook.result.current.text).toBe("@林知夏 ");
	const send = vi.fn().mockResolvedValue({});
	await act(() => hook.result.current.submit(send));
	expect(send).toHaveBeenCalledWith(expect.objectContaining({ body: "@林知夏", mentionedMemberIds: ["mem_a"] }));
});

test("an @ added after a word starts a new one, and repeats keep one id", async () => {
	const hook = await ready();
	act(() => hook.result.current.setText("看这个"));
	act(() => insertMention(hook.result.current, "mem_a", "林知夏"));
	expect(hook.result.current.text).toBe("看这个 @林知夏 ");
	act(() => insertMention(hook.result.current, "mem_a", "林知夏"));
	expect(hook.result.current.text).toBe("看这个 @林知夏 @林知夏 ");
	const send = vi.fn().mockResolvedValue({});
	await act(() => hook.result.current.submit(send));
	expect(send.mock.calls[0]?.[0]).toMatchObject({ mentionedMemberIds: ["mem_a"] });
});

test("typing over the name drops the binding, and an untouched one survives later edits", async () => {
	const hook = await ready();
	act(() => insertMention(hook.result.current, "mem_a", "林知夏"));
	act(() => hook.result.current.setText("@林知夏 明天见"));
	const send = vi.fn().mockResolvedValue({});
	await act(() => hook.result.current.submit(send));
	expect(send.mock.calls[0]?.[0]).toMatchObject({ mentionedMemberIds: ["mem_a"] });
	act(() => hook.result.current.setText("@林知 明天见"));
	const second = vi.fn().mockResolvedValue({});
	await act(() => hook.result.current.submit(second));
	expect(second.mock.calls[0]?.[0]).not.toHaveProperty("mentionedMemberIds");
});

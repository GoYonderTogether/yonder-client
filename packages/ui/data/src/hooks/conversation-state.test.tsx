// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { useMarkConversationRead } from "./conversation-state.ts";

const api = vi.hoisted(() => ({ markConversationRead: vi.fn() }));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));

test("pane and focus changes preserve a pending and acknowledged read; a failed request can retry", async () => {
	const client = new QueryClient();
	client.setQueryData(keys.me(), { member: { id: "owner" } });
	const refresh = vi.spyOn(client, "invalidateQueries");
	let acknowledge = () => {};
	let fail = () => {};
	api.markConversationRead
		.mockReturnValueOnce(new Promise((resolve) => (acknowledge = () => resolve({ ok: true }))))
		.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = () => reject(new Error("offline")))));
	api.markConversationRead.mockResolvedValue({ ok: true });
	const { rerender } = renderHook<void, { messageId: string | undefined }>(
		({ messageId }) => useMarkConversationRead("owner", "conversation", messageId, () => true),
		{
			initialProps: { messageId: "card" },
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		},
	);
	rerender({ messageId: undefined });
	rerender({ messageId: "card" });
	expect(api.markConversationRead).toHaveBeenCalledExactlyOnceWith("conversation", "card");
	rerender({ messageId: undefined });
	await act(async () => acknowledge());
	expect(refresh).toHaveBeenCalledExactlyOnceWith({ queryKey: keys.conversations.list() });
	rerender({ messageId: "card" });
	expect(api.markConversationRead).toHaveBeenCalledTimes(1);

	rerender({ messageId: "later" });
	await act(async () => fail());
	await act(async () => rerender({ messageId: "later" }));
	expect(api.markConversationRead.mock.calls).toEqual([
		["conversation", "card"],
		["conversation", "later"],
		["conversation", "later"],
	]);
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@yonder/api-client";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useCompactConversation } from "./compact.ts";

const compact = vi.hoisted(() => vi.fn());
vi.mock("../query/provider.tsx", () => ({ useApi: () => ({ compactConversation: compact }) }));

test("compact retries the same operation, shows the real result and scopes status to its conversation", async () => {
	compact
		.mockRejectedValueOnce(new Error("network"))
		.mockRejectedValueOnce(new ApiError({ code: "compact_failed", status: 503, message: "compaction failed" }))
		.mockResolvedValue({ status: "compacted", compactedMessages: 10, retainedMessages: 6, contextVersion: 1 });
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const hook = renderHook(({ id }) => useCompactConversation(id), { initialProps: { id: "a" }, wrapper });
	act(() => hook.result.current.run());
	await waitFor(() => expect(hook.result.current.isError).toBe(true));
	const operation = compact.mock.calls[0]?.[1];
	act(() => hook.result.current.run());
	await waitFor(() => expect(compact).toHaveBeenCalledTimes(2));
	await waitFor(() => expect(hook.result.current.isError).toBe(true));
	expect(compact.mock.calls[1]).toEqual(["a", operation]);
	act(() => hook.result.current.run());
	await waitFor(() => expect(hook.result.current.data?.status).toBe("compacted"));
	expect(compact.mock.calls[2]?.[1]).not.toEqual(operation);
	hook.rerender({ id: "b" });
	expect(hook.result.current.data).toBeUndefined();
	act(() => hook.result.current.run());
	await waitFor(() => expect(compact).toHaveBeenCalledTimes(4));
	expect(compact.mock.calls[3]?.[0]).toBe("b");
	expect(compact.mock.calls[3]?.[1]).not.toEqual(operation);
	client.clear();
});

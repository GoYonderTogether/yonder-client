// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { useMemoryActions, useMemoryDays } from "./memory.ts";

const api = vi.hoisted(() => ({
	memoryDays: vi.fn(),
	deleteMemory: vi.fn(),
}));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));

/** The account's zone as the settings page stored it; the tests pin one. */
const ZONE = "Asia/Shanghai";
vi.mock("../preferences/account-preferences.ts", () => ({ useAccountTimeZone: () => ZONE }));

/** A client is made per test, so the wrapper is a component at module level that reads it from props. */
function Client({ client, children }: { client: QueryClient; children: ReactNode }) {
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const page = { items: [], nextCursor: "older" };

test("every page request carries the account's time zone", async () => {
	api.memoryDays.mockResolvedValue(page);
	const client = new QueryClient();
	const wrapper = ({ children }: { children: ReactNode }) => <Client client={client}>{children}</Client>;
	const hook = renderHook(() => useMemoryDays(), { wrapper });
	await waitFor(() => expect(api.memoryDays).toHaveBeenCalledTimes(1));
	expect(api.memoryDays.mock.calls[0]).toEqual([undefined, ZONE]);
	await act(async () => {
		await hook.result.current.fetchNextPage();
	});
	expect(api.memoryDays.mock.calls[1]).toEqual(["older", ZONE]);
	client.clear();
});

test("deleting and organizing refresh the timeline", async () => {
	api.deleteMemory.mockResolvedValue({ ok: true });
	const client = new QueryClient();
	client.setQueryData(keys.memory.daysInZone(ZONE), { pages: [page], pageParams: [undefined] });
	const wrapper = ({ children }: { children: ReactNode }) => <Client client={client}>{children}</Client>;
	const hook = renderHook(() => useMemoryActions(), { wrapper });
	act(() => hook.result.current.remove.mutate("entry-1"));
	await waitFor(() => expect(hook.result.current.remove.isSuccess).toBe(true));
	expect(api.deleteMemory).toHaveBeenCalledWith("entry-1");
	expect(client.getQueryState(keys.memory.daysInZone(ZONE))?.isInvalidated).toBe(true);
	client.clear();
});

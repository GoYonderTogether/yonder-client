// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Conversation } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { useStartBotChat, useVisitActions } from "./visits.ts";

const api = vi.hoisted(() => ({
	startVisit: vi.fn(),
	approveVisit: vi.fn(),
	denyVisit: vi.fn(),
	payVisit: vi.fn(),
}));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));

function Client({ client, children }: { client: QueryClient; children: ReactNode }) {
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const conversation = (id: string, version: number): Conversation => ({
	id,
	kind: "direct",
	title: null,
	members: [],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version,
});
const existing = conversation("existing", 1);

test("starting a chat writes the returned conversation to the top of the conversations cache", async () => {
	const started = conversation("started", 1);
	api.startVisit.mockResolvedValue({ bot: { id: "bot" }, conversation: started });
	const client = new QueryClient();
	client.setQueryData(keys.conversations.list(), { items: [existing] });
	const wrapper = ({ children }: { children: ReactNode }) => <Client client={client}>{children}</Client>;
	const hook = renderHook(() => useStartBotChat(), { wrapper });
	let answered: typeof started | undefined;
	act(() => hook.result.current.mutate("someone_else", { onSuccess: (result) => (answered = result.conversation) }));
	await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
	expect(api.startVisit).toHaveBeenCalledWith({ handle: "someone_else" });
	expect(
		client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items.map((item) => item.id),
	).toEqual(["started", "existing"]);
	expect(answered?.id).toBe("started");
	client.clear();
});

test("approving, declining and paying each replace the cached conversation with the server's answer", async () => {
	const client = new QueryClient();
	client.setQueryData(keys.conversations.list(), { items: [existing] });
	const wrapper = ({ children }: { children: ReactNode }) => <Client client={client}>{children}</Client>;
	const hook = renderHook(() => useVisitActions(), { wrapper });
	for (const [name, next] of [
		["approve", conversation("existing", 2)],
		["deny", conversation("existing", 3)],
		["pay", conversation("existing", 4)],
	] as const) {
		api[`${name}Visit`].mockResolvedValue(next);
		act(() => hook.result.current[name].mutate("visit-1"));
		await waitFor(() => expect(hook.result.current[name].isSuccess).toBe(true));
		expect(api[`${name}Visit`]).toHaveBeenCalledWith("visit-1");
		expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0]?.version).toBe(
			next.version,
		);
	}
	client.clear();
});

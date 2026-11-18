// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { FriendRequest } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent } from "../realtime/events.ts";
import { useFriendRequests } from "./friend-requests.ts";

const api = vi.hoisted(() => ({ friendRequests: vi.fn() }));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));
const pending = { id: "request", status: "pending", version: 1 } as FriendRequest;
const accepted = { ...pending, status: "accepted", version: 2 } as FriendRequest;
function event(client: QueryClient, request: FriendRequest) {
	applyServerEvent(client, { type: "friend_request.updated", eventId: "event", at: "2026-11-18T00:00:00Z", request });
}
for (const snapshot of [[], [pending]]) {
	test(`first GET arriving after socket preserves new request and accepted version (${snapshot.length} old rows)`, async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		let finish!: (value: { items: FriendRequest[] }) => void;
		api.friendRequests.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const hook = renderHook(() => useFriendRequests(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		});
		await waitFor(() => expect(api.friendRequests).toHaveBeenCalled());
		act(() => {
			event(client, pending);
			event(client, accepted);
		});
		await act(async () => {
			finish({ items: snapshot });
		});
		await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
		expect(hook.result.current.data).toEqual({ items: [accepted] });
		expect(client.getQueryData(keys.friendRequests.detail(pending.id))).toEqual({ request: accepted });
		hook.unmount();
		client.clear();
		api.friendRequests.mockReset();
	});
}
test("GET before socket also updates both views and other-device acceptance invalidates open member profiles", async () => {
	const client = new QueryClient();
	client.setQueryData(keys.friendRequests.list(), { items: [pending] });
	client.setQueryData(keys.memberProfile("alice"), { relation: "none" });
	event(client, accepted);
	expect(client.getQueryData(keys.friendRequests.list())).toEqual({ items: [accepted] });
	expect(client.getQueryState(keys.memberProfile("alice"))?.isInvalidated).toBe(true);
	client.clear();
});

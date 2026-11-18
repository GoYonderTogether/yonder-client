// @vitest-environment jsdom
import type { FriendRequest, ServerEvent } from "@yonder/protocol";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	list: vi.fn(),
	detail: vi.fn(),
	accept: vi.fn(),
	request: vi.fn(),
	listeners: new Set<(event: ServerEvent) => void>(),
}));
vi.mock("@tarojs/taro", () => ({ useDidShow: () => {} }));
vi.mock("./ui", () => ({ errorText: () => "request failed" }));
vi.mock("../lib/runtime", () => ({
	api: {
		friendRequests: mock.list,
		friendRequest: mock.detail,
		acceptFriendRequest: mock.accept,
		requestFriend: mock.request,
	},
	useSession: () => ({ status: "signed-in", me: { member: { id: "owner-hook" } } }),
	useRealtimeRevision: () => 0,
	subscribeEvents: (listener: (event: ServerEvent) => void) => {
		mock.listeners.add(listener);
		return () => mock.listeners.delete(listener);
	},
}));

import { useFriendProfileRefresh, useFriendRequests } from "./use-friend-requests";

const pending = { id: "r", status: "pending", version: 1 } as FriendRequest;
const accepted = { ...pending, status: "accepted", version: 2 } as FriendRequest;
const views: ReturnType<typeof useFriendRequests>[] = [];
function Probe({ slot, id }: { slot: number; id?: string }) {
	views[slot] = useFriendRequests(id);
	return null;
}
test("accept in either surface updates both, old pending HTTP cannot revert, and socket adds a new request", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	let finish: (value: unknown) => void = () => {};
	mock.list.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	mock.detail.mockResolvedValue({ request: pending });
	mock.accept.mockResolvedValue({ request: accepted });
	const root = createRoot(document.createElement("div"));
	await act(async () =>
		root.render(
			createElement("div", null, createElement(Probe, { slot: 0 }), createElement(Probe, { slot: 1, id: "r" })),
		),
	);
	await act(async () => {
		await views[1]?.accept("r");
	});
	expect(views[0]?.items).toEqual([accepted]);
	expect(views[1]?.items).toEqual([accepted]);
	await act(async () => {
		finish({ items: [pending] });
	});
	expect(views[0]?.items).toEqual([accepted]);
	const next = { ...pending, id: "next" };
	await act(async () => {
		for (const listener of mock.listeners)
			listener({ type: "friend_request.updated", eventId: "e", at: "now", request: next });
	});
	expect(views[0]?.items).toEqual([accepted, next]);
	expect(views[1]?.items).toEqual([accepted, next]);
	await act(async () => root.unmount());
	expect(mock.listeners.size).toBe(0);
});

test("sending from contacts or profile updates the shared list without any socket event; failures add nothing", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.list.mockResolvedValue({ items: [] });
	const outgoing = { ...pending, id: "outgoing" };
	mock.request.mockResolvedValueOnce({ request: outgoing }).mockRejectedValueOnce(new Error("offline"));
	const root = createRoot(document.createElement("div"));
	await act(async () =>
		root.render(createElement("div", null, createElement(Probe, { slot: 0 }), createElement(Probe, { slot: 1 }))),
	);
	await act(async () => {
		await views[1]?.request("friend");
	});
	expect(mock.request).toHaveBeenCalledWith("friend");
	expect(views[0]?.items).toContainEqual(outgoing);
	expect(views[1]?.items).toContainEqual(outgoing);
	const before = views[0]?.items;
	await act(async () => {
		await expect(views[1]?.request("other")).rejects.toThrow("offline");
	});
	expect(views[0]?.items).toBe(before);
	await act(async () => root.unmount());
});

function Profile({ reload }: { reload: () => Promise<unknown> }) {
	useFriendProfileRefresh(reload);
	return null;
}

test("another device accepting refreshes the member profile relation and pending events do not", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const reload = vi.fn().mockResolvedValue(undefined);
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(createElement(Profile, { reload })));
	await act(async () => {
		for (const listener of mock.listeners)
			listener({ type: "friend_request.updated", eventId: "pending", at: "now", request: pending });
	});
	expect(reload).not.toHaveBeenCalled();
	await act(async () => {
		for (const listener of mock.listeners)
			listener({ type: "friend_request.updated", eventId: "accepted", at: "now", request: accepted });
	});
	expect(reload).toHaveBeenCalledOnce();
	await act(async () => root.unmount());
	expect(mock.listeners.size).toBe(0);
});

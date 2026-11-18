// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@yonder/api-client";
import type { Conversation, MemberProfileResponse } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { keys } from "../query/keys.ts";
import { useGroupActions } from "./groups.ts";
import { useMemberProfile, usePublicMemberProfile } from "./members.ts";
import { usePrivacy, useUpdatePrivacy } from "./privacy.ts";

const api = vi.hoisted(() => ({
	memberProfile: vi.fn(),
	publicMemberProfile: vi.fn(),
	privacy: vi.fn(),
	updatePrivacy: vi.fn(),
	updateGroup: vi.fn(),
	addGroupMembers: vi.fn(),
	removeGroupMember: vi.fn(),
	transferGroupOwner: vi.fn(),
	dissolveGroup: vi.fn(),
}));
vi.mock("../query/provider.tsx", () => ({ useApi: () => api }));
vi.mock("./account.ts", () => ({ useMe: () => ({ data: { member: { id: "mem_self" } } }) }));

/** The current test's client; the wrapper below is one stable component for the whole file. */
let client = new QueryClient();

function Wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A fresh client per test, so no cached answer survives into the next assertion. */
function freshClient(options: ConstructorParameters<typeof QueryClient>[0] = {}): QueryClient {
	client = new QueryClient(options);
	return client;
}

const profile: MemberProfileResponse = {
	card: { kind: "person", handle: "abcd1234", displayName: "A person", avatarUrl: null, bio: null, owner: null },
	relation: "contact",
	memberId: "mem_1",
	conversationId: "c_1",
};

const conversation = (extra: Partial<Conversation> = {}): Conversation => ({
	id: "c_group",
	kind: "group",
	title: "Weekend plans",
	members: [],
	ownerId: "mem_self",
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
	...extra,
});

test("a signed-in profile carries the relation and is cached under its own key", async () => {
	api.memberProfile.mockResolvedValue(profile);
	const client = freshClient();
	const hook = renderHook(() => useMemberProfile("abcd1234"), { wrapper: Wrapper });
	await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
	expect(api.memberProfile).toHaveBeenCalledWith("abcd1234");
	expect(client.getQueryData(keys.memberProfile("abcd1234"))).toEqual(profile);
	expect(client.getQueryData(keys.publicMemberProfile("abcd1234"))).toBeUndefined();
});

test("no handle means no request", () => {
	freshClient();
	renderHook(() => useMemberProfile(null), { wrapper: Wrapper });
	expect(api.memberProfile).not.toHaveBeenCalled();
});

test("the public card uses the unauthenticated call and never retries a 404", async () => {
	const notFound = new ApiError({ code: "not_found", status: 404, message: "gone" });
	api.publicMemberProfile.mockRejectedValue(notFound);
	// The app's default retry is on; a 404 must not be asked again even so.
	const client = freshClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
	const hook = renderHook(() => usePublicMemberProfile("nobody"), { wrapper: Wrapper });
	await waitFor(() => expect(hook.result.current.isError).toBe(true));
	expect(api.publicMemberProfile).toHaveBeenCalledTimes(1);
	expect(client.getQueryData(keys.memberProfile("nobody"))).toBeUndefined();
});

test("a privacy save replaces the whole settings object the server answered", async () => {
	const settings = { searchable: false, cardForUsers: true, cardPublicLink: true };
	api.updatePrivacy.mockResolvedValue(settings);
	const client = freshClient();
	const hook = renderHook(() => useUpdatePrivacy(), { wrapper: Wrapper });
	act(() => hook.result.current.mutate({ searchable: false }));
	await waitFor(() => expect(client.getQueryData(keys.privacy())).toEqual(settings));
});

test("reading privacy is one cached query", async () => {
	const settings = { searchable: true, cardForUsers: true, cardPublicLink: true };
	api.privacy.mockResolvedValue(settings);
	const client = freshClient();
	const hook = renderHook(() => usePrivacy(), { wrapper: Wrapper });
	await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
	expect(client.getQueryData(keys.privacy())).toEqual(settings);
});

test("a rename writes the answered conversation into the list cache in place", async () => {
	const before = conversation();
	const after = conversation({ title: "Next weekend", version: 2 });
	const other = conversation({ id: "c_other" });
	api.updateGroup.mockResolvedValue(after);
	const client = freshClient();
	client.setQueryData(keys.conversations.list(), { items: [before, other] });
	const hook = renderHook(() => useGroupActions("c_group"), { wrapper: Wrapper });
	act(() => hook.result.current.rename.mutate("Next weekend"));
	await waitFor(() => expect(hook.result.current.rename.isSuccess).toBe(true));
	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items).toEqual([after, other]);
});

test("adding members and dissolving both land in the list cache", async () => {
	const after = conversation({ version: 2 });
	api.addGroupMembers.mockResolvedValue(after);
	api.dissolveGroup.mockResolvedValue({ ...after, closedReason: "dissolved", dissolvedAt: "2026-11-17T00:00:00Z" });
	const client = freshClient();
	client.setQueryData(keys.conversations.list(), { items: [conversation()] });
	const hook = renderHook(() => useGroupActions("c_group"), { wrapper: Wrapper });
	act(() => hook.result.current.addMembers.mutate({ memberIds: ["mem_new"] }));
	await waitFor(() => expect(hook.result.current.addMembers.isSuccess).toBe(true));
	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0]?.version).toBe(2);

	act(() => hook.result.current.dissolve.mutate());
	await waitFor(() => expect(hook.result.current.dissolve.isSuccess).toBe(true));
	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0]?.closedReason).toBe(
		"dissolved",
	);
});

test("removing someone keeps the conversation and fetches it again", async () => {
	api.removeGroupMember.mockResolvedValue(undefined);
	const client = freshClient();
	client.setQueryData(keys.conversations.list(), { items: [conversation()] });
	const hook = renderHook(() => useGroupActions("c_group"), { wrapper: Wrapper });
	act(() => hook.result.current.removeMember.mutate("mem_other"));
	await waitFor(() => expect(hook.result.current.removeMember.isSuccess).toBe(true));
	expect(api.removeGroupMember).toHaveBeenCalledWith("c_group", "mem_other");
	expect(client.getQueryState(keys.conversations.list())?.isInvalidated).toBe(true);
});

test("leaving removes the person and then drops the conversation from the list", async () => {
	api.removeGroupMember.mockResolvedValue(undefined);
	const client = freshClient();
	client.setQueryData(keys.conversations.list(), { items: [conversation(), conversation({ id: "c_other" })] });
	const hook = renderHook(() => useGroupActions("c_group"), { wrapper: Wrapper });
	act(() => hook.result.current.leave.mutate());
	await waitFor(() => expect(hook.result.current.leave.isSuccess).toBe(true));
	expect(api.removeGroupMember).toHaveBeenCalledWith("c_group", "mem_self");
	expect(
		client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items.map((item) => item.id),
	).toEqual(["c_other"]);
});

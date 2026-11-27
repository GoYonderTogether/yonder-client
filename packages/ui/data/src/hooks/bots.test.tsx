// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { Conversation, Member, MeResponse } from "@yonder/protocol";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { createQueryClient } from "../query/client.ts";
import { keys } from "../query/keys.ts";
import { ownedBots, useDeleteBot, useReception, useUpdateBot, useUploadBotAvatar } from "./bots.ts";
import { useContactActions } from "./contacts.ts";

const endpoints = vi.hoisted(() => ({
	createBot: vi.fn(),
	updateBot: vi.fn(),
	uploadBotAvatar: vi.fn(),
	deleteBot: vi.fn(),
	reception: vi.fn(),
}));
vi.mock("../query/provider.tsx", () => ({ useApi: () => endpoints }));

const person: Member = {
	id: "me",
	kind: "person",
	handle: "meperson",
	displayName: "Me",
	avatarUrl: null,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-01T00:00:00Z",
	version: 1,
};
const bot: Member = {
	...person,
	id: "bot_a",
	kind: "bot",
	handle: "alpha",
	displayName: "Alpha",
	ownerId: "me",
	avatarColor: "1",
};

const direct: Conversation = {
	id: "cnv_a",
	kind: "direct",
	title: null,
	members: [
		{ memberId: "me", kind: "person", handle: "meperson", displayName: "Me", avatarUrl: null },
		{ memberId: "bot_a", kind: "bot", handle: "alpha", displayName: "Alpha", avatarUrl: null },
	],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
};

function setup() {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	client.setQueryData<MeResponse>(keys.me(), {
		member: person,
		bot: bot,
		signInMethods: [],
		handleChange: { canChange: true, nextChangeAt: null },
		hasPassword: false,
		settings: { locale: "en", theme: "system" },
	});
	client.setQueryData(keys.contacts(), { items: [person, bot] });
	client.setQueryData(keys.conversations.list(), { items: [direct] });
	return { client, wrapper };
}

test("creating a Bot makes its responsibility note available to the chat list before contacts refetch", async () => {
	const { client, wrapper } = setup();
	client.setQueryData(keys.contacts(), { items: [person] });
	const body = { displayName: "Alpha", botRoleLabel: "记录事件" };
	const created = { ...bot, ...body };
	endpoints.createBot.mockResolvedValue({ bot: created, conversation: direct });
	const hook = renderHook(() => useContactActions(), { wrapper });
	await hook.result.current.createBot.mutateAsync(body);
	expect(client.getQueryData(keys.contacts())).toEqual({ items: [person, created] });
	expect(client.getQueryData(keys.conversations.list())).toEqual({ items: [direct] });
});

test("a rename lands in contacts, the conversation row and me.bot", async () => {
	const { client, wrapper } = setup();
	endpoints.updateBot.mockResolvedValue({ ...bot, displayName: "Beta", version: 2 });
	const hook = renderHook(() => useUpdateBot(), { wrapper });
	await hook.result.current.mutateAsync({ id: "bot_a", displayName: "Beta" });
	expect(endpoints.updateBot).toHaveBeenCalledWith("bot_a", { displayName: "Beta" });
	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items[1]?.displayName).toBe("Beta");
	expect(client.getQueryData<MeResponse>(keys.me())?.bot.displayName).toBe("Beta");
	const row = client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0];
	expect(row?.members[1]?.displayName).toBe("Beta");
});

test("an uploaded picture replaces the stored address everywhere the Bot appears", async () => {
	const { client, wrapper } = setup();
	endpoints.uploadBotAvatar.mockResolvedValue({ ...bot, avatarUrl: "https://cdn.example/b.png", version: 3 });
	const hook = renderHook(() => useUploadBotAvatar(), { wrapper });
	const file = new File(["x"], "b.png", { type: "image/png" });
	await hook.result.current.mutateAsync({ id: "bot_a", file });
	expect(endpoints.uploadBotAvatar).toHaveBeenCalledWith("bot_a", file);
	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items[1]?.avatarUrl).toBe(
		"https://cdn.example/b.png",
	);
	const row = client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0];
	expect(row?.members[1]?.avatarUrl).toBe("https://cdn.example/b.png");
});

test("deleting a Bot drops its private chat and the member, and refreshes the plans", async () => {
	const { client, wrapper } = setup();
	client.setQueryData(keys.schedules.list(), { items: [] });
	endpoints.deleteBot.mockResolvedValue(undefined);
	const hook = renderHook(() => useDeleteBot(), { wrapper });
	await hook.result.current.mutateAsync("bot_a");
	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items).toEqual([]);
	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items.map((item) => item.id)).toEqual(["me"]);
	await waitFor(() => expect(client.getQueryState(keys.schedules.list())?.isInvalidated).toBe(true));
});

test("owned Bots are the account's own, the default one first", () => {
	const mine = { ...bot, isDefault: true, createdAt: "2026-11-09T00:00:00Z" };
	const other = { ...bot, id: "bot_b", createdAt: "2026-11-02T00:00:00Z" };
	const stranger = { ...bot, id: "bot_x", ownerId: "someone" };
	expect(ownedBots([other, stranger, person, mine], "me").map((item) => item.id)).toEqual(["bot_a", "bot_b"]);
	expect(ownedBots(undefined, "me")).toEqual([]);
	expect(ownedBots([other], undefined)).toEqual([]);
});

test("the reception setting is read again on every mount, not taken from a cache under a minute old", async () => {
	// The app's own query client treats data under a minute old as fresh.
	const client = createQueryClient();
	client.setQueryData(keys.contacts(), { items: [person, bot] });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	// A value a previous window left in the persisted cache: fresh by age, stale by fact.
	client.setQueryData(keys.reception(), { botId: "bot_a", custom: false });
	endpoints.reception.mockResolvedValue({ botId: "bot_b", custom: true });
	const hook = renderHook(() => useReception(), { wrapper });
	await waitFor(() => expect(hook.result.current.data).toEqual({ botId: "bot_b", custom: true }));
	expect(endpoints.reception).toHaveBeenCalled();
});

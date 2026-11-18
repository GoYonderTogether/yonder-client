import type { Conversation, Member } from "@yonder/protocol";
import { expect, test } from "vitest";
import {
	patchConversation,
	patchConversations,
	removeConversation,
	removeMemberFromConversations,
	sortOwnedBots,
	upsertOwnedBot,
	withoutMember,
} from "./member-cache";

const bot = (id: string, name: string, overrides: Partial<Member> = {}): Member => ({
	id,
	kind: "bot",
	handle: id,
	displayName: name,
	avatarUrl: null,
	avatarColor: "1",
	bio: null,
	ownerId: "mem_1",
	isDefault: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	version: 1,
	...overrides,
});

const conversation = (id: string, members: { memberId: string; displayName: string }[]): Conversation => ({
	id,
	kind: members.length > 2 ? "group" : "direct",
	title: null,
	members: members.map((member, index) => ({
		memberId: member.memberId,
		kind: index === 0 ? "person" : "bot",
		handle: member.memberId,
		displayName: member.displayName,
		avatarUrl: null,
	})),
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 3,
});

test("a member event renames the copy every conversation embeds, and leaves the rest alone", () => {
	const direct = conversation("c1", [
		{ memberId: "mem_1", displayName: "Me" },
		{ memberId: "bot_1", displayName: "Yonder" },
	]);
	const other = conversation("c2", [
		{ memberId: "mem_1", displayName: "Me" },
		{ memberId: "bot_2", displayName: "Second" },
	]);
	const renamed = { ...bot("bot_1", "Third", { avatarUrl: "/avatars/a.png", avatarColor: "4", version: 2 }) };
	const patched = patchConversations([direct, other], renamed);
	expect(patched[0].members[1]).toMatchObject({
		memberId: "bot_1",
		displayName: "Third",
		avatarUrl: "/avatars/a.png",
		avatarColor: "4",
	});
	// The conversation it is not in is returned untouched, and the version is left to the server.
	expect(patched[1]).toBe(other);
	expect(patched[0].version).toBe(3);
	expect(patchConversation(other, renamed)).toBe(other);
});

test("a removed conversation leaves the list and a removed member leaves the members", () => {
	const items = [
		conversation("c1", [
			{ memberId: "mem_1", displayName: "Me" },
			{ memberId: "bot_1", displayName: "A" },
		]),
		conversation("c2", [
			{ memberId: "mem_1", displayName: "Me" },
			{ memberId: "mem_2", displayName: "Friend" },
			{ memberId: "bot_1", displayName: "A" },
		]),
	];
	expect(removeConversation(items, "c1").map((item) => item.id)).toEqual(["c2"]);
	const withoutBot = removeMemberFromConversations(items, "bot_1");
	expect(withoutBot[0].members.map((member) => member.memberId)).toEqual(["mem_1"]);
	expect(withoutBot[1].members.map((member) => member.memberId)).toEqual(["mem_1", "mem_2"]);
});

test("the default Bot is first, then by name; a changed or new Bot keeps that order", () => {
	const bots = [bot("bot_b", "Beta"), bot("bot_a", "Alpha"), bot("bot_d", "Yonder", { isDefault: true })];
	expect(sortOwnedBots(bots).map((item) => item.id)).toEqual(["bot_d", "bot_a", "bot_b"]);
	// A rename moves the row, and a Bot created on another device joins the list.
	expect(upsertOwnedBot(sortOwnedBots(bots), bot("bot_b", "Aardvark"), "mem_1").map((item) => item.id)).toEqual([
		"bot_d",
		"bot_b",
		"bot_a",
	]);
	expect(upsertOwnedBot(sortOwnedBots(bots), bot("bot_c", "Cedar"), "mem_1").map((item) => item.id)).toEqual([
		"bot_d",
		"bot_a",
		"bot_b",
		"bot_c",
	]);
	// Another account's Bot and a person are not this list's business.
	expect(upsertOwnedBot(bots, bot("bot_x", "Theirs", { ownerId: "mem_2" }), "mem_1")).toEqual(bots);
	expect(upsertOwnedBot(bots, { ...bot("mem_9", "P"), kind: "person" }, "mem_1")).toEqual(bots);
	expect(withoutMember(bots, "bot_a").map((item) => item.id)).toEqual(["bot_b", "bot_d"]);
});

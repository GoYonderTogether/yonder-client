import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { expect, test } from "vitest";
import { addableFor, canRemoveMember, groupMemberRights, isOwnBot } from "./group-invites.ts";

const person = (memberId: string): ConversationMember => ({
	memberId,
	kind: "person",
	handle: memberId,
	displayName: memberId,
	avatarUrl: null,
});
const bot = (memberId: string, strangerOwner?: string): ConversationMember => ({
	memberId,
	kind: "bot",
	handle: memberId,
	displayName: memberId,
	avatarUrl: null,
	...(strangerOwner ? { botOwner: { handle: "x", displayName: strangerOwner } } : {}),
});
const contact = (id: string, kind: "person" | "bot", ownerId: string | null): Member => ({
	id,
	kind,
	handle: id,
	displayName: id,
	avatarUrl: null,
	bio: null,
	ownerId,
	isDefault: false,
	createdAt: "2026-11-23T00:00:00.000Z",
	version: 1,
});
const group = (extra: Partial<Conversation> = {}) => ({
	ownerId: "mem_owner",
	members: [person("mem_owner"), person("mem_me"), bot("bot_mine"), bot("bot_theirs", "Bo")],
	...extra,
});

test("a Bot is the viewer's own when the server did not name another owner", () => {
	expect(isOwnBot(bot("bot_mine"))).toBe(true);
	expect(isOwnBot(bot("bot_theirs", "Bo"))).toBe(false);
	expect(isOwnBot(person("mem_me"))).toBe(false);
});

test("the owner adds anyone; a member adds only their own Bots; a closed group allows nothing", () => {
	expect(groupMemberRights(group(), "mem_owner")).toEqual({ addAnyone: true, addOwnBots: true });
	expect(groupMemberRights(group(), "mem_me")).toEqual({ addAnyone: false, addOwnBots: true });
	expect(groupMemberRights(group({ closedReason: "removed" }), "mem_me")).toEqual({
		addAnyone: false,
		addOwnBots: false,
	});
	expect(groupMemberRights(group(), undefined)).toEqual({ addAnyone: false, addOwnBots: false });
});

test("a member is offered only their own Bots that are not in the group yet", () => {
	const contacts = [
		contact("mem_friend", "person", null),
		contact("bot_spare", "bot", "mem_me"),
		contact("bot_mine", "bot", "mem_me"),
		contact("bot_other", "bot", "mem_friend"),
	];
	expect(addableFor(group(), contacts, "mem_me").map((member) => member.id)).toEqual(["bot_spare"]);
	expect(addableFor(group(), contacts, "mem_owner").map((member) => member.id)).toEqual([
		"mem_friend",
		"bot_spare",
		"bot_other",
	]);
	expect(addableFor(group({ closedReason: "dissolved" }), contacts, "mem_me")).toEqual([]);
});

test("a member removes only their own Bot; the owner removes anyone but themself", () => {
	const g = group();
	expect(canRemoveMember(g, "mem_me", bot("bot_mine"))).toBe(true);
	expect(canRemoveMember(g, "mem_me", bot("bot_theirs", "Bo"))).toBe(false);
	expect(canRemoveMember(g, "mem_me", person("mem_owner"))).toBe(false);
	expect(canRemoveMember(g, "mem_me", person("mem_me"))).toBe(false);
	expect(canRemoveMember(g, "mem_owner", bot("bot_theirs", "Bo"))).toBe(true);
	expect(canRemoveMember(g, "mem_owner", person("mem_owner"))).toBe(false);
	expect(canRemoveMember(group({ closedReason: "dissolved" }), "mem_owner", bot("bot_mine"))).toBe(false);
});

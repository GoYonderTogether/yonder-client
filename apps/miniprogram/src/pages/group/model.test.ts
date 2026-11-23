import { addableContacts } from "@yonder/chat-model";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import {
	canAddMembers,
	canLeave,
	canRemove,
	canTransfer,
	groupMembers,
	isClosed,
	isOwner,
	orderedMembers,
} from "./model";

const person = (memberId: string, role?: "owner" | "member"): ConversationMember => ({
	memberId,
	kind: "person",
	handle: memberId,
	displayName: memberId,
	avatarUrl: null,
	...(role ? { role } : {}),
});
const bot = (memberId: string): ConversationMember => ({
	memberId,
	kind: "bot",
	handle: memberId,
	displayName: memberId,
	avatarUrl: null,
});

const group = (overrides: Partial<Conversation> = {}): Conversation => ({
	id: "g",
	kind: "group",
	title: "Trip",
	members: [person("me", "owner"), person("bob"), bot("my_bot")],
	ownerId: "me",
	lastMessageAt: null,
	lastMessage: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
	...overrides,
});

/** A member whose role the current protocol does not declare yet, as the visit flow will send it. */
const observer = { ...person("watcher"), role: "observer" } as unknown as ConversationMember;

describe("group membership", () => {
	it("hides an observer, keeps owner and member, and keeps a role-less member", () => {
		const members = [person("me", "owner"), person("bob", "member"), observer, bot("my_bot")];
		expect(groupMembers(members).map((member) => member.memberId)).toEqual(["me", "bob", "my_bot"]);
	});
	it("lists people before Bots and keeps each part's order", () => {
		expect(orderedMembers([bot("b1"), person("bob"), person("ann"), bot("b2")]).map((m) => m.memberId)).toEqual([
			"bob",
			"ann",
			"b1",
			"b2",
		]);
	});
});

describe("group permissions", () => {
	it("recognises the owner by ownerId, and by role when ownerId is absent", () => {
		expect(isOwner(group(), "me")).toBe(true);
		expect(isOwner(group(), "bob")).toBe(false);
		expect(isOwner(group({ ownerId: undefined }), "me")).toBe(true);
		expect(isOwner(group(), undefined)).toBe(false);
	});
	it("lets the owner remove others, never themself or another owner", () => {
		const members = [person("me", "owner"), person("bob"), bot("my_bot")];
		expect(canRemove(group(), "me", members[1])).toBe(true);
		expect(canRemove(group(), "me", members[2])).toBe(true);
		expect(canRemove(group(), "me", members[0])).toBe(false);
	});
	it("lets a member take out only their own Bot: the one the server names no other owner for", () => {
		const mine = bot("bob_bot");
		const strangers = { ...bot("amy_bot"), botOwner: { handle: "amy", displayName: "Amy" } };
		expect(canRemove(group(), "bob", mine)).toBe(true);
		expect(canRemove(group(), "bob", strangers)).toBe(false);
		expect(canRemove(group(), "bob", person("me", "owner"))).toBe(false);
		expect(canRemove(group(), "bob", person("bob"))).toBe(false);
		// Only the owner hands the group over, whatever a member may remove.
		expect(canTransfer(group(), "bob", person("carl"))).toBe(false);
	});
	it("transfers ownership to a person only", () => {
		expect(canTransfer(group(), "me", person("bob"))).toBe(true);
		expect(canTransfer(group(), "me", bot("other_bot"))).toBe(false);
	});
	it("offers leaving to a member but not to the owner", () => {
		expect(canLeave(group(), "bob")).toBe(true);
		expect(canLeave(group(), "me")).toBe(false);
		expect(canLeave(group(), undefined)).toBe(false);
	});
	it("closes every action once the group is closed", () => {
		const closed = group({ closedReason: "dissolved" });
		expect(isClosed(closed)).toBe(true);
		expect(canRemove(closed, "me", person("bob"))).toBe(false);
		expect(canTransfer(closed, "me", person("bob"))).toBe(false);
		expect(canLeave(closed, "bob")).toBe(false);
	});
});

it("offers only contacts who are not already in the group", () => {
	const contacts = [
		{
			id: "bob",
			...person("bob"),
			handle: "bob",
			bio: null,
			ownerId: null,
			isDefault: false,
			createdAt: "x",
			version: 1,
		},
		{
			id: "ann",
			...person("ann"),
			handle: "ann",
			bio: null,
			ownerId: null,
			isDefault: false,
			createdAt: "x",
			version: 1,
		},
		{ id: "b1", ...bot("b1"), bio: null, ownerId: null, isDefault: false, createdAt: "x", version: 1 },
	];
	expect(addableContacts(contacts, [person("bob"), bot("b1")]).map((contact) => contact.id)).toEqual(["ann"]);
});

it("opens the add page for the owner always, and for a member only while one of their Bots is left", () => {
	const contact = (id: string, kind: "person" | "bot", ownerId: string | null) =>
		({ id, kind, handle: id, displayName: id, avatarUrl: null, bio: null, ownerId, isDefault: false }) as never;
	const spare = contact("spare_bot", "bot", "bob");
	const inGroup = contact("my_bot", "bot", "bob");
	expect(canAddMembers(group(), "me", [])).toBe(true);
	expect(canAddMembers(group(), "bob", [spare])).toBe(true);
	expect(canAddMembers(group(), "bob", [inGroup, contact("carl", "person", null)])).toBe(false);
	expect(canAddMembers(group({ closedReason: "removed" }), "bob", [spare])).toBe(false);
	expect(canAddMembers(group(), undefined, [spare])).toBe(false);
});

import type { Conversation } from "@yonder/protocol";
import { expect, test } from "vitest";
import { conversationPeer, conversationTitle, selectedConversation } from "./conversation-presentation.tsx";

const primary: Conversation = {
	id: "original",
	isPrimary: true,
	kind: "direct",
	title: null,
	members: [
		{ memberId: "person", kind: "person", handle: "person1", displayName: "Me", avatarUrl: null },
		{ memberId: "bot", kind: "bot", handle: "bot123", displayName: "Primary", avatarUrl: null },
	],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
};
const newer: Conversation = {
	...primary,
	id: "newer",
	isPrimary: false,
	members: [{ memberId: "another", kind: "bot", handle: "another", displayName: "Another", avatarUrl: null }],
};

test("main stays on the primary bot after adding chats, while explicit ids select their actual peer", () => {
	expect(selectedConversation([newer, primary], "main", "bot")?.id).toBe("original");
	const legacy = { ...primary };
	delete legacy.isPrimary;
	expect(selectedConversation([newer, legacy], null, "bot")?.id).toBe("original");
	expect(selectedConversation([newer, primary], "newer", "bot")?.id).toBe("newer");
	expect(conversationTitle(newer, "person")).toBe("Another");
});

const host = { memberId: "host", kind: "person", handle: "owner", displayName: "Owner", avatarUrl: null } as const;
const visitor = {
	memberId: "visitor",
	kind: "person",
	handle: "stranger",
	displayName: "Stranger",
	avatarUrl: null,
} as const;
const otherBot = {
	memberId: "otherbot",
	kind: "bot",
	handle: "otherbot",
	displayName: "Someone's BOT",
	avatarUrl: null,
} as const;

test("a visit chat names the visitor to its host and the Bot to its visitor", () => {
	const visit = { id: "visit", state: "pending" as const, trialSent: 3, trialLimit: 3, botId: "otherbot" };
	const asHost: Conversation = { ...primary, members: [host, visitor, otherBot], visit: { ...visit, role: "host" } };
	const asVisitor: Conversation = { ...asHost, visit: { ...visit, role: "visitor" } };
	expect(conversationPeer(asHost, host.memberId)?.displayName).toBe("Stranger");
	expect(conversationTitle(asHost, host.memberId)).toBe("Stranger");
	expect(conversationPeer(asVisitor, visitor.memberId)?.displayName).toBe("Someone's BOT");
	expect(conversationTitle(asVisitor, visitor.memberId)).toBe("Someone's BOT");
});

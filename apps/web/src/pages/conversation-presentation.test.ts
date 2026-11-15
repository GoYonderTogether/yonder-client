import type { Conversation } from "@yonder/protocol";
import { expect, test } from "vitest";
import { conversationTitle, selectedConversation } from "./conversation-presentation.tsx";

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

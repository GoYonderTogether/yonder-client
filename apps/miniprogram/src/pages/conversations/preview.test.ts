import type { Conversation } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { conversationPreview } from "./preview";

const conversation = (lastMessage: Conversation["lastMessage"]): Conversation => ({
	id: "c",
	kind: "group",
	title: null,
	members: [],
	lastMessageAt: null,
	lastMessage,
	unreadCount: 0,
	pinned: false,
	version: 1,
});
const fallback = { group: "Group", direct: "Start a conversation" };

describe("conversation list preview", () => {
	it("shows a system event as the sentence the chat shows", () => {
		const dissolved = conversation({
			body: null,
			senderKind: "person",
			createdAt: "2026-11-17T00:00:00Z",
			type: "system",
			system: { event: "dissolved", actorName: null, targetNames: [] },
		});
		expect(conversationPreview(dissolved, "zh-CN", fallback)).toBe("该群聊已被解散");
		expect(conversationPreview(dissolved, "en", fallback)).toBe("The group was dissolved");
	});
	it("is not empty for a system event without a body", () => {
		const renamed = conversation({
			body: null,
			senderKind: "person",
			createdAt: "2026-11-17T00:00:00Z",
			type: "system",
			system: { event: "renamed", actorName: "Ann", targetNames: [], title: "Trip" },
		});
		expect(conversationPreview(renamed, "en", fallback)).toBe("Ann renamed the group to Trip");
	});
	it("keeps a text body and falls back when there is no message", () => {
		expect(
			conversationPreview(
				conversation({ body: "hi", senderKind: "person", createdAt: "2026-11-17T00:00:00Z", type: "text" }),
				"en",
				fallback,
			),
		).toBe("hi");
		expect(conversationPreview(conversation(null), "en", fallback)).toBe("Group");
	});
});

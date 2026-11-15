// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import type { Conversation, Member } from "@yonder/protocol";
import type { CachedMessage } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ConversationMessages } from "./conversation-messages.tsx";

vi.mock("../preview/use-attachment-blob.ts", () => {
	const state = { load: vi.fn(), loadPrefix: vi.fn(), loading: false, error: false, cacheError: false };
	return { useAttachmentBlob: () => state };
});

const person: Member = {
	id: "self",
	kind: "person",
	handle: "myself",
	displayName: "本人",
	avatarUrl: "/files/self.svg",
	bio: null,
	createdAt: "2026-11-15T00:00:00Z",
	version: 1,
};
const bot: Member = { ...person, id: "bot", kind: "bot", handle: "mybot", displayName: "现有 BOT", avatarUrl: null };
const conversation: Conversation = {
	id: "group",
	kind: "group",
	title: "测试群",
	members: [
		{ memberId: "alice", kind: "person", handle: "alice", displayName: "真实成员甲", avatarUrl: "/files/alice.svg" },
		{
			memberId: "bob",
			kind: "person",
			handle: "bob",
			displayName: "真实成员乙很长很长的完整名称",
			avatarUrl: null,
			avatarColor: "2",
		},
		{
			memberId: person.id,
			kind: person.kind,
			handle: person.handle,
			displayName: person.displayName,
			avatarUrl: person.avatarUrl,
		},
	],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
};
function message(id: string, senderId: string, extra: Partial<CachedMessage> = {}): CachedMessage {
	return {
		id,
		conversationId: conversation.id,
		senderId,
		senderKind: "person",
		type: "text",
		body: `正文 ${id}`,
		streaming: false,
		attachments: [],
		replyToId: null,
		createdAt: "2026-11-15T00:00:00Z",
		editedAt: null,
		version: 1,
		...extra,
	};
}
const props = { conversation, person, bot, disconnected: false, onResend: vi.fn(), onRetry: vi.fn(), retrying: false };
function view(items: CachedMessage[], overrides: Partial<typeof props> = {}) {
	return (
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<ConversationMessages {...props} {...overrides} items={items} />
		</I18nextProvider>
	);
}

test("adjacent sender runs keep one side avatar and a name above the message column, preserving real member fields", () => {
	const items = ["alice", "alice", "bob", "alice", "alice", "self", "self"].map((sender, index) =>
		message(String(index), sender),
	);
	const { container, rerender } = render(view(items));
	const runs = container.querySelectorAll("[data-message-run]");
	expect([...runs].map((run) => run.getAttribute("data-message-run"))).toEqual(["alice", "bob", "alice", "self"]);
	expect([...container.querySelectorAll("[data-message-sender-name]")].map((name) => name.textContent)).toEqual([
		"真实成员甲",
		"真实成员乙很长很长的完整名称",
		"真实成员甲",
		"本人",
	]);
	expect(container.querySelectorAll("[data-message-sender-header]")).toHaveLength(4);
	expect(container.querySelectorAll("article[data-message-id]")).toHaveLength(7);
	expect(container.querySelectorAll(".message-bubble")).toHaveLength(7);
	for (const run of runs) {
		const name = run.querySelector("[data-message-sender-name]");
		const avatar = run.querySelector("[data-message-sender-avatar]");
		const messages = run.querySelector(".message-run-messages");
		expect(avatar?.parentElement).toBe(run);
		expect(name?.closest(".message-run-messages")).toBe(messages);
		expect(name?.compareDocumentPosition(run.querySelector("article") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(run.querySelector("[data-message-sender-header]")?.contains(avatar)).toBe(false);
	}
	expect(runs[0]?.querySelector("img")?.getAttribute("src")).toBe("/files/alice.svg");
	expect(runs[1]?.querySelector("[data-message-sender-name]")?.getAttribute("title")).toBe(
		"真实成员乙很长很长的完整名称",
	);
	expect(runs[1]?.querySelector<HTMLElement>("[data-avatar-fallback]")?.style.backgroundColor).toBe(
		"var(--color-avatar-2-bg)",
	);
	expect(runs[3]?.getAttribute("data-run-sender")).toBe("self");
	expect(runs[3]?.querySelectorAll(".message-bubble-outgoing")).toHaveLength(2);
	const originalArticle = container.querySelector('[data-message-id="6"]');
	rerender(view([...items, message("7", "self")]));
	expect(container.querySelectorAll("[data-message-sender-header]")).toHaveLength(4);
	expect(container.querySelectorAll("[data-message-run]")[3]).toBe(runs[3]);
	expect(container.querySelector('[data-message-id="6"]')).toBe(originalArticle);
	rerender(view([message("older", "alice"), ...items]));
	expect(container.querySelectorAll("[data-message-sender-header]")).toHaveLength(4);
});

test("private text and attachment messages share one avatar per sender run without group names or attachment bubbles", () => {
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	const { container } = render(
		view(
			[
				message("1", "self"),
				message("2", "alice"),
				message("3", "alice", {
					body: "",
					attachments: [{ id: "file", kind: "file", name: "spec.pdf", mimeType: "application/pdf", size: 100 }],
				}),
				message("4", "alice"),
				message("5", "self"),
			],
			{
				conversation: { ...conversation, kind: "direct" },
			},
		),
	);
	expect(container.querySelectorAll("[data-message-sender-header], [data-message-sender-name]")).toHaveLength(0);
	expect(container.querySelectorAll("[data-message-sender-avatar]")).toHaveLength(3);
	const run = container.querySelector('[data-message-run="alice"]');
	expect(run?.querySelectorAll("article[data-message-id]")).toHaveLength(3);
	expect(run?.querySelectorAll("[data-message-sender-avatar]")).toHaveLength(1);
	expect(container.querySelectorAll(".message-bubble-outgoing")).toHaveLength(2);
	expect(container.querySelectorAll(".message-bubble-incoming")).toHaveLength(2);
	const attachment = container.querySelector('[data-message-id="3"] .message-attachments');
	expect(attachment).toBeTruthy();
	expect(attachment?.closest(".message-bubble")).toBeNull();
	expect(container.querySelector('[data-message-id="3"] .message-bubble')).toBeNull();
	vi.unstubAllGlobals();
});

test("grouping preserves streaming placeholders, pending and failure actions on each message", () => {
	const onResend = vi.fn(),
		onRetry = vi.fn();
	const failed = message("failed", "self", {
		pending: true,
		sendFailed: true,
		clientNonce: "nonce",
		skillIds: ["skill-one"],
	});
	const items = [
		message("stream", "alice", { body: null, streaming: true }),
		failed,
		message("run", "alice", {
			run: {
				id: "run",
				conversationId: conversation.id,
				messageId: "run",
				userMessageId: "original",
				status: "failed",
			},
		}),
	];
	const { container, getAllByRole, getByText } = render(view(items, { onResend, onRetry }));
	expect(container.querySelector('[data-message-id="stream"] .message-bubble [role="status"]')?.textContent).toBe(
		"回复中…",
	);
	expect(getByText("发送中…")).toBeTruthy();
	for (const button of getAllByRole("button", { name: "重试" })) fireEvent.click(button);
	expect(onResend).toHaveBeenCalledExactlyOnceWith(failed);
	expect(onRetry).toHaveBeenCalledExactlyOnceWith("original");
});

test("missing group members use existing person or Bot profiles and a localized unknown sender", () => {
	const { container } = render(
		view([message("1", "self"), message("2", "bot", { senderKind: "bot" }), message("3", "absent")], {
			conversation: { ...conversation, members: [] },
		}),
	);
	expect([...container.querySelectorAll("[data-message-sender-name]")].map((node) => node.textContent)).toEqual([
		"本人",
		"现有 BOT",
		"未知发送者",
	]);
	expect(container.querySelector('[data-message-run="self"] img')?.getAttribute("src")).toBe(person.avatarUrl);
	expect(
		container.querySelector('[data-message-run="bot"] [data-avatar-fallback]')?.classList.contains("rounded-[30%]"),
	).toBe(true);
});

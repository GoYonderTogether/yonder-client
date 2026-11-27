// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import type { CachedMessage } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ComposerQuoteContext } from "../app/composer-quote.tsx";
import { ConversationMessages, isOwnedBotChat, messageMenuRows } from "./conversation-messages.tsx";

const self: ConversationMember = {
	memberId: "self",
	kind: "person",
	handle: "self",
	displayName: "小林",
	avatarUrl: null,
};
const other: ConversationMember = { ...self, memberId: "other", handle: "other", displayName: "小陈" };
const bot: ConversationMember = { ...self, memberId: "bot", kind: "bot", handle: "guide", displayName: "向导 Bot" };
const person: Member = {
	...self,
	id: self.memberId,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-01T00:00:00Z",
	version: 1,
};
const ownedBot: Member = { ...person, ...bot, id: bot.memberId, ownerId: person.id };
const direct: Conversation = {
	id: "dm",
	kind: "direct",
	title: null,
	members: [self, other],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
};
const group: Conversation = {
	...direct,
	id: "group",
	kind: "group",
	members: [self, other, bot],
	ownerId: other.memberId,
};
const botChat: Conversation = { ...direct, members: [self, bot] };
const visitorChat: Conversation = {
	...botChat,
	visit: {
		role: "visitor",
		botId: bot.memberId,
		id: "visit",
		state: "open",
		trialSent: 0,
		trialLimit: 1,
	},
};
const now = Date.parse("2026-11-27T09:00:00Z");

function message(sender = self, extra: Partial<CachedMessage> = {}): CachedMessage {
	return {
		id: `msg-${sender.memberId}`,
		conversationId: direct.id,
		senderId: sender.memberId,
		senderKind: sender.kind,
		type: "text",
		body: "测试内容",
		streaming: false,
		attachments: [],
		replyToId: null,
		createdAt: new Date(now - 60_000).toISOString(),
		editedAt: null,
		version: 1,
		...extra,
	};
}

function menu(conversation: Conversation, item: CachedMessage, feedback = vi.fn()) {
	const t = (key: string) => key;
	return messageMenuRows(item, t, {
		conversation,
		personId: self.memberId,
		ownedBotChat: isOwnedBotChat(conversation, person, ownedBot, undefined),
		mention: conversation.kind === "group" && item.senderId !== self.memberId ? vi.fn() : undefined,
		onQuote: vi.fn(),
		onCopied: vi.fn(),
		actions: { forward: vi.fn(), feedback, recall: vi.fn(), delete: vi.fn() },
		now,
	});
}

const actions = ["copy", "quote", "forward"];
test.each([
	{ name: "human DM, self", chat: direct, sender: self, rows: ["recall", "delete"], hardDelete: false },
	{ name: "human DM, peer", chat: direct, sender: other, rows: ["delete"], hardDelete: false },
	{ name: "group, self", chat: group, sender: self, rows: ["recall", "delete"], hardDelete: false },
	{ name: "group, peer", chat: group, sender: other, rows: ["mention", "delete"], hardDelete: false },
	{ name: "group, Bot", chat: group, sender: bot, rows: ["mention", "like", "dislike", "delete"], hardDelete: false },
	{ name: "own Bot DM, self", chat: botChat, sender: self, rows: ["delete"], hardDelete: true },
	{ name: "own Bot DM, Bot", chat: botChat, sender: bot, rows: ["like", "dislike", "delete"], hardDelete: true },
	{ name: "visitor, self", chat: visitorChat, sender: self, rows: ["delete"], hardDelete: false },
	{ name: "visitor, Bot", chat: visitorChat, sender: bot, rows: ["like", "dislike", "delete"], hardDelete: false },
])("$name lists only eligible actions and the right delete scope", ({ chat, sender, rows, hardDelete }) => {
	const result = menu(chat, message(sender));
	expect(result.map(({ id }) => id)).toEqual([...actions, ...rows]);
	expect(result.at(-1)?.label).toBe(hardDelete ? "chat.deleteMessage" : "chat.deleteMessageForMe");
});

test.each([direct, group])("recall closes at exactly five minutes in $kind", (chat) => {
	for (const [age, recall] of [
		[299_999, true],
		[300_000, false],
		[300_001, false],
	] as const) {
		const item = message(self, { createdAt: new Date(now - age).toISOString() });
		expect(menu(chat, item).some(({ id }) => id === "recall")).toBe(recall);
	}
});

test.each([self, other, bot])("a group owner can recall old messages by $kind $memberId", (sender) => {
	const item = message(sender, { createdAt: new Date(now - 3_600_000).toISOString() });
	expect(menu({ ...group, ownerId: self.memberId }, item).some(({ id }) => id === "recall")).toBe(true);
	expect(menu(group, item).some(({ id }) => id === "recall")).toBe(false);
});

test.each([
	{ type: "system" },
	{ type: "task_notice" },
	{ recalled: { at: "2026-11-27T09:00:00Z", by: "sender" } },
	{ questionCard: {} as NonNullable<CachedMessage["questionCard"]> },
	{ options: ["A", "B"] },
	{ sendFailed: true },
	{ run: { status: "failed" } as NonNullable<CachedMessage["run"]> },
	{ scheduleNotice: { id: "scheduled", title: "Missed", reason: "missed" } },
	{ burstNotice: { reason: "limit" } },
	{ streaming: true },
	{ pending: true },
] satisfies Partial<CachedMessage>[])("a non-actionable row has no menu (%o)", (fields) => {
	expect(menu(group, message(self, fields))).toEqual([]);
	expect(menu({ ...direct, kind: "system" }, message())).toEqual([]);
});

test("attachment-only messages have no copy action, and visible cards cannot be forwarded", () => {
	expect(menu(group, message(self, { body: null })).map(({ id }) => id)).toEqual([
		"quote",
		"forward",
		"recall",
		"delete",
	]);
	expect(menu(group, message(bot, { cardId: "agent-card" })).map(({ id }) => id)).toEqual([
		"copy",
		"quote",
		"mention",
		"like",
		"dislike",
		"delete",
	]);
});

test.each([
	{ feedback: "up", id: "like", cancellation: "chat.cancelLike", other: "dislike", change: "down" },
	{ feedback: "down", id: "dislike", cancellation: "chat.cancelDislike", other: "like", change: "up" },
] as const)("clicking selected feedback $feedback cancels, and the opposite replaces it", (row) => {
	const item = message(bot, { feedback: row.feedback });
	const vote = vi.fn();
	const result = menu(group, item, vote);
	const cancellation = result.find(({ id }) => id === row.id);
	expect(cancellation?.label).toBe(row.cancellation);
	cancellation?.run();
	result.find(({ id }) => id === row.other)?.run();
	expect(vote.mock.calls).toEqual([
		[item, null],
		[item, row.change],
	]);
});

const i18n = createI18n("zh-CN");
function renderMessages(items: CachedMessage[], conversation: Conversation, wrap = (content: ReactNode) => content) {
	return render(
		<I18nextProvider i18n={i18n}>
			{wrap(
				<ConversationMessages
					conversation={conversation}
					person={person}
					items={items}
					hasFullHistory={false}
					disconnected={false}
					retrying={false}
					onResend={vi.fn()}
					onRetry={vi.fn()}
					onOpenMember={vi.fn()}
					messageActions={{ recall: vi.fn(), delete: vi.fn(), forward: vi.fn(), feedback: vi.fn() }}
				/>,
			)}
		</I18nextProvider>,
	);
}

test("recalled lines break sender runs and have no avatar, bubble, text or menu", () => {
	const recalledAt = new Date(now).toISOString();
	const { container } = renderMessages(
		[
			message(self, { body: "before" }),
			message(self, { id: "recall-self", body: "removed text", recalled: { at: recalledAt, by: "sender" } }),
			message(self, { id: "after", body: "after" }),
			message(other, { id: "recall-peer", body: null, recalled: { at: recalledAt, by: "sender" } }),
			message(bot, { id: "recall-owner", body: null, recalled: { at: recalledAt, by: "owner" } }),
		],
		group,
	);
	const timeline = within(container);
	expect(timeline.queryByText("removed text")).toBeNull();
	expect([...container.querySelectorAll("[data-message-run]")]).toHaveLength(2);
	for (const text of ["你撤回了一条消息", "小陈撤回了一条消息", "群主撤回了向导 Bot的一条消息"]) {
		const line = timeline.getByText(text);
		expect(line).toHaveAttribute("data-message-system");
		expect(line.closest("[data-message-run]")).toBeNull();
		expect(line.querySelector(".message-bubble, button, [data-message-sender-avatar]")).toBeNull();
		fireEvent.contextMenu(line);
		expect(screen.queryByRole("menu")).toBeNull();
	}
});

test("reopening a menu rechecks recall expiry and starts a quote with the visible sender", () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	try {
		vi.setSystemTime(now);
		const item = message(self, { body: "你".repeat(81), createdAt: new Date(now - 299_999).toISOString() });
		const setQuote = vi.fn();
		const { container } = renderMessages([item], direct, (content) => (
			<ComposerQuoteContext value={{ conversationId: direct.id, quote: undefined, setQuote }}>
				{content}
			</ComposerQuoteContext>
		));
		const bubble = container.querySelector(".message-bubble");
		if (!bubble) throw new Error("Missing message bubble");
		fireEvent.contextMenu(bubble);
		expect(screen.getByRole("menuitem", { name: "撤回" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "引用" }));
		expect(setQuote).toHaveBeenCalledWith({
			senderName: self.displayName,
			replyTo: { id: item.id, senderId: self.memberId, snippet: "你".repeat(80) },
		});
		vi.setSystemTime(now + 1);
		fireEvent.contextMenu(bubble);
		expect(screen.queryByRole("menuitem", { name: "撤回" })).toBeNull();
	} finally {
		vi.useRealTimers();
	}
});

test("a sent quote is below and outside the reply's only bubble", () => {
	const original = message(other, { body: "原消息" });
	const reply = message(self, {
		body: "回复内容",
		replyToId: original.id,
		replyTo: { id: original.id, senderId: original.senderId, snippet: "原消息" },
	});
	const { container } = renderMessages([original, reply], direct);
	const decorated = container.querySelector(`[data-message-decorated="${reply.id}"]`);
	const bubble = screen.getByText("回复内容").closest(".message-bubble");
	const quote = screen.getByText("小陈: 原消息").closest("[data-message-quote]");
	expect(bubble).toBeInTheDocument();
	expect(decorated?.querySelectorAll(".message-bubble")).toHaveLength(1);
	expect(quote).toBeInTheDocument();
	expect(decorated?.querySelector("article")?.nextElementSibling).toBe(quote);
});

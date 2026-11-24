// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
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
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-15T00:00:00Z",
	version: 1,
};
const bot: Member = {
	...person,
	id: "bot",
	kind: "bot",
	handle: "mybot",
	displayName: "现有 BOT",
	avatarUrl: null,
	ownerId: "self",
	isDefault: true,
};
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
const props = {
	conversation,
	person,
	bot,
	contacts: [] as Member[],
	hasFullHistory: false,
	disconnected: false,
	onResend: vi.fn(),
	onRetry: vi.fn(),
	retrying: false,
};
function view(items: CachedMessage[], overrides: Partial<typeof props> = {}) {
	return (
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<ConversationMessages {...props} {...overrides} items={items} />
		</I18nextProvider>
	);
}

test("only separates loaded neighbors across midnight or after five minutes of quiet", () => {
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	try {
		vi.setSystemTime(new Date(2026, 10, 19, 12));
		const at = (id: string, day: number, hour: number, minute: number) =>
			message(id, "alice", { createdAt: new Date(2026, 10, day, hour, minute).toISOString() });
		const items = [
			at("a", 18, 18, 40),
			at("next", 18, 18, 41),
			at("b", 18, 23, 59),
			at("c", 19, 0, 2),
			at("d", 19, 2, 47),
			at("e", 19, 2, 51),
			at("f", 19, 2, 56),
		];
		const { container, rerender } = render(view(items.slice(0, 1)));
		const labels = () => [...container.querySelectorAll("time")].map((line) => line.textContent);
		expect(labels()).toEqual([]);
		rerender(view(items.slice(0, 2)));
		expect(labels()).toEqual([]);
		rerender(view(items));
		const expected = ["11月18日 周三 23:59", "今天 00:02", "今天 02:47", "今天 02:56"];
		expect(labels()).toEqual(expected);
		expect(
			[...container.querySelectorAll("[data-message-run]")].map((run) => run.querySelectorAll("article").length),
		).toEqual([2, 1, 1, 2, 1]);
		rerender(view([at("older", 18, 18, 39), ...items]));
		expect(labels()).toEqual(expected);
		rerender(view([at("older", 18, 18, 35), ...items]));
		expect(labels()).toEqual(["11月18日 周三 18:40", ...expected]);
	} finally {
		vi.useRealTimers();
	}
});

test("adds a top time only for a known first message after five minutes", () => {
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	try {
		const sentAt = new Date(2026, 10, 19, 14);
		vi.setSystemTime(sentAt.getTime() + 299_999);
		const items = [message("first", "alice", { createdAt: sentAt.toISOString() })];
		const { container, rerender } = render(view(items, { hasFullHistory: true }));
		const label = () => container.querySelector("time");
		expect(label()).toBeNull();
		act(() => vi.advanceTimersByTime(1));
		expect(label()?.textContent).toBe("5 分钟前");
		act(() => vi.advanceTimersByTime(300_000));
		expect(label()?.textContent).toBe("今天 14:00");
		rerender(view(items));
		expect(label()).toBeNull();
	} finally {
		vi.useRealTimers();
	}
});

test("updates recent time labels at the two- and ten-minute boundaries", () => {
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	try {
		const sentAt = new Date(2026, 10, 18, 23, 58, 30);
		vi.setSystemTime(sentAt.getTime() + 119_999);
		const item = message("recent", "alice", { createdAt: sentAt.toISOString() });
		const older = message("older", "alice", { createdAt: new Date(2026, 10, 18, 23, 50).toISOString() });
		const { container } = render(view([older, item]));
		const label = () => container.querySelector("time")?.textContent;
		expect(label()).toBe("刚刚");
		act(() => vi.advanceTimersByTime(1));
		expect(label()).toBe("2 分钟前");
		for (let minute = 3; minute < 10; minute++) {
			act(() => vi.advanceTimersByTime(60_000));
			expect(label()).toBe(`${minute} 分钟前`);
		}
		act(() => vi.advanceTimersByTime(59_999));
		expect(label()).toBe("9 分钟前");
		act(() => vi.advanceTimersByTime(1));
		expect(label()).toBe("11月18日 周三 23:58");
	} finally {
		vi.useRealTimers();
	}
});

test("updates today's time label at local midnight without moving existing dividers", () => {
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	try {
		vi.setSystemTime(new Date(2026, 10, 19, 23, 59, 59, 999));
		const { container } = render(
			view([
				message("first", "alice", { createdAt: new Date(2026, 10, 18, 18).toISOString() }),
				message("older", "alice", { createdAt: new Date(2026, 10, 18, 18, 30).toISOString() }),
				message("today", "alice", { createdAt: new Date(2026, 10, 19, 23, 30).toISOString() }),
			]),
		);
		const [older, today] = [...container.querySelectorAll("time")];
		expect(older?.textContent).toBe("11月18日 周三 18:30");
		expect(today?.textContent).toBe("今天 23:30");
		act(() => vi.advanceTimersByTime(1));
		const labels = container.querySelectorAll("time");
		expect(labels).toHaveLength(2);
		expect(labels[0]).toBe(older);
		expect(labels[1]).toBe(today);
		expect(older?.textContent).toBe("11月18日 周三 18:30");
		expect(today?.textContent).toBe("11月19日 周四 23:30");
	} finally {
		vi.useRealTimers();
	}
});

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
		message("event-run", "alice", {
			run: {
				id: "event-run",
				conversationId: conversation.id,
				messageId: "event-run",
				userMessageId: "event",
				status: "failed",
				canRetry: false,
			},
		}),
	];
	const { container, getAllByRole, getByText } = render(view(items, { onResend, onRetry }));
	expect(container.querySelector('[data-message-id="stream"] .message-bubble [role="status"]')?.textContent).toBe(
		"回复中…",
	);
	expect(getByText("发送中…")).toBeTruthy();
	// A failure is the chat's own line, not a caption inside the message: it carries the reply's id
	// and stands beside the run, with no reason code in it.
	const notice = container.querySelector('[data-message-id="event-run"][role="alert"]');
	expect(notice?.textContent?.trim()).toBe("这次没有回复");
	expect(notice?.hasAttribute("data-message-system")).toBe(true);
	expect(notice?.className).toContain("system-notice");
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

test("group names show a private responsibility for the viewer's Bot and AI for another person's Bot", () => {
	const other = { ...bot, id: "other-bot", ownerId: "alice", botRoleLabel: "Private note" };
	const { container } = render(
		view([message("1", bot.id, { senderKind: "bot" }), message("2", other.id, { senderKind: "bot" })], {
			bot: { ...bot, botRoleLabel: "安排日程" },
			contacts: [other],
		}),
	);
	expect([...container.querySelectorAll("[data-bot-label]")].map((node) => node.textContent)).toEqual(["主 Bot", "AI"]);
	expect([...container.querySelectorAll("[data-bot-duty]")].map((node) => node.textContent)).toEqual(["安排日程"]);
});

test("a sender's avatar opens their card, as in QQ and WeChat", () => {
	const onOpenMember = vi.fn();
	const view = render(
		<I18nextProvider i18n={createI18n("zh-CN")}>
			<ConversationMessages {...props} items={[message("m1", "alice")]} onOpenMember={onOpenMember} />
		</I18nextProvider>,
	);
	fireEvent.click(view.getByRole("button", { name: "打开 真实成员甲 的资料" }));
	expect(onOpenMember).toHaveBeenCalledWith("alice");
	view.unmount();
});

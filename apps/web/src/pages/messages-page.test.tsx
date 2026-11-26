// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Conversation } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";

const data = vi.hoisted(() => ({
	items: [] as Conversation[],
	mode: "desktop" as const as "desktop" | "mobile",
	pin: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<typeof import("@yonder/ui-shell")>()),
	useShellChrome: () => ({ mode: data.mode }),
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useBot: () => ({ id: "ownbot", displayName: "My BOT" }),
	usePerson: () => ({ id: "host", displayName: "Owner" }),
	useConversations: () => ({ data: { items: data.items } }),
	useConversationListActions: () => ({
		pin: { mutate: data.pin },
		remove: { mutate: data.remove, reset: vi.fn() },
	}),
	useMessages: () => ({ data: { pages: [] } }),
	useQuota: () => ({ data: undefined }),
	useRunActions: () => ({ retry: { mutate: vi.fn(), isPending: false } }),
	useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
	useVisitActions: () => ({
		approve: { mutate: vi.fn(), isPending: false, error: null },
		deny: { mutate: vi.fn(), isPending: false, error: null },
		pay: { mutate: vi.fn(), isPending: false, error: null },
	}),
	useFriendRequestActions: () => ({ request: { mutate: vi.fn(), isPending: false, error: null } }),
	useContactActions: () => ({ addContact: { mutate: vi.fn(), isPending: false, error: null } }),
}));
vi.mock("../pages/chat-actions/index.tsx", () => ({ ChatActions: () => null }));
vi.mock("./conversation-messages.tsx", () => ({ ConversationMessages: () => null }));
vi.mock("./use-message-scroll.ts", () => ({ useMessageScroll: () => ({ bottom: undefined, showLatest: false }) }));

import { MessagesList } from "./messages-page.tsx";

const visitor = {
	memberId: "visitor",
	kind: "person",
	handle: "stranger",
	displayName: "Stranger",
	avatarUrl: null,
} as const;
const host = { memberId: "host", kind: "person", handle: "owner", displayName: "Owner", avatarUrl: null } as const;
const otherBot = {
	memberId: "otherbot",
	kind: "bot",
	handle: "otherbot",
	displayName: "Someone's BOT",
	avatarUrl: null,
} as const;
const visitRow = (state: "pending" | "open"): Conversation => ({
	id: "visit-conversation",
	kind: "direct",
	title: null,
	members: [host, visitor, otherBot],
	visit: { id: "visit", role: "host", state, trialSent: 3, trialLimit: 3, botId: "otherbot" },
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
});
const localised = (child: ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;

test("the Messages list opens the visits page without displaying any of its rows", () => {
	data.items = [visitRow("pending")];
	const onOpenVisits = vi.fn();
	render(localised(<MessagesList current={null} onOpen={vi.fn()} onOpenVisits={onOpenVisits} />));
	const folder = screen.getByRole("button", { name: /Bot visits/ });
	fireEvent.click(folder);
	expect(onOpenVisits).toHaveBeenCalledOnce();
	expect(screen.queryByRole("button", { name: /Stranger/ })).not.toBeInTheDocument();
});

test("the visits page names the visitor and Bot and marks requests waiting on the owner", () => {
	data.items = [visitRow("pending")];
	render(localised(<MessagesList incoming current={null} onOpen={vi.fn()} />));
	const row = screen.getByRole("button", { name: /Stranger/ });
	expect(row).toHaveTextContent("Waiting for you");
	expect(row).toHaveTextContent("Visited your Someone's BOT");
});

test("a visit the owner already decided carries no marker", () => {
	data.items = [visitRow("open")];
	render(localised(<MessagesList incoming current={null} onOpen={vi.fn()} />));
	expect(screen.getByRole("button", { name: /Stranger/ })).not.toHaveTextContent("Waiting for you");
});

test("row actions unpin and require confirmation before deleting from Messages", () => {
	data.items = [
		{ ...visitRow("open"), pinned: true },
		{ ...visitRow("open"), id: "hidden", title: "Hidden conversation", hiddenFromMessages: true },
	];
	const onOpen = vi.fn();
	render(localised(<MessagesList incoming current={null} onOpen={onOpen} />));
	expect(screen.queryByText("Hidden conversation")).toBeNull();
	const row = screen.getByRole("button", { name: /Stranger/ });
	fireEvent.contextMenu(row);
	fireEvent.click(screen.getByRole("button", { name: "Unpin conversation" }));
	expect(data.pin).toHaveBeenCalledWith({ id: "visit-conversation", pinned: false });
	fireEvent.contextMenu(row);
	fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
	const dialog = within(screen.getByRole("dialog", { name: "Delete conversation?" }));
	expect(dialog.getByText(/Your chat history stays/)).toBeInTheDocument();
	expect(data.remove).not.toHaveBeenCalled();
	fireEvent.click(dialog.getByRole("button", { name: "Delete conversation" }));
	expect(data.remove).toHaveBeenCalledWith("visit-conversation", { onSuccess: expect.any(Function) });
	expect(onOpen).not.toHaveBeenCalled();
});

test("mobile Messages omits only the primary Bot row; desktop retains it", () => {
	data.items = [
		{ ...visitRow("open"), id: "primary", title: "Primary Bot", isPrimary: true, visit: null },
		{ ...visitRow("open"), id: "other", title: "Other Bot", isPrimary: false, visit: null },
	];
	data.mode = "mobile";
	const props = { current: null, onOpen: vi.fn() };
	const view = render(localised(<MessagesList {...props} />));
	expect(screen.queryByRole("button", { name: /Primary Bot/u })).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: /Other Bot/u })).toBeInTheDocument();
	data.mode = "desktop";
	view.rerender(localised(<MessagesList {...props} />));
	expect(screen.getByRole("button", { name: /Primary Bot/u })).toBeInTheDocument();
});

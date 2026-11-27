// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Conversation, Message } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { type ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { AppNoticeProvider } from "../app/app-notice.tsx";
import { ComposerQuoteBar, ComposerQuoteContext, type DraftQuote, quoteInput } from "../app/composer-quote.tsx";
import { ForwardMessageDialog } from "./forward-message-dialog.tsx";
import { MessageDeleteDialog } from "./message-action-dialogs.tsx";
import { MessageQuote, quoteSnippet } from "./message-quote.tsx";

const api = vi.hoisted(() => ({
	conversations: vi.fn(),
	forward: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useConversations: api.conversations,
	useForwardMessage: () => ({ mutateAsync: api.forward }),
}));

function english(children: ReactNode) {
	return <I18nextProvider i18n={createI18n("en")}>{children}</I18nextProvider>;
}

const source: Message = {
	id: "source",
	conversationId: "chat",
	senderId: "alice",
	senderKind: "person",
	type: "text",
	body: "Original text",
	attachments: [],
	replyToId: null,
	createdAt: "2026-11-27T00:00:00Z",
	editedAt: null,
	streaming: false,
	version: 1,
};
const quoted = { id: source.id, senderId: source.senderId, snippet: "Original text" };

function QuotedComposer({ initial }: { initial: DraftQuote }) {
	const [quote, setQuote] = useState<DraftQuote | undefined>(initial);
	return (
		<ComposerQuoteContext value={{ conversationId: source.conversationId, quote, setQuote }}>
			<ComposerQuoteBar />
		</ComposerQuoteContext>
	);
}

test("composer shows the author and up to 80 code points, and cancel removes the outgoing reference", () => {
	const snippet = "🪴".repeat(80);
	const quote: DraftQuote = {
		senderName: "Alice",
		replyTo: { ...quoted, snippet: quoteSnippet({ ...source, body: `   ${snippet}尾   ` }) },
	};
	render(english(<QuotedComposer initial={quote} />));
	expect(screen.getByText("Alice")).toBeVisible();
	expect(screen.getByText(snippet)).toBeVisible();
	expect(quoteInput(quote)).toEqual({ replyToId: source.id, replyTo: { ...quoted, snippet } });
	fireEvent.click(screen.getByRole("button", { name: "Cancel quote" }));
	expect(screen.queryByText(snippet)).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Cancel quote" })).not.toBeInTheDocument();
	expect(quoteInput(undefined)).toEqual({});
});

test("quote block uses the server's preview and targets the original, with safe recalled and missing states", () => {
	const jump = vi.fn();
	const view = (replyTo: typeof quoted & { recalled?: true; missing?: true }) =>
		english(<MessageQuote replyTo={replyTo} senderName="Alice" onJump={jump} />);
	const { rerender } = render(view(quoted));
	const quote = screen.getByRole("button", { name: /Alice\s*Original text/ });
	fireEvent.click(quote);
	expect(jump).toHaveBeenCalledExactlyOnceWith(source.id);

	rerender(view({ ...quoted, recalled: true }));
	expect(screen.getByRole("button", { name: "This message was recalled" })).toBeVisible();
	expect(screen.queryByText(quoted.snippet)).not.toBeInTheDocument();

	rerender(view({ ...quoted, missing: true }));
	expect(screen.getByText("This message is unavailable")).toBeVisible();
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
	expect(screen.queryByText(quoted.snippet)).not.toBeInTheDocument();
});

const conversation = (id: string, title: string, overrides: Partial<Conversation> = {}): Conversation => ({
	id,
	title,
	kind: "direct",
	members: [],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
	...overrides,
});

test("forward filters conversations, sends selected targets, and retries only failures with their original nonce", async () => {
	api.conversations.mockReturnValue({
		isSuccess: true,
		data: {
			items: [
				conversation("alice", "Alice"),
				conversation("design", "Design group", { kind: "group" }),
				conversation("closed", "Closed group", { kind: "group", closedReason: "dissolved" }),
				conversation("system", "System notifications", { kind: "system" }),
			],
		},
	});
	api.forward
		.mockReset()
		.mockResolvedValueOnce({})
		.mockRejectedValueOnce(new Error("unavailable"))
		.mockResolvedValueOnce({});
	const close = vi.fn();
	render(
		english(
			<AppNoticeProvider>
				<ForwardMessageDialog messageId={source.id} personId="self" onClose={close} />
			</AppNoticeProvider>,
		),
	);
	const dialog = within(screen.getByRole("dialog", { name: "Forward message" }));
	const confirm = dialog.getByRole("button", { name: "Forward" });
	expect(confirm).toBeDisabled();
	expect(dialog.queryByRole("checkbox", { name: "Closed group" })).not.toBeInTheDocument();
	expect(dialog.queryByRole("checkbox", { name: "System notifications" })).not.toBeInTheDocument();
	fireEvent.click(dialog.getByRole("checkbox", { name: "Alice" }));
	const search = dialog.getByRole("searchbox", { name: "Search conversations" });
	fireEvent.change(search, { target: { value: "design" } });
	expect(dialog.queryByRole("checkbox", { name: "Alice" })).not.toBeInTheDocument();
	fireEvent.click(dialog.getByRole("checkbox", { name: "Design group" }));
	fireEvent.click(confirm);
	expect(await screen.findByText("Forwarded: 1. Failed: 1.")).toBeVisible();
	expect(close).not.toHaveBeenCalled();
	expect(api.forward).toHaveBeenNthCalledWith(
		1,
		expect.objectContaining({ messageId: source.id, conversationId: "alice", clientNonce: expect.any(String) }),
	);
	expect(api.forward).toHaveBeenNthCalledWith(
		2,
		expect.objectContaining({ messageId: source.id, conversationId: "design", clientNonce: expect.any(String) }),
	);
	expect(api.forward.mock.calls[0]?.[0].clientNonce).not.toBe(api.forward.mock.calls[1]?.[0].clientNonce);
	expect(dialog.getByRole("checkbox", { name: "Design group" })).toBeChecked();
	expect(dialog.queryByRole("checkbox", { name: "Alice" })).not.toBeInTheDocument();
	fireEvent.click(dialog.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(close).toHaveBeenCalledOnce());
	expect(api.forward).toHaveBeenCalledTimes(3);
	expect(api.forward.mock.calls[2]).toEqual(api.forward.mock.calls[1]);
});

test.each([
	{ ownedBotChat: false, consequence: "This only deletes your copy of the message." },
	{
		ownedBotChat: true,
		consequence: "This deletes the message from the chat and affects the Bot’s context for future replies.",
	},
])("delete confirmation explains consequences (owned Bot: $ownedBotChat)", ({ ownedBotChat, consequence }) => {
	const close = vi.fn();
	const remove = vi.fn();
	const view = (busy: boolean, error?: unknown) =>
		english(
			<MessageDeleteDialog ownedBotChat={ownedBotChat} busy={busy} onClose={close} onDelete={remove} error={error} />,
		);
	const { rerender } = render(view(false));
	const dialog = within(screen.getByRole("dialog", { name: "Delete message?" }));
	expect(dialog.getByText(consequence)).toBeVisible();
	expect(remove).not.toHaveBeenCalled();
	fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
	expect(close).toHaveBeenCalledOnce();
	expect(remove).not.toHaveBeenCalled();
	fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
	expect(remove).toHaveBeenCalledOnce();

	rerender(view(true));
	expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
	expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
	rerender(view(false, new ApiError({ code: "not_allowed", status: 403, message: "Forbidden" })));
	expect(dialog.getByRole("alert")).toHaveTextContent("You don’t have permission to do that.");
});

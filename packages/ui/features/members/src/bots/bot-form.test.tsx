// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Conversation, Member, Schedule } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { BotDetail } from "./bot-detail.tsx";
import { BotForm } from "./bot-form.tsx";
import { BotList } from "./bot-list.tsx";

const api = vi.hoisted(() => ({
	createBot: vi.fn(),
	updateBot: vi.fn(),
	uploadBot: vi.fn(),
	deleteBot: vi.fn(),
	contacts: [] as Member[],
	conversations: [] as Conversation[],
	schedules: [] as Schedule[],
	schedulesError: null as unknown,
}));

vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useContactActions: () => ({ createBot: { mutateAsync: api.createBot } }),
	useUpdateBot: () => ({ mutateAsync: api.updateBot }),
	useUploadBotAvatar: () => ({ mutateAsync: api.uploadBot }),
	useDeleteBot: () => ({ mutate: api.deleteBot, isPending: false }),
	usePerson: () => ({ id: "me", displayName: "Me" }),
	useContacts: () => ({ data: { items: api.contacts }, isLoading: false, isError: false }),
	useConversations: () => ({ data: { items: api.conversations } }),
	useSchedules: () => ({ data: { items: api.schedules }, error: api.schedulesError }),
	/** The real filter, so the list test exercises the ordering 「我 › Bot」 shows. */
	ownedBots: (contacts: readonly Member[] | undefined, ownerId: string | undefined) =>
		!ownerId || !contacts
			? []
			: contacts
					.filter((member) => member.kind === "bot" && member.ownerId === ownerId)
					.sort(
						(left, right) =>
							Number(right.isDefault) - Number(left.isDefault) || left.createdAt.localeCompare(right.createdAt),
					),
}));

const me: Member = {
	id: "me",
	kind: "person",
	handle: "meperson",
	displayName: "Me",
	avatarUrl: null,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-01T00:00:00Z",
	version: 1,
};

const bot = (overrides: Partial<Member> = {}): Member => ({
	id: "bot_a",
	kind: "bot",
	handle: "bota",
	displayName: "Alpha",
	avatarUrl: null,
	avatarColor: "1",
	bio: null,
	ownerId: "me",
	isDefault: false,
	createdAt: "2026-11-02T00:00:00Z",
	version: 1,
	...overrides,
});

const direct: Conversation = {
	id: "cnv_a",
	kind: "direct",
	title: null,
	members: [{ memberId: "bot_a", kind: "bot", handle: "bota", displayName: "Alpha", avatarUrl: null }],
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
};

const localised = (child: React.ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;
beforeEach(() => {
	vi.clearAllMocks();
	api.contacts = [];
	api.conversations = [];
	api.schedules = [];
	api.schedulesError = null;
});

test("creating reads the name from the field, counts characters and sends the chosen colour", async () => {
	api.createBot.mockResolvedValue({ bot: bot(), conversation: direct });
	const onCreated = vi.fn();
	render(localised(<BotForm mode="create" onCreated={onCreated} />));
	const name = screen.getByRole("textbox", { name: "Name" });
	fireEvent.change(name, { target: { value: "研究员" } });
	expect(screen.getByRole("button", { name: "Another name" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Rose" }));
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(() => expect(onCreated).toHaveBeenCalledWith("cnv_a"));
	expect(api.createBot).toHaveBeenCalledWith({ displayName: "研究员", avatarColor: "5" });
});

test("a name over forty characters cannot be submitted and says why", () => {
	render(localised(<BotForm mode="create" />));
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "字".repeat(41) } });
	expect(screen.getByText("A name can be up to 40 characters.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
	expect(api.createBot).not.toHaveBeenCalled();
});

test("editing changes the name in place and offers no shuffle", async () => {
	api.updateBot.mockResolvedValue(bot({ displayName: "Beta", version: 2 }));
	const onSaved = vi.fn();
	render(localised(<BotForm mode="edit" bot={bot()} onSaved={onSaved} />));
	expect(screen.queryByRole("button", { name: "Another name" })).toBeNull();
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Beta" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(onSaved).toHaveBeenCalled());
	expect(api.updateBot).toHaveBeenCalledWith({ id: "bot_a", displayName: "Beta" });
});

test("an upload rejects the wrong type and an oversized image before any request", () => {
	render(localised(<BotForm mode="edit" bot={bot()} />));
	const input = screen.getByLabelText("Bot picture");
	fireEvent.change(input, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
	expect(screen.getByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP image.");
	const large = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
	fireEvent.change(input, { target: { files: [large] } });
	expect(screen.getByRole("alert")).toHaveTextContent("The image must be 2 MB or smaller.");
	expect(api.uploadBot).not.toHaveBeenCalled();
});

test("a stored picture is cleared before the colour is set, because one call changes one appearance", async () => {
	api.updateBot.mockResolvedValue(bot({ avatarColor: "3", version: 3 }));
	render(localised(<BotForm mode="edit" bot={bot({ avatarUrl: "https://cdn.example/a.png", avatarColor: "1" })} />));
	fireEvent.click(screen.getByRole("button", { name: "Sand" }));
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(api.updateBot).toHaveBeenCalledTimes(2));
	expect(api.updateBot.mock.calls[0]?.[0]).toEqual({ id: "bot_a", clearAvatar: true });
	expect(api.updateBot.mock.calls[1]?.[0]).toEqual({ id: "bot_a", avatarColor: "3" });
});

test("the default Bot has no delete button at all", () => {
	render(localised(<BotDetail bot={bot({ isDefault: true })} />));
	expect(screen.queryByRole("button", { name: "Delete Bot" })).toBeNull();
});

test("deleting asks first and names the number of plans in the Bot's own chat", async () => {
	api.conversations = [direct];
	api.schedules = [
		{ id: "s1", conversationId: "cnv_a" },
		{ id: "s2", conversationId: "cnv_a" },
		{ id: "s3", conversationId: "cnv_other" },
	] as Schedule[];
	api.deleteBot.mockImplementation((_id: string, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
	const onDeleted = vi.fn();
	render(localised(<BotDetail bot={bot()} onDeleted={onDeleted} />));
	fireEvent.click(screen.getByRole("button", { name: "Delete Bot" }));
	expect(screen.getByText("Its 2 scheduled plans are deleted too.")).toBeInTheDocument();
	expect(screen.getByText(/hidden from you/)).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(api.deleteBot).toHaveBeenCalledWith("bot_a", expect.anything());
	// The chat that went with it is named, so the frame can leave that page.
	await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("cnv_a"));
});

test("a refused deletion shows the server's reason and keeps the Bot", () => {
	api.deleteBot.mockImplementation((_id: string, options?: { onError?: (error: unknown) => void }) =>
		options?.onError?.(new ApiError({ code: "default_bot_protected", status: 409, message: "protected" })),
	);
	render(localised(<BotDetail bot={bot()} />));
	fireEvent.click(screen.getByRole("button", { name: "Delete Bot" }));
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(screen.getByRole("alert")).toHaveTextContent("The default Bot cannot be deleted.");
});

test("the list shows only Bots this account owns, the default one first", () => {
	api.contacts = [
		bot({ id: "bot_b", displayName: "Later", createdAt: "2026-11-03T00:00:00Z" }),
		bot({ id: "bot_default", displayName: "Main", isDefault: true, createdAt: "2026-11-04T00:00:00Z" }),
		bot({ id: "bot_other", displayName: "Not mine", ownerId: "someone" }),
		me,
	];
	const open = vi.fn();
	render(localised(<BotList onOpen={open} />));
	expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual(["Main", "Later"]);
	fireEvent.click(screen.getByRole("button", { name: /Main/ }));
	expect(open).toHaveBeenCalledWith("bot_default");
});

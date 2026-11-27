// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Conversation, Member, Schedule } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { SidePanelProvider } from "@yonder/ui-shell";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { BotSettingsOverview } from "./bot-detail.tsx";
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

const side = { open: vi.fn(), push: vi.fn(), back: vi.fn(), close: vi.fn() };
const localised = (child: React.ReactNode) => (
	<I18nextProvider i18n={createI18n("en")}>
		<SidePanelProvider value={side}>{child}</SidePanelProvider>
	</I18nextProvider>
);
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

test("a new Bot can be created with its duty note, and the note over the limit blocks creation", async () => {
	api.createBot.mockResolvedValue({ bot: bot(), conversation: direct });
	const onCreated = vi.fn();
	render(localised(<BotForm mode="create" onCreated={onCreated} />));
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "研究员" } });
	const role = screen.getByRole("textbox", { name: "Responsibility note" });
	fireEvent.change(role, { target: { value: "  负责选题  " } });
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(() => expect(onCreated).toHaveBeenCalledWith("cnv_a"));
	expect(api.createBot).toHaveBeenCalledWith({ displayName: "研究员", avatarColor: "1", botRoleLabel: "负责选题" });
});

test("a duty note over twenty-four characters stops a new Bot from being created", () => {
	render(localised(<BotForm mode="create" />));
	fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "研究员" } });
	fireEvent.change(screen.getByRole("textbox", { name: "Responsibility note" }), {
		target: { value: "🧪".repeat(25) },
	});
	expect(screen.getByText("Use no more than 24 characters.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
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

test("the private responsibility note counts Unicode characters, trims and clears via the same PATCH", async () => {
	const onSaved = vi.fn();
	const current = bot({ botRoleLabel: "Old responsibility" });
	api.updateBot.mockResolvedValue(current);
	const form = render(localised(<BotForm mode="edit" settings bot={current} onSaved={onSaved} />));
	const input = screen.getByRole("textbox", { name: "Responsibility note" });
	const save = screen.getByRole("button", { name: "Save profile" });
	const role = "🧪".repeat(24);
	fireEvent.change(input, { target: { value: `${role}试` } });
	expect(save).toBeDisabled();
	fireEvent.change(input, { target: { value: ` ${role} ` } });
	fireEvent.click(save);
	await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
	expect(api.updateBot).toHaveBeenLastCalledWith({ id: "bot_a", botRoleLabel: role });
	form.rerender(localised(<BotForm mode="edit" settings bot={bot({ botRoleLabel: role })} onSaved={onSaved} />));
	fireEvent.change(input, { target: { value: " " } });
	fireEvent.click(save);
	await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
	expect(api.updateBot).toHaveBeenLastCalledWith({ id: "bot_a", botRoleLabel: null });
});

test("selects nickname tags, returns to the full name when a selection is removed, and caps additions at five", async () => {
	const nicknames = ["栗子", "栗子助理", "小栗", "栗", "Alpha"];
	api.updateBot.mockResolvedValue(bot({ nicknames, selectedNickname: "栗子", version: 2 }));
	render(localised(<BotForm mode="edit" bot={bot({ nicknames, selectedNickname: "小栗" })} />));

	const input = screen.getByRole("textbox", { name: "Nicknames (up to 5)" });
	expect(input).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Remove nickname 小栗" }));
	expect(screen.getByRole("button", { name: "Use full name" })).toHaveAttribute("aria-pressed", "true");
	expect(input).toBeEnabled();

	fireEvent.change(input, { target: { value: "栗子" } });
	expect(screen.getByText("This nickname is already added.")).toBeInTheDocument();
	fireEvent.change(input, { target: { value: " 小助手 " } });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(screen.getByRole("button", { name: "小助手" })).toBeInTheDocument();
	expect(input).toBeDisabled();

	const picked = screen.getByRole("button", { name: "栗子" });
	fireEvent.click(picked);
	expect(picked).toHaveAttribute("aria-pressed", "true");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() =>
		expect(api.updateBot).toHaveBeenCalledWith({
			id: "bot_a",
			nicknames: ["栗子", "栗子助理", "栗", "Alpha", "小助手"],
			selectedNickname: "栗子",
		}),
	);
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

function overview(member: Member, onDeleted = vi.fn()) {
	return localised(
		<BotSettingsOverview
			bot={member}
			onEdit={vi.fn()}
			onPersona={vi.fn()}
			onModel={vi.fn()}
			onChannels={vi.fn()}
			onDeleted={onDeleted}
		/>,
	);
}

test("the default Bot has no delete button at all", () => {
	render(overview(bot({ isDefault: true })));
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
	render(overview(bot(), onDeleted));
	fireEvent.click(screen.getByRole("button", { name: "Delete Bot" }));
	// The confirmation is the shared dialog, not an inline card, and it names both consequences.
	const dialog = screen.getByRole("dialog", { name: /^Delete Bot “/ });
	expect(dialog).toHaveTextContent("Its 2 scheduled plans are deleted too.");
	expect(dialog).toHaveTextContent("Its chat history will no longer be shown.");
	fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
	expect(api.deleteBot).toHaveBeenCalledWith("bot_a", expect.anything());
	// The chat that went with it is named, so the frame can leave that page.
	await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("cnv_a"));
});

test("a refused deletion shows the server's reason and keeps the Bot", () => {
	api.deleteBot.mockImplementation((_id: string, options?: { onError?: (error: unknown) => void }) =>
		options?.onError?.(new ApiError({ code: "default_bot_protected", status: 409, message: "protected" })),
	);
	render(overview(bot()));
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
	const [main, later] = screen.getAllByRole("button");
	expect(main).toHaveAccessibleName(/^Main\s*Main Bot\s*@bota$/);
	expect(later).toHaveAccessibleName(/^Later\s*AI\s*@bota$/);
	fireEvent.click(screen.getByRole("button", { name: /Main/ }));
	expect(open).toHaveBeenCalledWith("bot_default");
});

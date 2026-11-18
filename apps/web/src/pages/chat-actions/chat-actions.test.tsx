// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Conversation, Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BOT_NAMES } from "../../lib/bot-defaults.ts";
import { AddContacts } from "./add-contacts.tsx";
import { ChatMenu } from "./chat-menu.tsx";
import { CreateBot } from "./create-bot.tsx";
import { CreateGroup } from "./create-group.tsx";

const { createBot, createGroup, addContact, contactQueries } = vi.hoisted(() => ({
	createBot: vi.fn(),
	createGroup: vi.fn(),
	addContact: vi.fn(),
	contactQueries: vi.fn(),
}));
/** What the create mutation resolves with, so the shared form's `mutateAsync` path can be tested. */
const created = { bot: { id: "bot-new" }, conversation: { id: "conversation-new" } };
createBot.mockResolvedValue(created);
const members: Member[] = ["one", "two"].map((id) => ({
	id,
	kind: "bot",
	handle: `handle_${id}`,
	displayName: id,
	avatarUrl: null,
	bio: null,
	ownerId: "self",
	isDefault: false,
	createdAt: "2026-11-15T00:00:00Z",
	version: 1,
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useContactActions: () => ({
		createBot: { mutate: createBot, mutateAsync: createBot },
		createGroup: { mutate: createGroup },
		addContact: { mutate: addContact },
	}),
	useUpdateBot: () => ({ mutateAsync: vi.fn() }),
	useUploadBotAvatar: () => ({ mutateAsync: vi.fn() }),
	usePerson: () => ({ handle: "myhandle", displayName: "My name" }),
	useContacts: () => ({ data: { items: members }, isSuccess: true }),
	useContactSearch: (query: string) => {
		contactQueries(query);
		return { data: query ? { items: members.slice(0, 1) } : undefined, isSuccess: Boolean(query) };
	},
}));
const localised = (child: React.ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test("desktop menu preserves the requested order and keyboard selection; mobile puts scan first", () => {
	const select = vi.fn();
	const view = render(localised(<ChatMenu mobile={false} onSelect={select} />));
	fireEvent.click(screen.getByRole("button", { name: "New chat" }));
	expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
		"Create BOT",
		"Add contacts",
		"Start group chat",
	]);
	expect(screen.getByRole("menuitem", { name: "Create BOT" })).toHaveFocus();
	fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
	expect(screen.getByRole("menuitem", { name: "Add contacts" })).toHaveFocus();
	fireEvent.click(screen.getByRole("menuitem", { name: "Add contacts" }));
	expect(select).toHaveBeenCalledWith("addContact");
	view.rerender(localised(<ChatMenu mobile onSelect={select} />));
	fireEvent.click(screen.getByRole("button", { name: "New chat" }));
	expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent("Scan QR code");
	fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "New chat" })).toHaveFocus();
});

test("a BOT can be created without editing any field, using a library name and default color", async () => {
	const onCreated = vi.fn();
	render(localised(<CreateBot onCreated={onCreated} />));
	const name = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
	expect(BOT_NAMES).toContain(name.value);
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(() => expect(onCreated).toHaveBeenCalledWith("conversation-new"));
	expect(createBot).toHaveBeenCalledWith({ displayName: name.value, avatarColor: "1" });
	fireEvent.click(screen.getByRole("button", { name: "Lilac" }));
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(() => expect(createBot).toHaveBeenCalledTimes(2));
	expect(createBot.mock.calls[1]?.[0].avatarColor).toBe("4");
});

test("group creation requires two contacts and sends their member ids", () => {
	render(localised(<CreateGroup onCreated={vi.fn()} onCancel={vi.fn()} />));
	const done = screen.getByRole("button", { name: "Done" });
	expect(done).toBeDisabled();
	fireEvent.click(screen.getByRole("checkbox", { name: "one" }));
	expect(done).toBeDisabled();
	fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "TWO" } });
	expect(screen.queryByRole("checkbox", { name: "one" })).toBeNull();
	fireEvent.click(screen.getByRole("checkbox", { name: "two" }));
	expect(done).toBeEnabled();
	fireEvent.click(done);
	expect(createGroup).toHaveBeenCalledWith({ memberIds: ["one", "two"] }, expect.anything());
});

test.each(["button", "Enter"])(
	"contact search submits through %s and successful adding exposes its real conversation",
	async (submit) => {
		const onOpen = vi.fn();
		addContact.mockImplementation((_id, options) =>
			options.onSuccess({ conversation: { id: "direct-one" } as Conversation }),
		);
		render(localised(<AddContacts onOpen={onOpen} />));
		const search = screen.getByRole("searchbox", { name: "Search ID or phone" });
		await userEvent.type(search, "@handle_one");
		expect(contactQueries).toHaveBeenLastCalledWith("");
		if (submit === "Enter") await userEvent.keyboard("{Enter}");
		else fireEvent.click(screen.getByRole("button", { name: "Search" }));
		expect(contactQueries).toHaveBeenLastCalledWith("handle_one");
		fireEvent.click(screen.getByRole("button", { name: "Add" }));
		expect(addContact).toHaveBeenCalledWith("one", expect.anything());
		expect(onOpen).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Message" }));
		expect(onOpen).toHaveBeenCalledWith("direct-one");
	},
);

test("mobile add contacts starts with actionable scan and invitation rows plus a real handle QR", () => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
	const onScan = vi.fn();
	const onInvite = vi.fn();
	render(localised(<AddContacts onOpen={vi.fn()} onScan={onScan} onInvite={onInvite} />));
	expect(screen.getByRole("img", { name: "My QR code" })).toBeInTheDocument();
	expect(screen.getByText("@myhandle")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /Scan QR code/ }));
	expect(onScan).toHaveBeenCalledOnce();
	fireEvent.click(screen.getByRole("button", { name: /Invite friends/ }));
	expect(onInvite).toHaveBeenCalledOnce();
});

test.each([false, true])("desktop add contacts hides scan but keeps search and own QR (native: %s)", (native) => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0)");
	if (native) vi.stubGlobal("__TAURI_INTERNALS__", {});
	render(localised(<AddContacts onOpen={vi.fn()} onScan={vi.fn()} />));
	expect(screen.queryByRole("button", { name: /Scan QR code/ })).not.toBeInTheDocument();
	expect(screen.getByRole("searchbox", { name: "Search ID or phone" })).toBeInTheDocument();
	expect(screen.getByRole("img", { name: "My QR code" })).toBeInTheDocument();
});

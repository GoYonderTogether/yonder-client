// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Conversation } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { SideLayers, type SidePage, SidePanelProvider } from "@yonder/ui-shell";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	me: { member: { id: "mem_owner" } },
	contacts: { items: [] as unknown[] },
	conversations: { items: [] as Conversation[] },
	actions: {
		rename: vi.fn(),
		setBotPayer: vi.fn(),
		addMembers: vi.fn(),
		removeMember: vi.fn(),
		leave: vi.fn(),
		transferOwner: vi.fn(),
		dissolve: vi.fn(),
	},
}));

vi.mock("@yonder/ui-data", () => ({
	useMe: () => ({ data: state.me }),
	useContacts: () => ({ data: state.contacts, isSuccess: true, isLoading: false, isError: false }),
	useConversations: () => ({ data: state.conversations }),
	useGroupActions: () => ({
		rename: { mutateAsync: state.actions.rename, isPending: false },
		setBotPayer: { mutate: state.actions.setBotPayer, isPending: false },
		addMembers: { mutate: state.actions.addMembers, isPending: false },
		removeMember: { mutate: state.actions.removeMember, isPending: false },
		leave: { mutate: state.actions.leave, isPending: false },
		transferOwner: { mutate: state.actions.transferOwner, isPending: false },
		dissolve: { mutate: state.actions.dissolve, isPending: false },
	}),
	ApiError: class ApiError extends Error {
		code = "conversation_closed";
	},
	NetworkError: class NetworkError extends Error {},
}));

import { GroupInfo } from "./group-info.tsx";

const owner = {
	memberId: "mem_owner",
	kind: "person" as const,
	handle: "ownerhandle",
	displayName: "Ana",
	avatarUrl: null,
	role: "owner" as const,
};
const member = {
	memberId: "mem_other",
	kind: "person" as const,
	handle: "otherhandle",
	displayName: "Bo",
	avatarUrl: null,
	role: "member" as const,
};
const bot = { memberId: "bot_1", kind: "bot" as const, handle: "bot12345", displayName: "Helper", avatarUrl: null };

const group = (extra: Partial<Conversation> = {}): Conversation => ({
	id: "c_group",
	kind: "group",
	title: "Weekend plans",
	members: [owner, member, bot],
	ownerId: "mem_owner",
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
	...extra,
});

function TestSide({
	conversation,
	personId,
	onLeft,
	desktop,
}: {
	conversation: Conversation;
	personId: string;
	onLeft: () => void;
	desktop: boolean;
}) {
	const [pages, setPages] = useState<SidePage[]>([]);
	const back = (key?: string) =>
		setPages((current) => (!key || current.at(-1)?.key === key ? current.slice(0, -1) : current));
	return (
		<SidePanelProvider
			value={{
				open: (page) => setPages([page]),
				push: (page) => setPages((current) => [...current, page]),
				back,
				close: () => setPages([]),
			}}
		>
			<SideLayers
				mode={desktop ? "wide" : "mobile"}
				desktop={desktop}
				side={{
					tabs: [
						{
							key: "group",
							pages: [
								{
									key: "group",
									title: "Group info",
									content: <GroupInfo conversation={conversation} personId={personId} onLeft={onLeft} />,
								},
								...pages,
							],
						},
					],
					active: "group",
					expanded: true,
					onActivate: () => {},
					onMove: () => {},
					onBack: () => back(),
					onClose: () => setPages([]),
					onCloseAll: () => setPages([]),
					onCollapse: () => {},
					labels: {
						pane: "Details",
						back: "Back",
						close: "Close",
						closeTab: (title) => `Close ${title}`,
						closeAll: "Close all details",
						collapse: "Collapse details",
						expand: "Expand details",
						resize: "Resize details",
					},
				}}
			/>
		</SidePanelProvider>
	);
}

function show(conversation: Conversation, personId = "mem_owner", desktop = true) {
	const onLeft = vi.fn();
	state.conversations = { items: [conversation] };
	return {
		onLeft,
		...render(
			<I18nextProvider i18n={createI18n("en")}>
				<TestSide conversation={conversation} personId={personId} onLeft={onLeft} desktop={desktop} />
			</I18nextProvider>,
		),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	state.me = { member: { id: "mem_owner" } };
	state.contacts = { items: [] };
});

afterEach(() => vi.unstubAllGlobals());

test("the owner can rename, add, transfer and dissolve, and is never offered leave", () => {
	show(group());
	const name = screen.getByRole("button", { name: "Rename group “Weekend plans”" });
	expect(name).toBeVisible();
	expect(name.querySelectorAll("[data-avatar-fallback]")).toHaveLength(3);
	expect(screen.getByRole("button", { name: /Add members/ })).toBeVisible();
	expect(screen.getByRole("button", { name: /Transfer ownership/ })).toBeVisible();
	expect(screen.getByRole("button", { name: /Dissolve group/ })).toBeVisible();
	expect(screen.queryByRole("button", { name: /Leave group/ })).toBeNull();
});

test("a member can only leave", () => {
	show(group(), "mem_other");
	expect(screen.queryByRole("button", { name: /Dissolve group/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Add members/ })).toBeNull();
	expect(screen.getByRole("button", { name: /Leave group/ })).toBeVisible();
});

test("a closed group loses every edit action and keeps the name and the member list", () => {
	show(group({ closedReason: "dissolved" }));
	expect(screen.getByText("Weekend plans")).toBeVisible();
	expect(screen.queryByRole("button", { name: /Dissolve group/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Leave group/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Add members/ })).toBeNull();
	expect(screen.getByRole("button", { name: "All members" })).toBeVisible();
	expect(screen.getByText("Members · 3")).toBeVisible();
});

test("a removed member has nothing to leave", () => {
	show(group({ closedReason: "removed" }), "mem_other");
	expect(screen.queryByRole("button", { name: /Leave group/ })).toBeNull();
});

test("a failed rename preserves its draft, and repeated Enter while saving sends one request", async () => {
	let rejectRename!: (error: Error) => void;
	state.actions.rename
		.mockReturnValueOnce(
			new Promise((_, reject) => {
				rejectRename = reject;
			}),
		)
		.mockResolvedValueOnce(undefined);
	show(group());
	await userEvent.click(screen.getByRole("button", { name: "Rename group “Weekend plans”" }));
	const field = screen.getByRole("textbox", { name: "Group name" });
	await userEvent.clear(field);
	await userEvent.type(field, "Next weekend");
	fireEvent.keyDown(field, { key: "Enter", isComposing: true });
	expect(state.actions.rename).not.toHaveBeenCalled();
	fireEvent.keyDown(field, { key: "Enter" });
	fireEvent.keyDown(field, { key: "Enter" });
	expect(state.actions.rename).toHaveBeenCalledExactlyOnceWith("Next weekend");
	await act(async () => rejectRename(new Error("Refused")));
	expect(field).toHaveValue("Next weekend");
	expect(field).toHaveAccessibleDescription("Something went wrong. Try again.");
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(state.actions.rename).toHaveBeenCalledTimes(2);
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
});

test("dissolving asks first and does nothing until confirmed", async () => {
	show(group());
	await userEvent.click(screen.getByRole("button", { name: /Dissolve group/ }));
	expect(state.actions.dissolve).not.toHaveBeenCalled();
	const dialog = screen.getByRole("dialog", { name: "Dissolve this group?" });
	await userEvent.click(within(dialog).getByRole("button", { name: "Dissolve" }));
	expect(state.actions.dissolve).toHaveBeenCalledTimes(1);
});

test("leaving asks first, and cancelling leaves the group alone", async () => {
	const { onLeft } = show(group(), "mem_other");
	await userEvent.click(screen.getByRole("button", { name: /Leave group/ }));
	const dialog = screen.getByRole("dialog", { name: "Leave this group?" });
	await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	expect(state.actions.leave).not.toHaveBeenCalled();
	expect(onLeft).not.toHaveBeenCalled();
});

test("the member list puts people first, marks the reader, and removes only after a confirmation", async () => {
	show(group());
	await userEvent.click(screen.getByRole("button", { name: "All members" }));
	const dialog = screen.getByRole("region", { name: "All members" });
	const rows = within(dialog).getAllByRole("listitem");
	expect(rows.map((row) => row.textContent?.includes("Helper"))).toEqual([false, false, true]);
	expect(within(dialog).getByText("Group owner · You")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Remove Ana" })).toBeNull();

	await userEvent.click(screen.getByRole("button", { name: "Remove Bo" }));
	expect(state.actions.removeMember).not.toHaveBeenCalled();
	const confirm = screen.getByRole("dialog", { name: "Remove Bo from the group?" });
	fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
	expect(state.actions.removeMember).toHaveBeenCalledWith("mem_other", expect.anything());
});

test("a member's list has no per-row actions", async () => {
	show(group(), "mem_other");
	await userEvent.click(screen.getByRole("button", { name: "All members" }));
	expect(screen.getByText("Group owner")).toBeVisible();
	expect(screen.queryByRole("button", { name: /Remove Bo/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Make Bo the group owner/ })).toBeNull();
});

test("transferring ownership offers people only, and asks first", async () => {
	show(group());
	await userEvent.click(screen.getByRole("button", { name: /Transfer ownership/ }));
	const picker = screen.getByRole("dialog", { name: "Choose a new owner" });
	expect(within(picker).queryByRole("button", { name: /Helper/ })).toBeNull();
	expect(within(picker).queryByRole("button", { name: /Ana/ })).toBeNull();
	await userEvent.click(within(picker).getByRole("button", { name: /Bo/ }));
	expect(state.actions.transferOwner).not.toHaveBeenCalled();
	const confirm = screen.getByRole("dialog", { name: "Make Bo the group owner?" });
	await userEvent.click(within(confirm).getByRole("button", { name: "Transfer" }));
	expect(state.actions.transferOwner).toHaveBeenCalledWith({ memberId: "mem_other" }, expect.anything());
});

test("the add-members picker leaves out people already in the group", async () => {
	state.contacts = {
		items: [
			{ id: "mem_other", kind: "person", handle: "otherhandle", displayName: "Bo", avatarUrl: null },
			{ id: "mem_new", kind: "person", handle: "newhandle", displayName: "Dee", avatarUrl: null },
		],
	};
	show(group());
	await userEvent.click(screen.getByRole("button", { name: /Add members/ }));
	const dialog = screen.getByRole("dialog", { name: "Add members" });
	expect(within(dialog).queryByRole("checkbox", { name: /Bo/ })).toBeNull();
	await userEvent.click(within(dialog).getByRole("checkbox", { name: /Dee/ }));
	await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
	expect(state.actions.addMembers).toHaveBeenCalledWith({ memberIds: ["mem_new"] }, expect.anything());
});

test("mobile Add members uses the shared page back and returns to group info after saving", async () => {
	state.contacts = {
		items: [{ id: "mem_new", kind: "person", handle: "newhandle", displayName: "Dee", avatarUrl: null }],
	};
	show(group(), "mem_owner", false);
	await userEvent.click(screen.getByRole("button", { name: "Add members" }));
	const page = screen.getByRole("dialog", { name: "Add members" });
	expect(page).toHaveAttribute("data-page-side", "right");
	expect(within(page).getByRole("button", { name: "Back" })).toBeVisible();
	expect(within(page).queryByRole("button", { name: "Cancel" })).toBeNull();
	await userEvent.click(within(page).getByRole("checkbox", { name: "Dee" }));
	await userEvent.click(within(page).getByRole("button", { name: "Add" }));
	const [request, callbacks] = state.actions.addMembers.mock.lastCall ?? [];
	expect(request).toEqual({ memberIds: ["mem_new"] });
	act(() => callbacks.onSuccess());
	expect(screen.getByRole("button", { name: "All members" })).toBeVisible();
});

test("payer is edited through the Bot settings page", async () => {
	show(group({ groupBotPayer: "mentioner" }));
	expect(screen.queryByRole("combobox", { name: "Who pays for Bot replies?" })).toBeNull();
	await userEvent.click(screen.getByRole("button", { name: "Bot settings" }));
	const page = screen.getByRole("region", { name: "Bot settings" });
	const payer = within(page).getByRole("combobox", { name: "Who pays for Bot replies?" });
	expect(payer).toHaveValue("mentioner");
	await userEvent.selectOptions(payer, "owner");
	expect(state.actions.setBotPayer).toHaveBeenCalledWith("owner");
});

const myBot = {
	memberId: "bot_mine",
	kind: "bot" as const,
	handle: "mine1234",
	displayName: "Scout",
	avatarUrl: null,
};
const botOfOther = { ...bot, botOwner: { handle: "otherhandle", displayName: "Bo" } };
const spareBot = {
	id: "bot_spare",
	kind: "bot",
	handle: "spare123",
	displayName: "Spare",
	avatarUrl: null,
	ownerId: "mem_other",
};

test("a member with a Bot left to bring has one row, and sees none of the owner's others", () => {
	state.contacts = { items: [spareBot] };
	show(group(), "mem_other");
	expect(screen.getByRole("button", { name: "Add my Bot" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Add members" })).toBeNull();
	expect(screen.queryByRole("button", { name: /Transfer ownership/ })).toBeNull();
	expect(screen.queryByRole("button", { name: "Bot settings" })).toBeNull();
	expect(screen.getByRole("button", { name: /Leave group/ })).toBeVisible();
});

test("a member whose Bots are all in the group, or who has none, gets no add row", () => {
	state.contacts = { items: [{ ...spareBot, id: "bot_mine", displayName: "Scout" }] };
	show(group({ members: [owner, member, myBot, botOfOther] }), "mem_other");
	expect(screen.queryByRole("button", { name: "Add my Bot" })).toBeNull();
	expect(screen.queryByText("Group management")).toBeNull();
});

test("a member's picker offers only their own Bots, and adds them", async () => {
	state.contacts = {
		items: [
			spareBot,
			{ id: "mem_new", kind: "person", handle: "newhandle", displayName: "Dee", avatarUrl: null, ownerId: null },
			{ ...spareBot, id: "bot_friends", displayName: "Friend's", ownerId: "mem_new" },
		],
	};
	show(group(), "mem_other");
	await userEvent.click(screen.getByRole("button", { name: "Add my Bot" }));
	const dialog = screen.getByRole("dialog", { name: "Add my Bot" });
	expect(within(dialog).queryByRole("checkbox", { name: /Dee/ })).toBeNull();
	expect(within(dialog).queryByRole("checkbox", { name: /Friend's/ })).toBeNull();
	await userEvent.click(within(dialog).getByRole("checkbox", { name: /Spare/ }));
	await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
	expect(state.actions.addMembers).toHaveBeenCalledWith({ memberIds: ["bot_spare"] }, expect.anything());
});

test("a member can take out their own Bot but not a stranger's Bot or a person", async () => {
	show(group({ members: [owner, member, myBot, botOfOther] }), "mem_other");
	await userEvent.click(screen.getByRole("button", { name: "All members" }));
	expect(screen.queryByRole("button", { name: "Remove Ana" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Remove Helper" })).toBeNull();
	expect(screen.queryByRole("button", { name: /Make .* the group owner/ })).toBeNull();
	await userEvent.click(screen.getByRole("button", { name: "Remove Scout" }));
	expect(state.actions.removeMember).not.toHaveBeenCalled();
	const confirm = screen.getByRole("dialog", { name: "Remove Scout from the group?" });
	fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
	expect(state.actions.removeMember).toHaveBeenCalledWith("bot_mine", expect.anything());
});

test("a closed group offers a member nothing to add or remove", async () => {
	state.contacts = { items: [spareBot] };
	show(group({ members: [owner, member, myBot], closedReason: "removed" }), "mem_other");
	expect(screen.queryByRole("button", { name: "Add my Bot" })).toBeNull();
	await userEvent.click(screen.getByRole("button", { name: "All members" }));
	expect(screen.queryByRole("button", { name: "Remove Scout" })).toBeNull();
});

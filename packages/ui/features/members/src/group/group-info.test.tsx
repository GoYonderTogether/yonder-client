// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Conversation } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	me: { member: { id: "mem_owner" } },
	contacts: { items: [] as unknown[] },
	actions: {
		rename: vi.fn(),
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
	useGroupActions: () => ({
		rename: { mutate: state.actions.rename, isPending: false },
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

function show(conversation: Conversation, personId = "mem_owner", onLeft = vi.fn()) {
	return {
		onLeft,
		...render(
			<I18nextProvider i18n={createI18n("en")}>
				<GroupInfo conversation={conversation} personId={personId} onLeft={onLeft} />
			</I18nextProvider>,
		),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	state.me = { member: { id: "mem_owner" } };
});

test("the owner can rename, add, transfer and dissolve, and is never offered leave", () => {
	show(group());
	expect(screen.getByRole("button", { name: "Rename the group" })).toBeVisible();
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

test("renaming saves the new name through the owner's call", async () => {
	show(group());
	await userEvent.click(screen.getByRole("button", { name: "Rename the group" }));
	const field = screen.getByRole("textbox", { name: "Group name" });
	await userEvent.clear(field);
	await userEvent.type(field, "Next weekend");
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(state.actions.rename).toHaveBeenCalledWith("Next weekend", expect.anything());
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
	const dialog = screen.getByRole("dialog", { name: "All members" });
	const rows = within(dialog).getAllByRole("listitem");
	expect(rows.map((row) => row.textContent?.includes("Helper"))).toEqual([false, false, true]);
	expect(within(dialog).getByText("You")).toBeVisible();
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

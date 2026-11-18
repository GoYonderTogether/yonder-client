// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { AddMembers } from "./add-members.tsx";

const data = vi.hoisted(() => ({ contacts: [], chats: [] }) as { contacts: unknown[]; chats: unknown[] });

vi.mock("@yonder/ui-data", () => ({
	useContacts: () => ({ data: { items: data.contacts }, isSuccess: true }),
	useConversations: () => ({ data: { items: data.chats } }),
}));

const contact = (id: string, displayName: string, kind: "person" | "bot" = "person") => ({
	id,
	displayName,
	kind,
	handle: id,
	avatarUrl: null,
});
const participant = ({ id, ...fields }: ReturnType<typeof contact>): ConversationMember => ({
	...fields,
	memberId: id,
});

test("selecting a recent contact also selects their full-list row, and searching preserves the choice", async () => {
	const owner = contact("mem_owner", "Owner");
	const existing = contact("mem_existing", "Existing");
	const old = contact("mem_old", "Anna");
	const newest = contact("bot_recent", "Helper", "bot");
	const unmessaged = contact("mem_solo", "Sol");
	const host = contact("mem_host", "Watcher");
	const group: Conversation = {
		id: "group",
		kind: "group",
		title: "Trips",
		ownerId: owner.id,
		members: [participant(owner), participant(existing)],
		lastMessageAt: null,
		unreadCount: 0,
		pinned: false,
		version: 1,
	};
	const direct = (member: ReturnType<typeof contact>, lastMessageAt: string | null) => ({
		...group,
		id: `direct-${member.id}`,
		kind: "direct",
		members: [participant(owner), participant(member)],
		lastMessageAt,
	});
	data.contacts = [old, newest, unmessaged, existing, host];
	data.chats = [
		{ ...direct(old, "2026-11-15T14:00:00.000Z"), pinned: true },
		direct(existing, "2026-11-18T14:00:00.000Z"),
		{
			...direct(newest, "2026-11-17T14:00:00.000Z"),
			members: [participant(owner), participant(host), participant(newest)],
			visit: { id: "visit", role: "visitor", botId: newest.id },
		},
		direct(unmessaged, null),
	];
	const onAdd = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<AddMembers conversation={group} onAdd={onAdd} adding={false} error={null} />
		</I18nextProvider>,
	);
	const recent = within(screen.getByRole("group", { name: "Recent contacts" }));
	const all = within(screen.getByRole("group", { name: "All contacts" }));
	const recentRows = recent.getAllByRole("checkbox");
	expect(recentRows).toHaveLength(2);
	expect(recentRows[0]).toHaveAccessibleName("Helper");
	expect(recentRows[1]).toHaveAccessibleName("Anna");
	expect(all.getByRole("checkbox", { name: "Sol" })).toBeVisible();
	expect(all.getByRole("checkbox", { name: "Watcher" })).toBeVisible();
	expect(all.queryByRole("checkbox", { name: "Existing" })).toBeNull();
	await userEvent.click(recent.getByRole("checkbox", { name: "Helper" }));
	expect(all.getByRole("checkbox", { name: "Helper" })).toBeChecked();
	await userEvent.type(screen.getByRole("searchbox", { name: "Search contacts" }), "mem_solo");
	expect(screen.queryByRole("group", { name: "Recent contacts" })).toBeNull();
	await userEvent.click(screen.getByRole("checkbox", { name: "Sol" }));
	await userEvent.click(screen.getByRole("button", { name: "Add" }));
	expect(onAdd).toHaveBeenCalledWith(["bot_recent", "mem_solo"]);
});

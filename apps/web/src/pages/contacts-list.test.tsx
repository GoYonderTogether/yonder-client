// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ContactsList } from "./contacts-list.tsx";

const state = vi.hoisted(() => ({
	data: {
		items: [
			{ id: "person", kind: "person", handle: "alice", displayName: "Alice", avatarUrl: null, ownerId: null },
			{ id: "mine", kind: "bot", handle: "helper", displayName: "Helper", avatarUrl: null, ownerId: "me" },
			{ id: "theirs", kind: "bot", handle: "stranger", displayName: "Stranger", avatarUrl: null, ownerId: "alice-id" },
		],
	},
	isPending: false,
	isError: false,
	refetch: vi.fn(),
}));
const conversations = vi.hoisted(() => ({
	data: {
		items: [
			{ id: "g1", kind: "group", title: "Weekend plans", members: [], closedReason: null },
			{ id: "g2", kind: "group", title: "Old group", members: [], closedReason: "dissolved" },
			{ id: "d1", kind: "direct", title: "Direct chat", members: [], closedReason: null },
		],
	},
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useContacts: () => state,
	useConversations: () => conversations,
	usePerson: () => ({ id: "me" }),
	useFriendRequests: () => ({ data: { items: [] } }),
}));

function renderList(props: Partial<Parameters<typeof ContactsList>[0]> = {}) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<ContactsList onOpen={vi.fn()} {...props} />
		</I18nextProvider>,
	);
}

test("groups my bots, friends and group chats under their own headings", () => {
	renderList({ onOpenGroup: vi.fn() });
	expect(screen.getByRole("heading", { name: "My bots" })).toBeInTheDocument();
	expect(screen.getByRole("heading", { name: "Friends" })).toBeInTheDocument();
	expect(screen.getByRole("heading", { name: "Group chats" })).toBeInTheDocument();
	expect(screen.getByText("Helper")).toBeInTheDocument();
	expect(screen.getByText("Alice")).toBeInTheDocument();
	expect(screen.getByText("Weekend plans")).toBeInTheDocument();
});

test("leaves out other people's bots, closed groups and direct chats", () => {
	renderList({ onOpenGroup: vi.fn() });
	expect(screen.queryByText("Stranger")).not.toBeInTheDocument();
	expect(screen.queryByText("Old group")).not.toBeInTheDocument();
	expect(screen.queryByText("Direct chat")).not.toBeInTheDocument();
});

test("opens the selected profile and the selected group", () => {
	const open = vi.fn();
	const openGroup = vi.fn();
	renderList({ onOpen: open, onOpenGroup: openGroup });
	fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
	expect(open).toHaveBeenCalledWith("alice");
	fireEvent.click(screen.getByRole("button", { name: /Helper/ }));
	expect(open).toHaveBeenCalledWith("helper");
	fireEvent.click(screen.getByRole("button", { name: /Weekend plans/ }));
	expect(openGroup).toHaveBeenCalledWith("g1");
});

test("shows no group section when the caller cannot open groups", () => {
	renderList();
	expect(screen.queryByRole("heading", { name: "Group chats" })).not.toBeInTheDocument();
});

test("query failure exposes retry, not fake contact rows", () => {
	state.isError = true;
	renderList();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.refetch).toHaveBeenCalledOnce();
	state.isError = false;
});

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
			{ id: "person", kind: "person", handle: "alice", displayName: "Alice", avatarUrl: null },
			{ id: "bot", kind: "bot", handle: "agent", displayName: "Bot", avatarUrl: null },
		],
	},
	isPending: false,
	isError: false,
	refetch: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useContacts: () => state,
	useFriendRequests: () => ({ data: { items: [] } }),
}));
test("shows real people from contacts and opens the selected profile", () => {
	const open = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ContactsList onOpen={open} />
		</I18nextProvider>,
	);
	expect(screen.queryByText("Bot")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
	expect(open).toHaveBeenCalledWith("alice");
});
test("query failure exposes retry, not fake contact rows", () => {
	state.isError = true;
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ContactsList onOpen={vi.fn()} />
		</I18nextProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.refetch).toHaveBeenCalledOnce();
	state.isError = false;
});

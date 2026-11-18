// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { FriendRequestCard } from "./friend-request-card.tsx";

const state = vi.hoisted(() => ({ status: "pending", accept: vi.fn(), recipient: "self" }));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	usePerson: () => ({ id: "self" }),
	useFriendRequest: () => ({
		data: {
			request: {
				id: "r",
				status: state.status,
				sender: { id: "alice", kind: "person", displayName: "Alice" },
				recipient: { id: state.recipient, displayName: "Bob", kind: "person" },
			},
		},
	}),
	useFriendRequestActions: () => ({ accept: { mutate: state.accept } }),
}));
const card = () => (
	<I18nextProvider i18n={createI18n("en")}>
		<FriendRequestCard id="r" />
	</I18nextProvider>
);
test("recipient can accept and the same card turns permanently accepted without contact lookup", () => {
	const view = render(card());
	fireEvent.click(screen.getByRole("button", { name: "Accept" }));
	expect(state.accept).toHaveBeenCalledWith("r");
	state.status = "accepted";
	view.rerender(card());
	expect(screen.getByRole("status")).toHaveTextContent("Accepted");
	expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
});
test("sender cannot accept their own request", () => {
	state.status = "pending";
	state.recipient = "other";
	render(card());
	expect(screen.getByRole("status")).toHaveTextContent("Request sent");
	expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
});

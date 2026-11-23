// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgentCard } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
	card: null as unknown,
	person: { id: "mem_owner", handle: "owner", displayName: "Owner" },
	error: null as unknown,
	mutate: vi.fn(),
	mutation: { isPending: false, error: null as unknown, variables: undefined as unknown },
	refetch: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (original) => {
	const actual = await original<typeof import("@yonder/ui-data")>();
	return {
		...actual,
		usePerson: () => state.person,
		useSessionStore: (select: (value: { status: string }) => unknown) => select({ status: "signed-in" }),
		useAgentCard: () => ({ data: state.card, error: state.error, refetch: state.refetch }),
		useAgentCardActions: () => ({ ...state.mutation, mutate: state.mutate }),
	};
});

import { ApiError } from "@yonder/ui-data";
import { AgentCardMessage } from "./agent-card-message.tsx";

const answers = [
	{ id: "yes", label: "Keep it" },
	{ id: "no", label: "Discard" },
];
const question: AgentCard = {
	id: "acd_question",
	kind: "confirm",
	state: "open",
	title: "Keep the meeting summary?",
	body: { type: "choices", options: answers },
	version: 3,
};
const namecard: AgentCard = {
	id: "acd_namecard",
	kind: "card_draft",
	state: "open",
	title: "I tidied up your namecard",
	namecardReview: {
		card: {
			kind: "person",
			handle: "owner",
			displayName: "Owner",
			avatarUrl: null,
			bio: "New public bio",
			owner: null,
		},
	},
	actions: [{ id: "publish-namecard", label: "Confirm and publish", style: "primary", kind: "answer" }],
	version: 1,
};

function show(id = "acd_question") {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<AgentCardMessage id={id} disconnected={false} />
		</I18nextProvider>,
	);
}

function rerenderCard(view: ReturnType<typeof show>, id = "acd_question") {
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<AgentCardMessage id={id} disconnected={false} />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	state.card = question;
	state.error = null;
	state.mutation = { isPending: false, error: null, variables: undefined };
	state.mutate.mockReset();
	state.refetch.mockReset();
});
afterEach(() => vi.clearAllMocks());

test("a question offers its choices only while open, then keeps them without buttons", () => {
	const view = show();
	fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
	expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ actionId: "yes", version: 3 });

	state.card = {
		...question,
		state: "done",
		result: "Removed Dee",
		body: { type: "choices", options: answers, selected: "yes" },
	};
	rerenderCard(view);
	// An answered card keeps only the choice made, with the buttons retired, and says what came of it.
	expect(screen.getByRole("button", { name: "Keep it" })).toBeDisabled();
	expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
	expect(screen.getByRole("status")).toHaveTextContent("Removed Dee");
});

test("a card says what it is about while open, and afterwards what became of the choice", () => {
	state.card = { ...question, summary: "Remove Dee from the group" };
	const view = show();
	expect(screen.getByText("Remove Dee from the group")).toBeVisible();
	expect(screen.queryByRole("status")).toBeNull();

	// The server wrote why the confirmed change was refused: it must reach the owner.
	state.card = {
		...question,
		state: "done",
		summary: "Remove Dee from the group",
		result: "Not done: you are no longer the owner of this group",
		body: { type: "choices", options: answers, selected: "yes" },
	};
	rerenderCard(view);
	expect(screen.queryByText("Remove Dee from the group")).toBeNull();
	expect(screen.getByRole("status")).toHaveTextContent("Not done: you are no longer the owner of this group");
});

test("the namecard opens the exact preview and one confirm publishes it; after that the row stays", async () => {
	state.card = namecard;
	const view = show("acd_namecard");
	fireEvent.click(screen.getByRole("button", { name: /I tidied up your namecard/ }));
	const dialog = await screen.findByRole("dialog");
	expect(within(dialog).getByRole("heading", { name: "Owner" })).toBeVisible();
	expect(within(dialog).getByText("New public bio")).toBeVisible();
	fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
	expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ actionId: "publish-namecard", version: 1 });

	state.card = { ...namecard, state: "done", actions: undefined };
	rerenderCard(view, "acd_namecard");
	expect(screen.getByText("I tidied up your namecard")).toBeVisible();
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(screen.queryByRole("button")).toBeNull();
});

test("a stale preview is named and cannot be confirmed again", async () => {
	state.card = namecard;
	state.mutation = {
		isPending: false,
		error: new ApiError({ code: "conflict_version", status: 409, message: "Agent card changed" }),
		variables: { actionId: "publish-namecard", version: 1 },
	};
	show("acd_namecard");
	fireEvent.click(screen.getByRole("button", { name: /I tidied up your namecard/ }));
	const dialog = await screen.findByRole("dialog");
	expect(within(dialog).getByRole("alert")).toHaveTextContent("This preview is out of date");
	expect(within(dialog).getByRole("button", { name: "Confirm" })).toBeDisabled();
});

test("any other kind, and a card the server no longer authorizes, renders nothing", () => {
	state.card = { ...question, kind: "digest", body: { type: "list", items: [{ id: "a", title: "A" }] } };
	const other = show();
	expect(other.container).toBeEmptyDOMElement();
	other.unmount();

	state.card = null;
	state.error = new ApiError({ code: "not_found", status: 404, message: "Agent card not found" });
	const missing = show();
	expect(missing.container).toBeEmptyDOMElement();
});

test("a real load failure says why and offers a retry", () => {
	state.card = null;
	state.error = new ApiError({ code: "internal", status: 500, message: "Something went wrong on our side." });
	show();
	expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side.");
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(state.refetch).toHaveBeenCalledOnce();
	act(() => undefined);
});

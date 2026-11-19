// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Conversation, ConversationVisit } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { VisitBar } from "./visit-bar.tsx";

const calls = vi.hoisted(() => ({
	approve: vi.fn(),
	deny: vi.fn(),
	pay: vi.fn(),
	addContact: vi.fn(),
}));
const state = vi.hoisted(() => ({
	saving: { approve: undefined as unknown, deny: undefined as unknown, pay: undefined as unknown },
	addError: undefined as unknown,
	me: "host",
}));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	usePerson: () => ({ id: state.me }),
	useVisitActions: () => ({
		approve: { mutate: calls.approve, isPending: false, error: state.saving.approve },
		deny: { mutate: calls.deny, isPending: false, error: state.saving.deny },
		pay: { mutate: calls.pay, isPending: false, error: state.saving.pay },
	}),
	useFriendRequestActions: () => ({
		request: { mutate: calls.addContact, isPending: false, error: state.addError },
	}),
}));

const localised = (child: ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;

const visitor = {
	memberId: "visitor",
	kind: "person",
	handle: "stranger",
	displayName: "Stranger",
	avatarUrl: null,
} as const;
const host = { memberId: "host", kind: "person", handle: "owner", displayName: "Owner", avatarUrl: null } as const;
const bot = {
	memberId: "bot",
	kind: "bot",
	handle: "otherbot",
	displayName: "Someone's BOT",
	avatarUrl: null,
} as const;
const conversation = (visit: ConversationVisit, members = [host, visitor, bot]): Conversation => ({
	id: "conversation",
	kind: "direct",
	title: null,
	members,
	visit,
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
});
const visit = (role: "host" | "visitor", state: ConversationVisit["state"]): ConversationVisit => ({
	id: "visit-1",
	role,
	state,
	trialSent: 3,
	trialLimit: 3,
	botId: "bot",
});
beforeEach(() => {
	vi.clearAllMocks();
	state.saving = { approve: undefined, deny: undefined, pay: undefined };
	state.addError = undefined;
	state.me = "host";
});

test("the owner of the Bot approves or declines a pending visit and says who is asking", () => {
	render(localised(<VisitBar conversation={conversation(visit("host", "pending"))} />));
	expect(screen.getByText("Stranger wants to keep messaging your Bot")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Approve" }));
	expect(calls.approve).toHaveBeenCalledWith({ visitId: "visit-1", hostPays: false });
	fireEvent.click(screen.getByRole("checkbox", { name: "I will pay for this conversation" }));
	fireEvent.click(screen.getByRole("button", { name: "Approve" }));
	expect(calls.approve).toHaveBeenCalledWith({ visitId: "visit-1", hostPays: true });
	fireEvent.click(screen.getByRole("button", { name: "Decline" }));
	expect(calls.deny).toHaveBeenCalledWith("visit-1");
	expect(calls.pay).not.toHaveBeenCalled();
});

test("the owner has nothing to do once the visit is past pending", () => {
	const { container } = render(localised(<VisitBar conversation={conversation(visit("host", "open"))} />));
	expect(container).toBeEmptyDOMElement();
});

test("a visitor whose free allowance ran out pays for the rest from their own quota", () => {
	render(localised(<VisitBar conversation={conversation(visit("visitor", "capped"))} />));
	expect(screen.getByText("To continue, confirm use of your quota or ask the owner to pay.")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Pay for the rest myself" }));
	expect(calls.pay).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
	expect(calls.pay).toHaveBeenCalledWith("visit-1");
});

test("a pending visitor is offered the owner as a contact, and only once", async () => {
	calls.addContact.mockImplementation((_id: string, options: { onSuccess: () => void }) => options.onSuccess());
	state.me = "visitor";
	render(localised(<VisitBar conversation={conversation(visit("visitor", "pending"))} />));
	expect(screen.getByText("Free messages used up. Waiting for the owner to approve.")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Add as contact" }));
	expect(calls.addContact).toHaveBeenCalledWith("host", expect.anything());
	await waitFor(() => expect(screen.getByText("Request sent")).toBeInTheDocument());
	expect(screen.queryByRole("button", { name: "Add as contact" })).toBeNull();
});

test("a declined visitor sees the real reason and no action", () => {
	render(localised(<VisitBar conversation={conversation(visit("visitor", "denied"))} />));
	expect(screen.getByText("The Bot's owner declined to continue this chat.")).toBeInTheDocument();
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("a failed action shows the server's own reason", () => {
	state.saving.approve = new ApiError({ code: "visit_denied", status: 409, message: "denied" });
	render(localised(<VisitBar conversation={conversation(visit("host", "pending"))} />));
	expect(screen.getByRole("alert")).toHaveTextContent("The Bot's owner declined to continue this chat.");
});

test("an ordinary trial chat and a visitor paying for it show no bar at all", () => {
	const trial = render(localised(<VisitBar conversation={conversation(visit("visitor", "trial"))} />));
	expect(trial.container).toBeEmptyDOMElement();
	trial.unmount();
	const selfPay = render(localised(<VisitBar conversation={conversation(visit("visitor", "self_pay"))} />));
	expect(selfPay.container).toBeEmptyDOMElement();
});

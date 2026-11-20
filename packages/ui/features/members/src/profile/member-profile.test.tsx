// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MemberProfileResponse } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MemberProfile } from "./member-profile.tsx";

const person = (extra: Partial<MemberProfileResponse> = {}): MemberProfileResponse => ({
	card: {
		kind: "person",
		handle: "abcd1234",
		displayName: "A person",
		avatarUrl: null,
		bio: null,
		owner: null,
	},
	...extra,
});

const bot = (extra: Partial<MemberProfileResponse> = {}): MemberProfileResponse => ({
	card: {
		kind: "bot",
		handle: "bot12345",
		displayName: "A Bot",
		avatarUrl: null,
		bio: "Answers questions",
		owner: { handle: "ownerhandle", displayName: "The owner" },
	},
	...extra,
});

function show(profile: MemberProfileResponse, props: Record<string, unknown> = {}) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemberProfile profile={profile} {...props} />
		</I18nextProvider>,
	);
}

test("a contact gets one primary action: message", () => {
	const onMessage = vi.fn();
	show(person({ relation: "contact", memberId: "mem_1", conversationId: "c_1" }), { onMessage });
	expect(screen.getAllByRole("button")).toHaveLength(1);
	expect(screen.getByRole("button", { name: "Message" })).toBeVisible();
});

test("an existing conversation is enough to offer message even for the relation 'none'", () => {
	show(person({ relation: "none", conversationId: "c_1" }), { onMessage: vi.fn() });
	expect(screen.getByRole("button", { name: "Message" })).toBeVisible();
});

test("a stranger who is a person is added, not messaged", async () => {
	const onAddContact = vi.fn();
	const onMessage = vi.fn();
	show(person({ relation: "none", memberId: "mem_1" }), { onAddContact, onMessage });
	await userEvent.click(screen.getByRole("button", { name: "Add as contact" }));
	expect(onAddContact).toHaveBeenCalledTimes(1);
	expect(onMessage).not.toHaveBeenCalled();
});

test("a person's card can open their reception Bot", async () => {
	const onMatter = vi.fn();
	show(person({ relation: "none" }), { onAddContact: vi.fn(), onMatter });
	await userEvent.click(screen.getByRole("button", { name: "Talk to their Bot" }));
	expect(onMatter).toHaveBeenCalledOnce();
});

test("someone else's Bot starts a chat through the caller's callback, never a request of its own", async () => {
	const onChat = vi.fn();
	const onAddContact = vi.fn();
	show(bot({ relation: "none", memberId: "bot_1" }), { onChat, onAddContact });
	await userEvent.click(screen.getByRole("button", { name: "Start chat" }));
	expect(onChat).toHaveBeenCalledTimes(1);
	expect(onAddContact).not.toHaveBeenCalled();
});

test("a Bot with no chat callback offers nothing rather than a dead button", () => {
	show(bot({ relation: "none", memberId: "bot_1" }), { onAddContact: vi.fn() });
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test.each(["self", "own_bot"] as const)("relation %s shows the card and no action", (relation) => {
	show(person({ relation }), { onMessage: vi.fn(), onAddContact: vi.fn(), onChat: vi.fn() });
	expect(screen.getByRole("heading", { name: "A person" })).toBeVisible();
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("no action callbacks at all means no button", () => {
	show(person({ relation: "none" }));
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("a Bot names its owner, and the owner line opens the owner's card", async () => {
	const onOpenOwner = vi.fn();
	show(bot({ relation: "none", memberId: "bot_1" }), { onChat: vi.fn(), onOpenOwner });
	await userEvent.click(screen.getByRole("button", { name: "The owner's Bot" }));
	expect(onOpenOwner).toHaveBeenCalledWith("ownerhandle");
});

test("the anonymous form shows the card with sign-in and download, and nothing else", async () => {
	const onSignIn = vi.fn();
	const onDownload = vi.fn();
	show(bot(), { onSignIn, onDownload, onMessage: vi.fn(), onChat: vi.fn() });
	expect(screen.getByRole("heading", { name: "A Bot AI" })).toBeVisible();
	expect(screen.getByText("Answers questions")).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Sign in to add" }));
	expect(onSignIn).toHaveBeenCalledTimes(1);
	expect(screen.getByRole("button", { name: "Download Yonder" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Start chat" })).toBeNull();
});

test("the anonymous form without those callbacks renders no call to action", () => {
	show(bot());
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("a failed action shows the real reason", () => {
	show(person({ relation: "none", memberId: "mem_1" }), {
		onAddContact: vi.fn(),
		error: "This group chat is closed, so nothing can be sent.",
	});
	expect(screen.getByRole("alert")).toHaveTextContent("This group chat is closed");
});

test("a person's card lists their Bots, the reception Bot marked, and a tap opens one", async () => {
	const onOpenBot = vi.fn();
	show(
		person({
			relation: "none",
			memberId: "mem_1",
			bots: [
				{ handle: "botrecept1", displayName: "Front desk", avatarUrl: null, reception: true },
				{ handle: "botother12", displayName: "Helper", avatarUrl: null, reception: false },
			],
		}),
		{ onAddContact: vi.fn(), onOpenBot },
	);
	expect(screen.getByRole("heading", { name: "Their Bots" })).toBeVisible();
	expect(screen.getByText("Reception")).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: /Helper/ }));
	expect(onOpenBot).toHaveBeenCalledWith("botother12");
});

test("an anonymous card has no Bot list", () => {
	show(person(), { onSignIn: vi.fn(), onDownload: vi.fn() });
	expect(screen.queryByRole("heading", { name: "Their Bots" })).toBeNull();
});

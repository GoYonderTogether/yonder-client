import { expect, type Page, test } from "@playwright/test";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { conversation, isolateChat, message, person } from "./chat-fixture.ts";

/**
 * Who `@` may reach is a property of the conversation, and the row a person picks from answers one
 * question. These run the real product route against isolated API records.
 */
const me: ConversationMember = {
	memberId: person.id,
	kind: "person",
	handle: person.handle,
	displayName: person.displayName,
	avatarUrl: null,
};
const lin: Member = { ...person, id: "member-lin", handle: "lin", displayName: "林小满", ownerId: null };
const zhou: Member = { ...person, id: "member-zhou", handle: "zhou", displayName: "周远", ownerId: null };
const sameA: Member = { ...person, id: "member-same-a", handle: "sama", displayName: "李静", ownerId: null };
const sameB: Member = { ...person, id: "member-same-b", handle: "samb", displayName: "李静", ownerId: null };
const stranger: Member = {
	...person,
	id: "member-stranger",
	handle: "stranger",
	displayName: "通讯录外人",
	ownerId: null,
};
// Five people in the address book that the group does not contain.
const contacts = [lin, zhou, sameA, sameB, stranger];

const asMember = (member: Member): ConversationMember => ({
	memberId: member.id,
	kind: member.kind,
	handle: member.handle,
	displayName: member.displayName,
	avatarUrl: member.avatarUrl,
});
const group: Conversation = {
	...conversation,
	id: "group-mention",
	kind: "group",
	title: "项目群",
	isPrimary: false,
	pinned: false,
	ownerId: person.id,
	members: [me, asMember(lin), asMember(zhou)],
};

const friend: Conversation = {
	...conversation,
	id: "direct-friend",
	isPrimary: false,
	pinned: false,
	members: [me, asMember(zhou)],
};

async function open(page: Page, target: Conversation) {
	const api = await isolateChat(page, { members: target.members, items: [] });
	// The owner's Bot chat stays the account's primary; the target is the chat under test.
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, target] } }));
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: contacts } }));
	await page.goto(`/messages/${target.id}`);
	await expect(page.locator("textarea.composer-text")).toBeVisible();
	return api;
}

const options = (page: Page) => page.getByRole("listbox").getByRole("option");

test("a group mentions its own members, not the address book", async ({ page }) => {
	await open(page, group);
	const input = page.locator("textarea.composer-text");
	await input.fill("@");
	await expect(options(page)).toHaveCount(2);
	await expect(options(page)).toHaveText([/林小满/, /周远/]);
	await expect(page.getByRole("option", { name: /界面验收用户/ })).toHaveCount(0);
	await expect(page.getByRole("option", { name: /通讯录外人/ })).toHaveCount(0);
	// No key hint in a group mention.
	await expect(page.locator(".composer-completion-footer")).toHaveCount(0);
});

test("the owner's Bot chat still reaches the address book and keeps the key hint", async ({ page, hasTouch }) => {
	await open(page, conversation);
	const input = page.locator("textarea.composer-text");
	await input.fill("@");
	// A touch screen has no Enter or arrow keys, so the Bot chat omits the hint there too.
	await expect(page.locator(".composer-completion-footer")).toHaveCount(hasTouch ? 0 : 1);
	// The list pages at four; typing a contact's name from the address book reaches it.
	await input.fill("@通讯录外人");
	await expect(options(page)).toHaveCount(1);
	await expect(options(page)).toHaveText([/通讯录外人/]);
});

test("a person-to-person chat mentions only the other person", async ({ page }) => {
	await open(page, friend);
	const input = page.locator("textarea.composer-text");
	await input.fill("@");
	await expect(options(page)).toHaveCount(1);
	await expect(options(page)).toHaveText([/周远/]);
	await expect(page.locator(".composer-completion-footer")).toHaveCount(0);
});

test("recent speakers lead and a filter keeps the list's order", async ({ page }) => {
	// Lin spoke last, so Lin leads the group list even before the frozen member order.
	const api = await isolateChat(page, {
		members: group.members,
		items: [
			message("m-01", "早上好", true),
			{ ...message("m-02", "我在", false), senderId: zhou.id, senderKind: "person" },
			{ ...message("m-03", "到齐", false), senderId: lin.id, senderKind: "person" },
		],
	});
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, group] } }));
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: contacts } }));
	await page.goto(`/messages/${group.id}`);
	await expect(page.locator("textarea.composer-text")).toBeVisible();
	const input = page.locator("textarea.composer-text");
	await input.fill("@");
	await expect(options(page)).toHaveText([/林小满/, /周远/]);
	await input.fill("@林");
	await expect(options(page)).toHaveText([/林小满/]);
	expect(api.sent).toHaveLength(0);
});

test("colliding display names show handles; unique names do not", async ({ page }) => {
	await open(page, group);
	const input = page.locator("textarea.composer-text");
	// The two 李静 are address-book people, so reach them from the Bot chat where contacts are listed.
	await page.goto(`/messages/${conversation.id}`);
	await expect(input).toBeVisible();
	await input.fill("@李静");
	await expect(options(page)).toHaveCount(2);
	await expect(options(page).first().locator(".composer-completion-handle")).toHaveText("@sama");
	await expect(options(page).last().locator(".composer-completion-handle")).toHaveText("@samb");
	await input.fill("@周远");
	await expect(options(page)).toHaveCount(1);
	await expect(options(page).locator(".composer-completion-handle")).toHaveCount(0);
});

test("a picked member is sent as a mention", async ({ page }) => {
	const api = await open(page, group);
	const input = page.locator("textarea.composer-text");
	await input.fill("@林");
	await options(page).filter({ hasText: "林小满" }).click();
	await expect(input).toHaveValue("@林小满 ");
	await input.pressSequentially("请看一下");
	await page.getByRole("button", { name: /发送|Send/ }).click();
	await expect.poll(() => api.sent[0]).toMatchObject({ mentionedMemberIds: [lin.id] });
});

import { expect, test } from "@playwright/test";
import type { FriendRequest } from "@yonder/protocol";
import { conversation, isolateChat, message, person } from "./chat-fixture.ts";

for (const mobile of [false, true]) {
	test(`friend request shares accepted state across contacts and notifications (${mobile ? "mobile" : "desktop"})`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
		if (mobile)
			await page.addInitScript(() =>
				Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Linux; Android 14) Mobile" }),
			);
		// The assertions below are English copy; the account's own answer says so.
		await isolateChat(page, { locale: "en" });
		let request: FriendRequest = {
			id: "request-1",
			sender: { ...person, id: "friend", displayName: "Alice", handle: "alice" },
			recipient: person,
			status: "pending",
			createdAt: "2026-11-18T00:00:00Z",
			acceptedAt: null,
			version: 1,
		};
		const notice = {
			...conversation,
			id: "notifications",
			kind: "system" as const,
			isPrimary: false,
			title: null,
			members: [],
			lastMessage: { id: "notice-01", type: "text" as const, body: "好友申请", createdAt: request.createdAt },
		};
		await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, notice] } }));
		await page.route("**/v1/conversations/notifications/messages*", (route) =>
			route.fulfill({
				json: {
					items: [{ ...message("notice-01", "好友申请"), conversationId: notice.id, friendRequestId: request.id }],
					nextCursor: null,
					hasMore: false,
				},
			}),
		);
		await page.route("**/v1/friend-requests**", (route) => {
			const path = new URL(route.request().url()).pathname;
			if (path.endsWith("/accept")) {
				request = { ...request, status: "accepted", acceptedAt: "2026-11-18T00:01:00Z", version: 2 };
				return route.fulfill({ json: { request, conversation } });
			}
			return route.fulfill({ json: path.endsWith("/friend-requests") ? { items: [request] } : { request } });
		});
		await page.goto("/messages/notifications");
		await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
		await expect(page.locator("textarea")).toHaveCount(0);
		await page.getByRole("button", { name: "Accept", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: "Accepted" })).toBeVisible();
		const navigation = page.getByRole("navigation", { name: "Main navigation" });
		if (mobile) {
			await page.goto("/messages");
			await expect(navigation.getByRole("button", { name: "Contacts", exact: true })).toHaveCount(0);
			await page.getByRole("button", { name: "New chat", exact: true }).click();
			await page.getByRole("menuitem", { name: "Contacts", exact: true }).click();
			await expect(page).toHaveURL(/\/messages$/);
		} else {
			await navigation.getByRole("button", { name: "Contacts", exact: true }).click();
			await expect(page).toHaveURL(/\/contacts$/);
		}
		const contacts = mobile
			? page.getByRole("dialog", { name: "Contacts", exact: true })
			: page.getByRole("complementary");
		await expect(contacts.getByRole("status").filter({ hasText: "Accepted" })).toBeVisible();
		await expect(contacts.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
		// Contacts remain empty; historical acceptance is not inferred from the contact list.
	});
}

test("desktop Contacts keeps its selected tab across widths and navigation", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await isolateChat(page);
	const contact = { ...person, id: "contact-alice", handle: "alice", displayName: "林晓" };
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [contact] } }));
	await page.route("**/v1/members/alice", (route) =>
		route.fulfill({
			json: { card: { ...contact, owner: null }, relation: "contact", memberId: contact.id, conversationId: null },
		}),
	);
	await page.goto("/tasks");

	const rail = page.getByRole("navigation", { name: "主导航" });
	const contacts = rail.getByRole("button", { name: "联系人", exact: true });
	await contacts.click();
	await expect(page).toHaveURL(/\/contacts$/);
	const list = page.getByRole("complementary");
	const row = list.getByRole("button", { name: /林晓/ });
	for (const [width, mode] of [
		[1440, "wide"],
		[800, "medium"],
		[500, "compact"],
	] as const) {
		await page.setViewportSize({ width, height: 900 });
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", mode);
		await expect(contacts).toHaveAttribute("aria-current", "page");
		await expect(list.getByRole("heading", { name: "联系人", exact: true })).toBeVisible();
		await expect(row).toBeVisible();
		await expect(page.getByRole("dialog", { name: "联系人", exact: true })).toHaveCount(0);
	}
	await row.click();
	await expect(page).toHaveURL(/\/@alice$/);
	await expect(page.getByText("林晓", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page).toHaveURL(/\/contacts$/);
	await expect(contacts).toHaveAttribute("aria-current", "page");
	await page.reload();
	await expect(row).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(rail.getByRole("button", { name: "任务", exact: true })).toHaveAttribute("aria-current", "page");
});

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
		const history: FriendRequest = {
			...request,
			id: "request-history",
			sender: { ...request.sender, id: "history-friend", handle: "charlie", displayName: "Charlie" },
			status: "accepted",
			acceptedAt: "2026-11-18T00:01:00Z",
		};
		await page.route("**/v1/contacts", (route) =>
			route.fulfill({ json: { items: request.status === "accepted" ? [request.sender] : [] } }),
		);
		await page.route("**/v1/members/alice", (route) =>
			route.fulfill({
				json: { card: { ...request.sender, owner: null }, relation: "contact", memberId: request.sender.id },
			}),
		);
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
			return route.fulfill({
				json: path.endsWith("/friend-requests")
					? { items: [history, request] }
					: { request: path.endsWith(history.id) ? history : request },
			});
		});
		await page.goto("/messages/notifications");
		await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
		await expect(page.locator("textarea")).toHaveCount(0);
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
		const contactsTab = contacts.getByRole("radio", { name: "Contacts", exact: true });
		const requestsTab = contacts.getByRole("radio", { name: "Friend requests", exact: true });
		const alice = contacts.getByRole("button", { name: /Alice/ });
		const accept = contacts.getByRole("button", { name: "Accept", exact: true });
		const accepted = contacts.getByRole("status").filter({ hasText: "Accepted" });
		await expect(contactsTab).toBeChecked();
		await expect(contacts.getByText("No contacts yet")).toBeVisible();
		await expect(accept).toHaveCount(0);
		await expect(accepted).toHaveCount(0);
		if (mobile) await expect(contacts.getByRole("button", { name: "Back", exact: true })).toBeVisible();

		await requestsTab.click();
		await expect(requestsTab).toBeChecked();
		await expect(contacts.locator("section").first()).toContainText("Alice");
		await expect(accepted).toHaveCount(1);
		await accept.click();
		await expect(requestsTab).toBeChecked();
		await expect(accepted).toHaveCount(2);

		await contactsTab.click();
		await expect(alice).toBeVisible();
		await expect(accepted).toHaveCount(0);
		await expect(contacts.getByText("Charlie")).toHaveCount(0);
		await alice.click();
		await expect(page).toHaveURL(mobile ? /\/@alice$/ : /\/contacts\/profile\/alice$/);
		await expect(page.getByRole("main").getByText("Alice", { exact: true })).toBeVisible();

		await page.goto("/messages/notifications");
		await expect(page.getByRole("status").filter({ hasText: "Accepted" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
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
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(page.getByText("选择联系人查看名片")).toBeVisible();
	await row.click();
	await expect(page).toHaveURL(/\/contacts\/profile\/alice$/);
	await expect(row).toBeVisible();
	await expect(page.getByRole("main").getByText("林晓", { exact: true })).toBeVisible();

	await list.getByRole("radio", { name: "好友申请", exact: true }).click();
	await expect(page).toHaveURL(/\/contacts$/);
	await expect(page.getByRole("main").getByText("林晓", { exact: true })).toHaveCount(0);
	await expect(page.getByText("选择联系人查看名片")).toHaveCount(0);
	await expect(list.getByText("暂无好友申请")).toBeVisible();

	await list.getByRole("radio", { name: "联系人", exact: true }).click();
	await page.setViewportSize({ width: 500, height: 900 });
	await row.click();
	await expect(page).toHaveURL(/\/contacts\/profile\/alice$/);
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

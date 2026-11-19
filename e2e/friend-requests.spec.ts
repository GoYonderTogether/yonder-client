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
		await isolateChat(page);
		await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
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
		if (mobile) {
			await page.goto("/messages");
			await page.getByRole("button", { name: "New chat", exact: true }).click();
			await page.getByRole("menuitem", { name: "Contacts", exact: true }).click();
		} else await page.getByRole("button", { name: "Contacts", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Contacts", exact: true });
		await expect(dialog.getByRole("status").filter({ hasText: "Accepted" })).toBeVisible();
		await expect(dialog.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
		// Contacts remain empty; historical acceptance is not inferred from the contact list.
	});
}

import { devices, expect, test } from "@playwright/test";
import type { Conversation } from "@yonder/protocol";
import { conversation, isolateChat } from "./chat-fixture.ts";

const pinned = {
	...conversation,
	id: "pinned-team",
	kind: "group",
	isPrimary: false,
	pinned: true,
	muted: true,
	unreadCount: 3,
	title: "设计小组",
} satisfies Conversation;
const normal = { ...pinned, id: "regular-team", pinned: false, muted: false, unreadCount: 0, title: "产品讨论" };

for (const phone of [false, true]) {
	test.describe(phone ? "phone" : "desktop", () => {
		test.use(
			phone
				? {
						viewport: devices["iPhone 13"].viewport,
						userAgent: devices["iPhone 13"].userAgent,
						isMobile: true,
						hasTouch: true,
					}
				: { viewport: { width: 1440, height: 900 } },
		);

		test("the pinned tint keeps unread, active selection and pin actions distinct", async ({ page }, info) => {
			await isolateChat(page, { items: [] });
			const items = [normal, pinned, conversation];
			const changes: boolean[] = [];
			await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items } }));
			await page.route(`**/v1/conversations/${pinned.id}/preferences`, (route) => {
				const { pinned: next } = route.request().postDataJSON();
				changes.push(next);
				items[1] = { ...pinned, pinned: next };
				return route.fulfill({ json: { ok: true } });
			});
			await page.goto("/messages");
			const list = page.getByRole("list", { name: "消息", exact: true });
			const pinnedRow = list.getByRole("button", { name: /设计小组/ });
			const normalRow = list.getByRole("button", { name: /产品讨论/ });
			const tint = "rgba(46, 50, 56, 0.05)";
			await expect(pinnedRow).toHaveCSS("background-color", tint);
			await expect(normalRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(list.getByRole("listitem").first()).toContainText("设计小组");
			await expect(pinnedRow.locator(".lucide-pin")).toHaveCount(0);
			await expect(pinnedRow).toHaveAccessibleDescription("置顶");
			await expect(pinnedRow.locator(".lucide-bell-off")).toBeVisible();
			await expect(pinnedRow.getByRole("img", { name: "3 条未读消息" })).toBeVisible();
			await page.screenshot({
				path: info.outputPath(phone ? "pinned-list-mobile.png" : "pinned-list-desktop.png"),
				animations: "disabled",
			});

			if (!phone) {
				await pinnedRow.hover();
				await expect(pinnedRow).toHaveCSS("background-color", "rgba(46, 50, 56, 0.09)");
				await pinnedRow.click();
				await expect(pinnedRow).toHaveAttribute("aria-current", "true");
				await expect(pinnedRow).toHaveCSS("background-color", "rgba(46, 50, 56, 0.13)");
				await page.goto("/messages");
			}
			await pinnedRow.press("Shift+F10");
			await list.getByRole("button", { name: "取消置顶", exact: true }).click();
			if (!phone) await page.mouse.move(0, 0);
			await expect(pinnedRow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(list.getByRole("listitem").first()).toContainText(phone ? normal.title : "界面验收 BOT");
			await pinnedRow.press("Shift+F10");
			await list.getByRole("button", { name: "置顶会话", exact: true }).click();
			if (!phone) await page.mouse.move(0, 0);
			await expect(pinnedRow).toHaveCSS("background-color", tint);
			await expect(list.getByRole("listitem").first()).toContainText("设计小组");
			expect(changes).toEqual([false, true]);
		});
	});
}

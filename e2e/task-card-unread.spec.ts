import { devices, expect, type Page, test } from "@playwright/test";
import type { ItemDetail } from "@yonder/protocol";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({ ...devices["iPhone 14"], defaultBrowserType: "chromium" });

test("opening a task card clears Main Bot unread across two mobile views; later messages remain unread", async ({
	context,
	page,
}, testInfo) => {
	const task = {
		...message("msg-card-02", ""),
		clientNonce: "task-entry:connector-intake:apple-calendar",
		taskSession: { id: "cnv-intake", title: "Apple Calendar" },
	};
	const taskDetail: ItemDetail = {
		id: task.taskSession.id,
		source: "conversation",
		title: task.taskSession.title,
		state: "failed",
		botMemberId: bot.id,
		conversationId: task.taskSession.id,
		startedAt: "2026-11-24T00:00:00Z",
		endedAt: "2026-11-24T00:01:00Z",
		failureReason: "private-provider-diagnostic",
		result: null,
		instruction: "internal seed fixture",
		steps: [],
		cancellable: false,
		pausable: false,
	};
	const items = [message("msg-owner-01", "我的日历", true), task];
	const second = await context.newPage();
	const readIds: string[] = [];
	let unreadCount = 1;
	let version = 1;
	let muted = false;
	const firstRelay = await isolateChat(page, { items });
	const secondRelay = await isolateChat(second, { items });
	const refresh = () => {
		firstRelay.reloadConversation();
		secondRelay.reloadConversation();
	};
	const installReadFixture = async (surface: Page) => {
		await surface.route("**/v1/conversations", (route) =>
			route.fulfill({ json: { items: [{ ...conversation, unreadCount, version, muted }] } }),
		);
		await surface.route("**/v1/conversations/*/read", async (route) => {
			readIds.push(route.request().postDataJSON().messageId);
			unreadCount = 0;
			version += 1;
			await route.fulfill({ json: { ok: true } });
			refresh();
		});
	};
	for (const surface of [page, second]) await installReadFixture(surface);
	await page.route("**/v1/items/cnv-intake", (route) => route.fulfill({ json: taskDetail }));
	await page.route("**/v1/items/cnv-intake/session", (route) =>
		route.fulfill({
			json: { conversation: { ...conversation, id: taskDetail.id, isPrimary: false, title: taskDetail.title } },
		}),
	);
	await page.route("**/v1/conversations/cnv-intake/messages?*", (route) =>
		route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } }),
	);
	const screenshot = (surface: Page, name: string) =>
		surface.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
	const badge = (surface: Page) => surface.locator("[data-bot-tab]").getByRole("img", { name: /未读/ });
	await second.goto("/messages");
	await expect(badge(second)).toHaveText("1");
	await expect(second.getByRole("list", { name: "消息" }).getByRole("button", { name: /界面验收 BOT/u })).toHaveCount(
		0,
	);
	await screenshot(second, "01-main-bot-count");

	await page.bringToFront();
	await page.goto("/messages/main");
	await expect(page.getByText("Apple Calendar", { exact: true })).toBeVisible();
	await expect.poll(() => readIds).toEqual([task.id]);
	await expect(badge(second)).toHaveCount(0);
	await expect(page.locator('[data-message-id="msg-card-02"]')).toHaveAttribute("data-message-sender", "self");
	await screenshot(page, "04-owner-side-calendar-card");
	await page.getByRole("button", { name: /Apple Calendar/u }).click();
	await expect(page.getByRole("note")).toHaveText("这次没有回复");
	await expect(page.getByText("private-provider-diagnostic")).toHaveCount(0);
	await screenshot(page, "05-safe-task-failure");
	await second.bringToFront();
	await screenshot(second, "02-main-bot-cleared");
	await page.goto("/messages");
	await expect(badge(page)).toHaveCount(0);

	const reply = message("msg-reply-03", "之后的新消息");
	items.push(reply);
	unreadCount = 1;
	version += 1;
	secondRelay.create(reply);
	refresh();
	await expect(badge(second)).toHaveText("1");
	expect(readIds).toEqual([task.id]);
	muted = true;
	version += 1;
	refresh();
	await expect(badge(second)).toHaveClass(/color-danger/u);
	await expect(badge(second).locator(".sr-only")).toHaveCount(1);
	await screenshot(second, "03-muted-red-dot");
});

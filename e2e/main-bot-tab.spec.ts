import { expect, test } from "@playwright/test";
import { bodies, bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test.use({
	viewport: { width: 320, height: 700 },
	isMobile: true,
	hasTouch: true,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});

test("the first phone tab opens the existing primary chat and truncates only the visible label", async ({
	page,
}, testInfo) => {
	await isolateChat(page);
	let unreadCount = 1;
	const muted = {
		...conversation,
		id: "muted-chat",
		title: "免打扰会话",
		kind: "group",
		isPrimary: false,
		muted: true,
		pinned: false,
		unreadCount: 3,
	};
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({ json: { items: [{ ...conversation, unreadCount }, muted] } }),
	);
	await page.route(`**/v1/conversations/${conversation.id}/read`, (route) => {
		unreadCount = 0;
		return route.fulfill({ json: { ok: true } });
	});
	const longName = "甲乙丙丁戊🧑🏼‍🚀庚辛壬癸";
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: person,
				bot: { ...bot, displayName: longName },
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	await page.goto("/messages");
	const nav = page.getByRole("navigation", { name: "主导航" });
	const mainBot = nav.getByRole("button", { name: longName, exact: true });
	const messagesTab = nav.getByRole("button", { name: "消息", exact: true });
	await expect(mainBot).toBeVisible();
	await expect(nav.getByRole("button").first()).toHaveAccessibleName(longName);
	await expect(mainBot.getByText("甲乙丙丁戊🧑🏼‍🚀…", { exact: true })).toBeVisible();
	const mainRow = page.getByRole("list", { name: "消息" }).getByRole("button", { name: /界面验收 BOT/ });
	await expect(mainRow).toHaveCount(0);
	const primaryBadge = mainBot.getByRole("img", { name: /1 条未读消息/ });
	const mutedBadge = page.getByRole("button", { name: /免打扰会话/ }).getByRole("img", { name: /3 条未读消息/ });
	await expect(primaryBadge).toHaveText("1");
	await expect(mutedBadge).toBeVisible();
	await expect(mutedBadge.locator(".sr-only")).toHaveText("3 条未读消息");
	await expect(messagesTab.getByRole("img", { name: /未读消息/ })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("phone-unread-dots.png") });

	const read = page.waitForRequest((request) => request.url().endsWith(`/conversations/${conversation.id}/read`));
	await mainBot.click();
	expect((await read).postDataJSON()).toEqual({ messageId: "message-02" });
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	await expect(mainBot).toHaveAttribute("aria-current", "page");
	await expect(messagesTab).not.toHaveAttribute("aria-current", "page");
	await expect(mainBot.getByRole("img", { name: /未读消息/ })).toHaveCount(0);
	const header = page.locator('[data-page-layer="detail"] [data-floating-frame-header]');
	// A tab root: the account avatar on the left, as on every other tab, and no way "back".
	await expect(header.getByRole("button", { name: "我", exact: true })).toBeVisible();
	await expect(header.getByRole("button", { name: "设置", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
	await messagesTab.click();
	await expect(mainRow).toHaveCount(0);
	await expect(primaryBadge).toHaveCount(0);
	await expect(mutedBadge).toBeVisible();
	await nav.getByRole("button", { name: "任务", exact: true }).click();
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(mainBot).toBeVisible();

	await page.goto(`/messages/${conversation.id}`);
	await expect(nav.getByRole("button").first()).toHaveAccessibleName(longName);
	await expect(nav.getByRole("button").first()).toHaveAttribute("aria-current", "page");
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("only normal chats contribute to the phone Messages tab dot", async ({ page }) => {
	await isolateChat(page);
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({
			json: {
				items: [
					{ ...conversation, muted: true, unreadCount: 3 },
					{ ...conversation, id: "regular-chat", title: "普通群聊", kind: "group", isPrimary: false, unreadCount: 4 },
				],
			},
		}),
	);
	await page.goto("/messages");
	const primary = page.getByRole("list", { name: "消息" }).getByRole("button", { name: /界面验收 BOT/ });
	await expect(primary).toHaveCount(0);
	const primaryDot = page.locator("[data-bot-tab]").getByRole("img", { name: /3 条未读消息/ });
	await expect(primaryDot).toBeVisible();
	await expect(primaryDot.locator(".sr-only")).toHaveText("3 条未读消息");
	const normal = page.getByRole("button", { name: /普通群聊/ });
	await expect(normal.getByRole("img", { name: /4 条未读消息/ })).toHaveText("4");
	const messagesTab = page
		.getByRole("navigation", { name: "主导航" })
		.getByRole("button", { name: "消息", exact: true });
	const messagesDot = messagesTab.getByRole("img", { name: /4 条未读消息/ });
	await expect(messagesDot).toBeVisible();
	await expect(messagesDot.locator(".sr-only")).toHaveText("4 条未读消息");
});

test("iPhone conversation notifications only show the mute switch", async ({ page }) => {
	await isolateChat(page);
	await page.addInitScript(() => {
		localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-notification-settings");
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			value: {
				invoke: async (command: string) => {
					if (command === "plugin:yonder-notifications|permission_status") return "denied";
					return null;
				},
				transformCallback: () => 1,
				unregisterCallback: () => undefined,
				metadata: { currentWindow: { label: "main" } },
			},
		});
	});
	let muted = false;
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [{ ...conversation, muted }] } }));
	await page.route(`**/v1/conversations/${conversation.id}/preferences`, (route) => {
		muted = route.request().postDataJSON().muted;
		return route.fulfill({ json: { ok: true } });
	});
	await page.goto("/messages/main");
	await page.locator("[data-chat-agent-avatar]").click();
	const toggle = page.getByRole("switch", { name: "消息免打扰" });
	await expect(toggle).toBeVisible();
	const card = toggle.locator("xpath=ancestor::section[1]");
	await expect(card.locator("li")).toHaveCount(1);
	await expect(card.getByText(/允许系统通知|打开通知设置|设备或浏览器/u)).toHaveCount(0);
	const saved = page.waitForRequest(
		(request) => request.method() === "PATCH" && request.url().endsWith("/preferences"),
	);
	await toggle.click();
	expect((await saved).postDataJSON()).toEqual({ muted: true });
	await expect(toggle).toBeChecked();
});

test("the selected nickname labels the first tab on an existing conversation deep link", async ({ page }) => {
	await isolateChat(page);
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: person,
				bot: { ...bot, nicknames: ["栗子"], selectedNickname: "栗子" },
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	await page.goto(`/messages/${conversation.id}`);
	const firstTab = page.getByRole("navigation", { name: "主导航" }).getByRole("button").first();
	await expect(firstTab).toHaveAccessibleName("栗子");
	await expect(firstTab).toHaveText("栗子");
	await expect(firstTab).toHaveAttribute("aria-current", "page");
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
});

test("leaving the main Bot tab removes its root without a detail exit animation", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await isolateChat(page);
	await page.goto("/messages/main");
	const nav = page.getByRole("navigation", { name: "主导航" });
	const mainBot = nav.getByRole("button", { name: bot.displayName, exact: true });
	const root = page.locator('[data-page-layer="detail"]').filter({ has: page.locator("[data-chat-agent-title]") });

	for (const title of ["消息", "任务", "记忆"]) {
		await expect(root).toBeVisible();
		const previousRoot = await root.elementHandle();
		const tab = nav.getByRole("button", { name: title, exact: true });
		await tab.click();
		// Observe the tab commit, then check the old layer immediately rather than waiting out an exit.
		await expect(tab).toHaveAttribute("aria-current", "page");
		expect(await previousRoot.evaluate((element) => element.isConnected)).toBe(false);
		await mainBot.click();
		await expect(mainBot).toHaveAttribute("aria-current", "page");
		await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	}
});

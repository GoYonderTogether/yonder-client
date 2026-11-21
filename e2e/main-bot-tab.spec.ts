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
	await expect(mainRow).toBeVisible();
	await expect(mainRow.locator("[data-bot-label]")).toHaveText("主 Bot");
	const primaryBadge = mainRow.getByRole("img", { name: /1 条未读消息/ });
	const mutedBadge = page.getByRole("button", { name: /免打扰会话/ }).getByRole("img", { name: /3 条未读消息/ });
	await expect(primaryBadge).toHaveCSS("width", "8px");
	await expect(primaryBadge).toHaveCSS("background-color", "rgb(213, 37, 21)");
	await expect(mutedBadge).toHaveCSS("width", "8px");
	await expect(mutedBadge).toHaveCSS("background-color", "rgba(28, 31, 35, 0.62)");
	await expect(mainBot.getByRole("img", { name: /未读消息/ })).toHaveCSS("width", "8px");
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
	await expect(header.getByRole("button", { name: "设置", exact: true })).toBeVisible();
	await expect(header.getByRole("button", { name: "我", exact: true })).toHaveCount(0);
	await messagesTab.click();
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
	await expect(primary.getByRole("img", { name: /3 条未读消息/ })).toHaveCSS(
		"background-color",
		"rgba(28, 31, 35, 0.62)",
	);
	const normal = page.getByRole("button", { name: /普通群聊/ });
	await expect(normal.getByRole("img", { name: /4 条未读消息/ })).toHaveText("4");
	const messagesTab = page
		.getByRole("navigation", { name: "主导航" })
		.getByRole("button", { name: "消息", exact: true });
	await expect(messagesTab.getByRole("img", { name: /4 条未读消息/ })).toHaveCSS("width", "8px");
});

test("iPhone chat notification settings request permission and reopen System Settings after denial", async ({
	page,
}) => {
	await isolateChat(page);
	await page.addInitScript(() => {
		let permission = "default";
		localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-notification-settings");
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			value: {
				invoke: async (command: string) => {
					switch (command) {
						case "plugin:yonder-notifications|permission_status":
							return permission;
						case "plugin:yonder-notifications|request_permission":
							permission = "denied";
							return false;
						case "plugin:yonder-notifications|open_settings":
							permission = "granted";
							return true;
						default:
							return null;
					}
				},
				transformCallback: () => 1,
				unregisterCallback: () => undefined,
				metadata: { currentWindow: { label: "main" } },
			},
		});
	});
	await page.goto("/messages/main");
	await page.locator("[data-chat-agent-avatar]").click();
	const allow = page.getByRole("button", { name: "允许系统通知" });
	await allow.click();
	const settings = page.getByRole("button", { name: "打开通知设置" });
	await settings.click();
	await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
	await expect(settings).toHaveCount(0);
	await expect(allow).toHaveCount(0);
	await expect(page.getByRole("switch", { name: "消息免打扰" })).toBeVisible();
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

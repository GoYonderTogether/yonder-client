import { expect, test } from "@playwright/test";
import { bodies, bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test.use({
	viewport: { width: 320, height: 700 },
	isMobile: true,
	hasTouch: true,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});

test("the first phone tab opens the existing primary chat and truncates only the visible label", async ({ page }) => {
	await isolateChat(page);
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({ json: { items: [{ ...conversation, unreadCount: 1 }] } }),
	);
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
	await expect(mainBot).toBeVisible();
	await expect(nav.getByRole("button").first()).toHaveAccessibleName(longName);
	await expect(mainBot.getByText("甲乙丙丁戊🧑🏼‍🚀…", { exact: true })).toBeVisible();
	const mainRow = page.getByRole("list", { name: "消息" }).getByRole("button", { name: /界面验收 BOT/ });
	await expect(mainRow).toBeVisible();
	await expect(mainRow.locator("[data-bot-label]")).toHaveText("主 Bot");
	await expect(mainRow.getByRole("img", { name: /未读消息/ })).toHaveCount(0);
	await expect(mainBot.getByRole("img", { name: /未读消息/ })).toBeVisible();

	await mainBot.click();
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	await expect(mainBot).toHaveAttribute("aria-current", "page");
	await expect(nav.getByRole("button", { name: "消息", exact: true })).not.toHaveAttribute("aria-current", "page");
	const header = page.locator('[data-page-layer="detail"] [data-floating-frame-header]');
	await expect(header.getByRole("button", { name: "设置", exact: true })).toBeVisible();
	await expect(header.getByRole("button", { name: "我", exact: true })).toHaveCount(0);
	await nav.getByRole("button", { name: "任务", exact: true }).click();
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(mainBot).toBeVisible();

	await page.goto(`/messages/${conversation.id}`);
	await expect(nav.getByRole("button").first()).toHaveAccessibleName(longName);
	await expect(nav.getByRole("button").first()).toHaveAttribute("aria-current", "page");
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

import { devices, expect, type Page, test } from "@playwright/test";
import { bodies, bot, conversation, isolateChat } from "./chat-fixture.ts";

const itemPreset = "帮我做一件事：";
const goalPreset = "帮我推进这个目标：";
const composerName = /^对 界面验收/;
const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

/**
 * 「+」 is one button on both segments (2026-11-24, Meta Muse as the reference): it asks the main Bot
 * with the sentence the segment starts, so a test only has to click it.
 */
async function openPreset(page: Page) {
	await page.getByRole("button", { name: "新建", exact: true }).click();
}

async function swipe(page: Page, x: number, y: number, dy: number) {
	const session = await page.context().newCDPSession(page);
	try {
		await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
		for (const fraction of [0.25, 0.5, 0.75, 1]) {
			await session.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x, y: y + dy * fraction }],
			});
		}
		await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	} finally {
		await session.detach();
	}
}

test.describe("phone", () => {
	test.use({
		...phone,
		reducedMotion: "reduce",
	});

	test("prompt preview follows the main Bot flow and supports swipe in both directions", async ({ page }, info) => {
		const api = await isolateChat(page);
		await page.goto("/tasks/scheduled");
		const drawer = page.getByRole("dialog", { name: bot.displayName, exact: true });
		const input = drawer.getByRole("textbox", { name: composerName });
		const handle = drawer.getByRole("button", { name: "展开主 Bot 对话" });
		const botTab = page.getByRole("button", { name: bot.displayName, exact: true });
		await openPreset(page);
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await expect(input).toHaveValue(goalPreset);
		await expect(drawer.getByText(bodies.question, { exact: true })).toBeVisible();
		const identity = drawer.locator("[data-chat-agent-title]");
		await expect(identity.locator("[data-avatar-fallback]")).toBeVisible();
		await expect(identity.locator("[data-chat-agent-name]")).toContainText(bot.displayName);
		await expect(
			drawer
				.getByRole("button", { name: "关闭", exact: true })
				.and(page.locator("button:not([data-overlay-backdrop])")),
		).toHaveCount(0);
		await expect(drawer.getByRole("button", { name: "设置", exact: true })).toHaveCount(0);
		const box = await drawer.boundingBox();
		const viewport = page.viewportSize();
		if (!box || !viewport) throw new Error("The mobile prompt preview must be visible in the viewport");
		expect(box.height / viewport.height).toBeCloseTo(0.77, 2);
		expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
		await page.screenshot({ path: info.outputPath("mobile-preview.png"), animations: "disabled", scale: "css" });

		// Start and end in the exposed scrim, so the swipe cannot turn into a click on the handle.
		await swipe(page, viewport.width / 2, box.y / 4, box.y / 2);
		await expect(drawer).toHaveCount(0);
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		// 「事项」 starts an item sentence instead, from the same button.
		await page.getByRole("radio", { name: "事项", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks$/);
		await openPreset(page);
		await expect(input).toHaveValue(itemPreset);

		const body = `${itemPreset}每周五提醒我写周报`;
		await input.fill(body);
		const grip = await handle.boundingBox();
		if (!grip) throw new Error("The mobile prompt preview must have a visible drag handle");
		const x = grip.x + grip.width / 2;
		const y = grip.y + grip.height / 2;
		await swipe(page, x, y, -128);
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(drawer).toHaveCount(0);
		await expect(botTab).toHaveAttribute("aria-current", "page");
		// The main Bot is a tab root: the account avatar on the left, as on every other tab, and its
		// own settings on the right rather than the frame's.
		await expect(page.getByRole("button", { name: "我", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Bot 设置", exact: true })).toBeVisible();
		await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(body);
		expect(api.sent).toEqual([]);
		await page.screenshot({ path: info.outputPath("mobile-main-tab.png"), animations: "disabled", scale: "css" });

		await page.goBack();
		await expect(page).toHaveURL(/\/tasks$/);
		// The draft already has words, so the preset never overwrites it.
		await openPreset(page);
		await expect(input).toHaveValue(body);
		const sent = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === `/v1/conversations/${conversation.id}/messages`,
		);
		await drawer.getByRole("button", { name: "发送", exact: true }).click();
		await sent;
		await expect(drawer.getByRole("log").getByText(body, { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/tasks$/);
		expect(api.sent).toEqual([expect.objectContaining({ body, type: "text" })]);
		await page.keyboard.press("Escape");
		await expect(drawer).toHaveCount(0);
		await botTab.click();
		await expect(page.getByRole("log").getByText(body, { exact: true })).toBeVisible();
	});

	test("「+」 starts the sentence of the segment on screen and never sends it", async ({ page }) => {
		const api = await isolateChat(page);
		await page.goto("/tasks");
		const drawer = page.getByRole("dialog", { name: bot.displayName, exact: true });
		await openPreset(page);
		await expect(page).toHaveURL(/\/tasks$/);
		await expect(drawer.getByRole("textbox", { name: composerName })).toHaveValue(itemPreset);
		// Leaving the preview restores the empty draft, so the other segment starts its own sentence.
		await page.keyboard.press("Escape");
		await expect(drawer).toHaveCount(0);
		await page.getByRole("radio", { name: "目标", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await openPreset(page);
		await expect(drawer.getByRole("textbox", { name: composerName })).toHaveValue(goalPreset);
		await drawer.getByRole("button", { name: "展开主 Bot 对话" }).press("Enter");
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(goalPreset);
		expect(api.sent).toEqual([]);
	});

	test("a typed main Bot draft is left exactly as it is", async ({ page }) => {
		const api = await isolateChat(page);
		await page.goto("/messages/main");
		const original = "留在主 Bot 里的未发送草稿";
		await page.getByRole("textbox", { name: /^对 界面验收/ }).fill(original);
		await page.getByRole("button", { name: "任务", exact: true }).click();
		await openPreset(page);
		await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue(original);
		expect(api.sent).toEqual([]);
	});
});

test.describe("desktop", () => {
	test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

	for (const [segment, phrase] of [
		["目标", goalPreset],
		["事项", itemPreset],
	] as const) {
		test(`「+」 on 「${segment}」 fills the main Bot composer in the desktop layout`, async ({ page }, info) => {
			const api = await isolateChat(page);
			await page.goto(segment === "目标" ? "/tasks/scheduled" : "/tasks");
			await openPreset(page);
			await expect(page).toHaveURL(/\/messages\/main$/);
			await expect(page.locator('[data-layout-mode="wide"]')).toBeVisible();
			await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(phrase);
			await expect(page.getByRole("log").getByText(bodies.question, { exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "任务", exact: true })).toBeVisible();
			expect(api.sent).toEqual([]);
			await page.screenshot({ path: info.outputPath(`desktop-main-bot-${segment}.png`), animations: "disabled" });
		});
	}
});

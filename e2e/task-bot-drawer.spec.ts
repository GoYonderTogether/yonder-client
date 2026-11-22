import { devices, expect, type Page, test } from "@playwright/test";
import { bodies, bot, conversation, isolateChat } from "./chat-fixture.ts";

const goalAction = "新建目标";
const scheduleAction = "新建定时任务";
const goalPreset = "帮我推进这个目标：";
const schedulePreset = "请帮我创建一个定时任务，";
const composerName = /^对 界面验收/;
const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

async function openPreset(page: Page, action: string) {
	await page.getByRole("button", { name: goalAction }).click();
	await page.getByRole("menuitem", { name: action, exact: true }).click();
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
		await openPreset(page, scheduleAction);
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await expect(input).toHaveValue(schedulePreset);
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
		await expect(page.locator("[data-preset-flight]")).toHaveCount(0);
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
		await openPreset(page, goalAction);
		await expect(input).toHaveValue(goalPreset);

		const body = `${goalPreset}每周五提醒我写周报`;
		await input.fill(body);
		const grip = await handle.boundingBox();
		if (!grip) throw new Error("The mobile prompt preview must have a visible drag handle");
		const x = grip.x + grip.width / 2;
		const y = grip.y + grip.height / 2;
		await swipe(page, x, y, 128);
		await expect(drawer).toHaveCount(0);
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await openPreset(page, scheduleAction);
		await expect(input).toHaveValue(body);
		await swipe(page, x, y, -128);
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(drawer).toHaveCount(0);
		await expect(botTab).toHaveAttribute("aria-current", "page");
		await expect(page.getByRole("button", { name: "设置", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Bot 设置", exact: true })).toBeVisible();
		await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(body);
		expect(api.sent).toEqual([]);
		await page.screenshot({ path: info.outputPath("mobile-main-tab.png"), animations: "disabled", scale: "css" });

		await page.goBack();
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await openPreset(page, scheduleAction);
		await expect(input).toHaveValue(body);
		const sent = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === `/v1/conversations/${conversation.id}/messages`,
		);
		await drawer.getByRole("button", { name: "发送", exact: true }).click();
		await sent;
		await expect(drawer.getByRole("log").getByText(body, { exact: true })).toBeVisible();
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		expect(api.sent).toEqual([expect.objectContaining({ body, type: "text" })]);
		await page.keyboard.press("Escape");
		await expect(drawer).toHaveCount(0);
		await botTab.click();
		await expect(page.getByRole("log").getByText(body, { exact: true })).toBeVisible();
	});

	test("the goal action travels from its menu label to the main Bot tab", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await isolateChat(page);
		await page.goto("/tasks/scheduled");
		await page.getByRole("button", { name: goalAction }).click();
		const action = page.getByRole("menuitem", { name: goalAction });
		const label = await action.getByText(goalAction).boundingBox();
		const tab = await page.locator("[data-bot-tab]").boundingBox();
		if (!label || !tab) throw new Error("The menu label and destination tab must both be visible");
		const samples = page.evaluate(
			() =>
				new Promise<{ x: number; y: number; text: string | null }[]>((resolve) => {
					const points: { x: number; y: number; text: string | null }[] = [];
					const start = performance.now();
					const sample = () => {
						const flight = document.querySelector("[data-preset-flight]");
						if (flight) {
							const { x, y, width, height } = flight.getBoundingClientRect();
							points.push({ x: x + width / 2, y: y + height / 2, text: flight.textContent });
						}
						if ((!flight && points.length) || performance.now() - start > 4000) resolve(points);
						else requestAnimationFrame(sample);
					};
					requestAnimationFrame(sample);
				}),
		);
		const [points] = await Promise.all([samples, action.click()]);
		const first = points[0];
		const last = points.at(-1);
		if (!first || !last) throw new Error("The prompt flight must render for more than one frame");
		expect(points.length).toBeGreaterThan(2);
		expect(first.text).toBe(goalAction);
		expect(Math.hypot(first.x - (label.x + label.width / 2), first.y - (label.y + label.height / 2))).toBeLessThan(95);
		expect(Math.hypot(last.x - (tab.x + tab.width / 2), last.y - (tab.y + tab.height / 2))).toBeLessThan(95);
		const dialog = page.getByRole("dialog", { name: bot.displayName, exact: true });
		await expect(dialog.getByRole("textbox", { name: composerName })).toHaveValue(goalPreset);
		await dialog.getByRole("button", { name: "展开主 Bot 对话" }).press("Enter");
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(goalPreset);
	});

	test("the new item starts with its own draft and leaves the existing main Bot draft intact", async ({ page }) => {
		const api = await isolateChat(page);
		await page.goto("/messages/main");
		const original = "留在主 Bot 里的未发送草稿";
		await page.getByRole("textbox", { name: /^对 界面验收/ }).fill(original);
		await page.getByRole("button", { name: "任务", exact: true }).click();
		await page.getByRole("button", { name: "新建事项" }).click();
		await expect(page).toHaveURL(/\/tasks\/new$/);
		await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue("");
		await page.getByRole("textbox", { name: /^对 界面验收/ }).fill("事项里的未发送草稿");
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks$/);
		await page.getByRole("button", { name: bot.displayName, exact: true }).click();
		await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue(original);
		expect(api.sent).toEqual([]);
	});

	test("a new task preserves the active meeting controls and blocks short dictation", async ({ page }) => {
		await isolateChat(page, { items: [] });
		await page.goto("/messages/main");
		await page.getByRole("button", { name: "添加附件" }).click();
		await page.getByRole("button", { name: "录音笔记", exact: true }).click();
		const stop = page.getByRole("button", { name: "结束录音", exact: true });
		await expect(stop).toBeVisible();
		await page.getByRole("button", { name: "任务", exact: true }).click();
		await page.getByRole("button", { name: "新建事项" }).click();
		await expect(page).toHaveURL(/\/tasks\/new$/);
		await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue("");
		await expect(page.getByRole("button", { name: "语音输入" })).toBeDisabled();
		await expect(stop).toBeVisible();
		await expect(stop).toHaveCount(1);
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks$/);
		await expect(stop).toBeVisible();
		await stop.click();
		await expect(stop).toHaveCount(0);
	});
});

test.describe("desktop", () => {
	test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

	for (const [action, phrase] of [
		[goalAction, goalPreset],
		[scheduleAction, schedulePreset],
	] as const) {
		test(`${action} fills the main Bot composer in the desktop layout`, async ({ page }, info) => {
			const api = await isolateChat(page);
			await page.goto("/tasks/scheduled");
			await openPreset(page, action);
			await expect(page).toHaveURL(/\/messages\/main$/);
			await expect(page.locator('[data-layout-mode="wide"]')).toBeVisible();
			await expect(page.getByRole("dialog", { name: bot.displayName, exact: true })).toHaveCount(0);
			await expect(page.getByRole("textbox", { name: composerName })).toHaveValue(phrase);
			await expect(page.getByRole("log").getByText(bodies.question, { exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "任务", exact: true })).toBeVisible();
			expect(api.sent).toEqual([]);
			if (action === scheduleAction) {
				await page.screenshot({ path: info.outputPath("desktop-main-bot.png"), animations: "disabled" });
			}
		});
	}
});

import { devices, expect, test } from "@playwright/test";
import { bodies, bot, conversation, isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use({
	...phone,
	reducedMotion: "reduce",
	launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("task actions open the real main Bot chat without leaving the task page", async ({ page }, info) => {
	const api = await isolateChat(page);
	await page.goto("/tasks");
	const drawer = page.getByRole("dialog", { name: bot.displayName });
	const input = drawer.getByRole("textbox", { name: /^对 界面验收/ });
	await page.getByRole("button", { name: "新建事项" }).click();
	await expect(input).toHaveValue("帮我做一件事：");
	await expect(page).toHaveURL(/\/tasks$/);
	await expect(drawer.getByText(bodies.question, { exact: true })).toBeVisible();
	const box = await drawer.boundingBox();
	const viewport = page.viewportSize();
	if (!box || !viewport) throw new Error("The mobile draft drawer must be visible in the viewport");
	expect(box.height / viewport.height).toBeCloseTo(0.7, 2);
	expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
	await drawer.getByRole("button", { name: "关闭" }).click();
	await expect(drawer).toHaveCount(0);
	expect(api.sent).toEqual([]);

	await page.getByRole("radio", { name: "目标", exact: true }).click();
	await page.getByRole("button", { name: "新建目标" }).click();
	await page.getByRole("menuitem", { name: "新建定时任务" }).click();
	await expect(page).toHaveURL(/\/tasks\/scheduled$/);
	await expect(input).toHaveValue("请帮我创建一个定时任务，");
	await page.screenshot({ path: info.outputPath("scheduled-task-drawer.png"), animations: "disabled" });
	await expect(drawer.getByRole("button", { name: "语音输入" })).toHaveCount(0);
	const body = "请帮我创建一个定时任务，每周五提醒我写周报";
	await input.fill(body);
	const sent = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === `/v1/conversations/${conversation.id}/messages`,
	);
	await drawer.getByRole("button", { name: "发送", exact: true }).click();
	await sent;
	await expect(drawer.getByRole("log").getByText(body, { exact: true })).toBeVisible();
	expect(api.sent).toEqual([expect.objectContaining({ body, type: "text" })]);
	await expect(page).toHaveURL(/\/tasks\/scheduled$/);
	await drawer.getByRole("button", { name: "关闭" }).click();
	await page.getByRole("button", { name: bot.displayName, exact: true }).click();
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByRole("log").getByText(body, { exact: true })).toBeVisible();
});

test("an existing main Bot draft survives opening and dismissing the task drawer", async ({ page }) => {
	const api = await isolateChat(page);
	await page.goto("/messages/main");
	const original = "留在主 Bot 里的未发送草稿";
	await page.getByRole("textbox", { name: /^对 界面验收/ }).fill(original);
	await page.getByRole("button", { name: "任务", exact: true }).click();
	await page.getByRole("button", { name: "新建事项" }).click();
	const drawer = page.getByRole("dialog", { name: bot.displayName });
	await expect(drawer.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue(original);
	await page.tap("[role=presentation] > button[aria-label=关闭]", { position: { x: 12, y: 24 } });
	await expect(drawer).toHaveCount(0);
	await expect(page).toHaveURL(/\/tasks$/);
	await page.getByRole("button", { name: bot.displayName, exact: true }).click();
	await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue(original);
	expect(api.sent).toEqual([]);
});

test("the task drawer preserves the active meeting controls and blocks short dictation", async ({ page }) => {
	await isolateChat(page, { items: [] });
	await page.goto("/messages/main");
	await page.getByRole("button", { name: "添加附件" }).click();
	await page.getByRole("button", { name: "会议录音", exact: true }).click();
	const stop = page.getByRole("button", { name: "结束录音", exact: true });
	await expect(stop).toBeVisible();
	await page.getByRole("button", { name: "任务", exact: true }).click();
	await page.getByRole("button", { name: "新建事项" }).click();
	const drawer = page.getByRole("dialog", { name: bot.displayName });
	await drawer.getByRole("textbox", { name: /^对 界面验收/ }).fill("");
	await expect(drawer.getByRole("button", { name: "语音输入" })).toBeDisabled();
	await expect(drawer.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
	await expect(stop).toHaveCount(1);
	await drawer.getByRole("button", { name: "关闭" }).click();
	await expect(drawer).toHaveCount(0);
	await expect(stop).toBeVisible();
	await stop.click();
	await expect(stop).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import type { QuestionCardAction } from "@yonder/protocol";
import { isolateChat, message } from "./chat-fixture.ts";
import {
	authDevices,
	authMessage,
	authRequest,
	cardPhoto,
	cardPhotoPath,
	longDeviceName,
	settleQuestion,
	surveyCard,
	timedCard,
} from "./fixtures/interaction-cards.ts";

test("the device picker wraps names, scrolls and takes consent only after choosing", async ({ page }, info) => {
	await isolateChat(page, {
		items: [message("interaction-input-01", "帮我在电脑上找那份周末计划。", true), authMessage],
	});
	let view = { ...authRequest };
	const confirms: unknown[] = [];
	await page.route("**/v1/connector-requests/interaction-request**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/devices")) return route.fulfill({ json: { items: authDevices } });
		if (path.endsWith("/confirm")) {
			const input = route.request().postDataJSON();
			confirms.push(input);
			const device = authDevices.find((item) => item.id === input.deviceId);
			view = { ...view, state: "dispatched", deviceId: device?.id ?? "", deviceName: device?.name ?? "" };
		}
		return route.fulfill({ json: view });
	});
	await page.goto("/messages/main");
	const card = page.locator('[data-message-id="interaction-auth-02"] [data-interaction-card]');
	const list = card.locator("fieldset.interaction-card-device-list");
	const mac = list.getByRole("radio", { name: "MacBook Pro", exact: true });
	const longDevice = list.getByRole("radio", { name: longDeviceName, exact: true });
	await expect(list.getByRole("radio", { name: "离线的 Mac" })).toHaveCount(0);
	await expect(card.getByRole("button", { name: "允许", exact: true })).toHaveCount(0);
	await mac.check();
	await mac.press("ArrowDown");
	await expect(longDevice).toBeChecked();
	await expect(mac).not.toBeChecked();
	await expect(list).toBeVisible();
	await expect(card.getByText(`允许读取 ${longDeviceName} 上的文件？`, { exact: true })).toBeVisible();
	await expect(card.getByText("用于查找周末计划，权限覆盖该系统账号可访问的全部文件，直至你撤回。")).toBeVisible();
	expect(confirms).toEqual([]);
	const longLabel = list.getByText(longDeviceName, { exact: true });
	expect(
		await longLabel.evaluate((label) => {
			const range = document.createRange();
			range.selectNodeContents(label);
			return range.getClientRects().length;
		}),
	).toBeGreaterThan(1);
	await list.hover();
	await page.mouse.wheel(0, 650);
	await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	expect(await list.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
	await card.screenshot({ path: info.outputPath("authorize-device.png"), animations: "disabled" });
	await card.getByRole("button", { name: "允许", exact: true }).click();
	await expect(card.getByRole("status", { name: "等待设备完成授权" })).toBeVisible();
	expect(confirms).toEqual([{ connectorIds: ["local-files"], deviceId: authDevices[1]?.id }]);
});

test.describe("mobile survey", () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	test("pages a survey, restores a draft, safely retries and displays a quoted reply", async ({ page }, info) => {
		const items = [message("interaction-input-03", "想安排一个轻松的周末。", true), surveyCard];
		await isolateChat(page, { items });
		await page.route(`**/v1/attachments/${cardPhoto.id}/content`, (route) =>
			route.fulfill({ path: cardPhotoPath, contentType: cardPhoto.mimeType }),
		);
		const attempts: QuestionCardAction[] = [];
		await page.route(`**/v1/messages/${surveyCard.id}/question`, async (route) => {
			if (route.request().method() === "GET") return route.fulfill({ json: items[1] });
			const action = route.request().postDataJSON() as QuestionCardAction;
			attempts.push(action);
			if (attempts.length === 1)
				return route.fulfill({ status: 502, json: { error: { code: "internal", message: "retry fixture" } } });
			const result = settleQuestion(surveyCard, action);
			items[1] = result.card;
			if (result.message) items.push(result.message);
			return route.fulfill({ json: result });
		});
		await page.goto("/messages/main");
		const card = page.locator(`[data-message-id="${surveyCard.id}"] [data-interaction-card]`);
		const next = card.getByRole("button", { name: "下一步" });
		const custom = card.getByRole("textbox", { name: "自填" });
		await expect(card.getByText("1 / 3")).toBeVisible();
		await expect
			.poll(() => card.getByRole("img").evaluate((image) => (image as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		await expect(next).toBeDisabled();
		await card.screenshot({ path: info.outputPath("survey-prompt.png"), animations: "disabled" });
		await card.getByText("自填", { exact: true }).tap();
		await custom.fill("先去河畔的早餐铺");
		await next.tap();
		await expect(card.getByText("2 / 3")).toBeVisible();
		await card.getByText("步行路线", { exact: true }).tap();
		await card.getByText("大致预算", { exact: true }).tap();
		await card.getByRole("button", { name: "上一步" }).tap();
		await expect(custom).toHaveValue("先去河畔的早餐铺");
		await next.tap();
		await expect(card.getByRole("checkbox", { name: "大致预算" })).toBeChecked();
		await next.tap();
		await expect(card.getByText("3 / 3")).toBeVisible();
		await card.getByRole("textbox").fill("晚上七点前回家");
		await page.reload();
		await expect(card.getByText("3 / 3")).toBeVisible();
		await expect(card.getByRole("textbox")).toHaveValue("晚上七点前回家");
		await card.getByRole("button", { name: "提交" }).tap();
		await expect(card.getByRole("alert")).toContainText("答复发送失败");
		await expect(card.getByRole("textbox")).toHaveValue("晚上七点前回家");
		await card.getByRole("button", { name: "提交" }).tap();
		await expect(card.getByText("先去河畔的早餐铺")).toBeVisible();
		expect(attempts).toHaveLength(2);
		expect(attempts[1]).toEqual(attempts[0]);
		expect(attempts[0]).toMatchObject({
			action: "answer",
			answers: [
				{ questionId: "route", text: "先去河畔的早餐铺" },
				{ questionId: "preferences", optionIds: ["walking", "budget"] },
				{ questionId: "notes", text: "晚上七点前回家" },
			],
		});
		await expect(card.getByRole("checkbox")).toHaveCount(0);
		await card.getByRole("button", { name: "查看全部回答" }).tap();
		await expect(card.getByText("晚上七点前回家")).toBeVisible();
		await card.getByRole("button", { name: "收起" }).tap();
		const reply = page.locator(`[data-message-id="${surveyCard.id}-reply-10"]`);
		await expect(reply.locator("blockquote")).toContainText("周末想先去哪一站？");
		await expect(reply).toContainText("先去河畔的早餐铺");
		await page.reload();
		await expect(reply.locator("blockquote")).toContainText("周末想先去哪一站？");
		await expect(card.getByText("先去河畔的早餐铺")).toBeVisible();
		await expect
			.poll(() => page.locator('[data-page-layer="detail"]').evaluate((panel) => getComputedStyle(panel).transform))
			.toBe("none");
		await page.screenshot({ path: info.outputPath("survey-answered.png"), animations: "disabled" });
	});
});

test("the countdown never submits a draft, while a later reply remains possible", async ({ page }, info) => {
	await page.clock.install();
	const deadline = new Date(Date.now() + 45_000).toISOString();
	const timed = timedCard(deadline);
	const items = [message("interaction-input-05", "先给我选条周末路线。", true), timed];
	const chat = await isolateChat(page, { items });
	const actions: QuestionCardAction[] = [];
	await page.route(`**/v1/messages/${timed.id}/question`, async (route) => {
		const action = route.request().postDataJSON() as QuestionCardAction;
		actions.push(action);
		const result = settleQuestion(timedCard(deadline, "open"), action, true);
		return route.fulfill({ json: result });
	});
	await page.goto("/messages/main");
	const card = page.locator(`[data-message-id="${timed.id}"] [data-interaction-card]`);
	await expect(card.getByRole("timer")).toBeVisible();
	const composer = page.locator("textarea").first();
	await expect(composer).toBeEditable();
	await card.getByText("自填", { exact: true }).click();
	const custom = card.getByRole("textbox");
	await custom.fill("两条路线都留");
	await page.clock.fastForward(46_000);
	await expect(card.getByText("仍可回复")).toBeVisible();
	expect(actions).toEqual([]);
	const open = timedCard(deadline, "open");
	chat.update(open);
	chat.create(message("interaction-followup-07", "我先按河畔路线拟了一版。"));
	await expect(page.locator('[data-message-id="interaction-followup-07"]')).toContainText("我先按河畔路线拟了一版。");
	await expect(custom).toHaveValue("两条路线都留");
	await page.screenshot({ path: info.outputPath("question-late-available.png"), animations: "disabled" });
	await card.getByRole("button", { name: "回复" }).click();
	await expect(card.getByText("补答")).toBeVisible();
	await expect(card.getByText("两条路线都留")).toBeVisible();
	expect(actions).toHaveLength(1);
});

test("a timely reply settles the waiting card with one linked message", async ({ page }) => {
	const timed = timedCard(new Date(Date.now() + 45_000).toISOString());
	const input = message("interaction-input-05", "先给我选条周末路线。", true);
	await isolateChat(page, { items: [input, timed] });
	const actions: QuestionCardAction[] = [];
	await page.route(`**/v1/messages/${timed.id}/question`, (route) => {
		const action = route.request().postDataJSON() as QuestionCardAction;
		actions.push(action);
		return route.fulfill({ json: settleQuestion(timed, action) });
	});
	const card = page.locator(`[data-message-id="${timed.id}"] [data-interaction-card]`);
	await page.goto("/messages/main");
	await expect(card.getByRole("timer")).toBeVisible();
	await card.getByText("市集路线", { exact: true }).click();
	await card.getByRole("button", { name: "回复" }).click();
	await expect(card.getByText("市集路线")).toBeVisible();
	await expect(card.getByText("补答")).toHaveCount(0);
	await expect(page.locator(`[data-message-id="${timed.id}-reply-10"] blockquote`)).toContainText(timed.body ?? "");
	expect(actions).toHaveLength(1);
	expect(actions[0]).toMatchObject({
		action: "answer",
		version: 1,
		answers: [{ questionId: "timed-route", optionIds: ["market"] }],
	});
});

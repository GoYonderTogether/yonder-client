import { devices, expect, test } from "@playwright/test";
import type { ItemDetail } from "@yonder/protocol";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({ ...devices["iPhone 14"], defaultBrowserType: "chromium" });

test("mobile task and Messages use the same composer affordance, while task sends to itself", async ({
	page,
}, testInfo) => {
	await isolateChat(page, { items: [message("chat-reply-01", "消息示例")] });
	const task = {
		id: "cnv-synthetic-task",
		source: "conversation",
		title: "验收事项",
		state: "completed",
		botMemberId: bot.id,
		conversationId: "cnv-synthetic-task",
		startedAt: "2026-11-24T00:00:00Z",
		endedAt: "2026-11-24T00:01:00Z",
		failureReason: null,
		result: null,
		instruction: null,
		steps: [],
		cancellable: false,
		pausable: false,
	} satisfies ItemDetail;
	await page.route("**/v1/items/cnv-synthetic-task", (route) => route.fulfill({ json: task }));
	await page.route("**/v1/items/cnv-synthetic-task/session", (route) =>
		route.fulfill({ json: { conversation: { ...conversation, id: task.id, isPrimary: false, title: task.title } } }),
	);
	await page.route("**/v1/conversations/cnv-synthetic-task/messages**", async (route) => {
		if (route.request().method() !== "POST")
			return route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } });
		const payload = route.request().postDataJSON();
		return route.fulfill({
			json: {
				message: {
					...message("task-message-02", payload.body, true),
					conversationId: task.id,
					clientNonce: payload.clientNonce,
				},
				clientNonce: payload.clientNonce,
			},
		});
	});

	const textbox = page.getByRole("textbox", { name: /对 .*说点什么/u });
	await page.goto("/messages/main");
	await expect(textbox).toBeVisible();
	expect(await textbox.getAttribute("placeholder")).toBeNull();
	await page.screenshot({ path: testInfo.outputPath("01-messages-composer.png"), animations: "disabled" });

	await page.goto(`/tasks/${task.id}`);
	await expect(textbox).toBeVisible();
	expect(await textbox.getAttribute("placeholder")).toBeNull();
	await page.screenshot({ path: testInfo.outputPath("02-task-composer.png"), animations: "disabled" });
	await textbox.fill("只在这个事项中记录");
	const submission = page.waitForRequest(
		(request) =>
			request.method() === "POST" && new URL(request.url()).pathname.endsWith(`/conversations/${task.id}/messages`),
	);
	await page.getByRole("button", { name: "发送" }).click();
	expect((await submission).postDataJSON()).toMatchObject({ body: "只在这个事项中记录" });
});

test("the Chinese dictation hint fits the 320px phone composer", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 320, height: 700 });
	await isolateChat(page, { items: [message("chat-reply-01", "消息示例")] });
	await page.goto("/messages/main");
	const hint = page.locator(".composer-text-hold-hint");
	await expect(hint).toHaveText("可按住 转文字");
	await expect(hint).toHaveCSS("font-size", "13px");
	const viewport = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(viewport).toBe(320);
	await page.screenshot({ path: testInfo.outputPath("03-mobile-dictation-320.png"), animations: "disabled" });
});

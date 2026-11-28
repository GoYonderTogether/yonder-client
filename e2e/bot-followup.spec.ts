import { devices, expect, test } from "@playwright/test";
import type { Message } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const initial = "请整理这周的发布清单。";
const whileWaiting = "先看客户端。";
const whileStreaming = "再补上移动端的验证结果。";
const firstPart = "正在整理这周的发布清单。";
const nextPart = `${firstPart} 已核对版本和变更记录。`;
const { viewport: phone, userAgent, isMobile, hasTouch, deviceScaleFactor } = devices["iPhone 13"];

for (const [layout, viewport] of Object.entries({
	desktop: { width: 1180, height: 760 },
	narrow: { width: 800, height: 760 },
	phone,
})) {
	test.describe(layout, () => {
		if (layout === "phone") test.use({ userAgent, isMobile, hasTouch, deviceScaleFactor });
		test("sends while the Bot waits and while its reply is streaming", async ({ page }, testInfo) => {
			await page.setViewportSize(viewport);
			const history: Message[] = [];
			const api = await isolateChat(page, { items: history });
			await page.goto(`/messages/${conversation.id}`);
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			const send = page.getByRole("button", { name: "发送", exact: true });
			const log = page.getByRole("log");
			await expect(input).toBeVisible();
			await expect.poll(api.connected).toBe(true);

			await input.fill(initial);
			await send.click();
			await expect(log.locator('[data-message-id="sent-11"]')).toContainText(initial);
			const reply = message("stream-reply-11", "", false, true);
			reply.run = {
				id: "followup-run",
				conversationId: conversation.id,
				messageId: reply.id,
				userMessageId: "sent-11",
				status: "running",
			};
			history.push(reply);
			api.create(reply);
			const waiting = log.locator("[data-bot-waiting]");
			await expect(waiting).toBeVisible();
			await input.fill(whileWaiting);
			await expect(send).toBeEnabled();
			await send.click();
			await expect(log.locator('[data-message-id="sent-12"]')).toContainText(whileWaiting);

			api.update(Object.assign(reply, { body: firstPart, version: 2 }));
			const incoming = log.locator(`[data-message-id="${reply.id}"]`);
			const typing = page.locator("[data-chat-agent-title]").getByRole("status");
			await expect(incoming).toContainText(firstPart);
			await expect(typing).toHaveText("正在输入");
			await input.fill(whileStreaming);
			await expect(send).toBeEnabled();
			await page.screenshot({
				path: testInfo.outputPath("01-draft-while-bot-replies.png"),
				animations: "disabled",
				scale: "css",
			});
			if (layout === "phone") await send.tap();
			else await input.press("Enter");
			await expect(log.locator('[data-message-id="sent-13"]')).toContainText(whileStreaming);
			await expect(input).toHaveValue("");
			expect(api.sent.map(({ body }) => body)).toEqual([initial, whileWaiting, whileStreaming]);

			api.update(Object.assign(reply, { body: nextPart, version: 3 }));
			await expect(incoming).toContainText(nextPart);
			await expect(typing).toHaveText("正在输入");
			await page.screenshot({
				path: testInfo.outputPath("02-follow-up-sent-bot-still-replying.png"),
				animations: "disabled",
				scale: "css",
			});
		});
	});
}

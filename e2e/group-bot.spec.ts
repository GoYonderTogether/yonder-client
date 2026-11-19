import { expect, test } from "@playwright/test";
import type { Conversation } from "@yonder/protocol";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test("group owner changes the payer and a selected Bot is sent as a mention", async ({ page }, info) => {
	const api = await isolateChat(page, { group: true, items: [] });
	const group: Conversation = {
		...conversation,
		kind: "group",
		title: "群聊验收",
		isPrimary: false,
		ownerId: person.id,
		groupBotPayer: "mentioner",
	};
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [group] } }));
	const updates: unknown[] = [];
	await page.route(`**/v1/conversations/${group.id}`, async (route) => {
		updates.push(route.request().postDataJSON());
		await route.fulfill({ json: { ...group, groupBotPayer: "owner", version: 2 } });
	});
	await page.goto(`/messages/${group.id}`);
	await page.getByRole("button", { name: "聊天设置" }).click();
	const groupInfo = page.getByRole("dialog", { name: "群资料" });
	const payer = page.getByRole("combobox", { name: "Bot 回复由谁付费" });
	await expect(payer).toHaveCount(0);
	await groupInfo.getByRole("button", { name: "Bot 设置" }).click();
	const settings = page.getByRole("dialog", { name: "Bot 设置" });
	await expect(payer).toHaveValue("mentioner");
	await payer.selectOption("owner");
	await expect(payer).toHaveValue("owner");
	expect(updates).toEqual([{ groupBotPayer: "owner" }]);
	await expect
		.poll(() =>
			settings.evaluate((panel) => {
				const transform = getComputedStyle(panel).transform;
				return transform === "none" ? 0 : Math.round(new DOMMatrixReadOnly(transform).m41);
			}),
		)
		.toBe(0);
	await page.screenshot({ path: info.outputPath("group-bot-payer.png") });
	await settings.getByRole("button", { name: "返回" }).click();
	await expect(settings).toHaveCount(0);
	await expect(groupInfo).toBeVisible();
	await page.keyboard.press("Escape");
	const input = page.locator("textarea.composer-text");
	await input.fill("@界面");
	await page.getByRole("option").filter({ hasText: bot.displayName }).click();
	await input.press("End");
	await input.pressSequentially("hello");
	await input.press("Enter");
	await expect.poll(() => api.sent[0]).toMatchObject({ mentionedMemberIds: [bot.id] });
});

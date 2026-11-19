import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test("a person's card opens their chosen reception Bot", async ({ page }) => {
	await isolateChat(page, { items: [] });
	await page.route("**/v1/members/owner-test", (route) =>
		route.fulfill({
			json: {
				card: {
					kind: "person",
					handle: "owner-test",
					displayName: "测试用户",
					avatarUrl: null,
					bio: null,
					owner: null,
				},
				relation: "none",
				memberId: "owner",
				conversationId: null,
				bots: [{ handle: "chosen-bot", displayName: "接待 Bot", avatarUrl: null, reception: true }],
			},
		}),
	);
	let chosen = "";
	await page.route("**/v1/visits", (route) => {
		chosen = route.request().postDataJSON().handle;
		return route.fulfill({ json: { conversation } });
	});
	await page.goto("/@owner-test");
	const button = page.getByRole("button", { name: "有事找 TA" });
	await expect(button).toBeVisible({ timeout: 20000 });
	await mkdir("../reviews/20261118-bot-closure", { recursive: true });
	await page.screenshot({ path: "../reviews/20261118-bot-closure/reception-card.png" });
	await button.click();
	await expect.poll(() => chosen).toBe("chosen-bot");
	await expect(page).toHaveURL(/\/messages\/chat-route-check/);
});

test("the owner can choose a reception Bot", async ({ page }, info) => {
	await isolateChat(page, { items: [] });
	const main = { ...bot, ownerId: person.id, isDefault: true };
	const second = { ...main, id: "second-bot", displayName: "第二个 Bot", isDefault: false };
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [main, second] } }));
	let selected = main.id;
	await page.route("**/v1/me/reception", (route) => {
		if (route.request().method() === "PUT") selected = route.request().postDataJSON().botId ?? main.id;
		return route.fulfill({ json: { botId: selected, custom: selected !== main.id } });
	});
	await page.goto("/me/reception");
	await page.getByRole("button", { name: /^接待 Bot/ }).click();
	await expect(page).toHaveURL(/\/me\/reception\/bot$/);
	const secondOption = page.getByRole("radio", { name: second.displayName, exact: true });
	await expect(secondOption).toBeVisible({ timeout: 20000 });
	await secondOption.click();
	await expect.poll(() => selected).toBe("second-bot");
	await expect(secondOption).toBeChecked();
	await expect(page.getByText("已保存", { exact: true })).toBeVisible();
	await page.screenshot({ path: info.outputPath("reception-setting.png") });
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page.getByRole("button", { name: /^接待 Bot/ })).toContainText(second.displayName);
});

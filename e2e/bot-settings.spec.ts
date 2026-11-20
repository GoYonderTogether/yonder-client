import { devices, expect, test } from "@playwright/test";
import { bot, isolateChat, person } from "./chat-fixture.ts";

const defaultBot = { ...bot, ownerId: person.id, isDefault: true };
const settingsBot = {
	...bot,
	id: "settings-bot",
	handle: "settingsbot",
	displayName: "设置助手",
	ownerId: person.id,
	isDefault: false,
};
const detailPath = `/me/bots/${settingsBot.id}`;
const botApi = `/v1/bots/${settingsBot.id}`;

for (const phone of [false, true]) {
	test.describe(phone ? "phone" : "wide desktop", () => {
		const iPhone = devices["iPhone 15"];
		test.use(
			phone
				? { viewport: iPhone.viewport, userAgent: iPhone.userAgent, isMobile: true, hasTouch: true }
				: { viewport: { width: 1280, height: 900 } },
		);

		test("opens dedicated Bot settings, saves a profile and edits the persona of the selected Bot", async ({
			page,
		}, testInfo) => {
			await isolateChat(page, { items: [] });
			await page.emulateMedia({ reducedMotion: "reduce" });
			let editedBot = settingsBot;
			let persona = "先确认来访者的问题。";
			await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [defaultBot, editedBot] } }));
			await page.route(`**${botApi}`, (route) => {
				const { displayName } = route.request().postDataJSON() as { displayName: string };
				editedBot = { ...editedBot, displayName, version: editedBot.version + 1 };
				return route.fulfill({ json: editedBot });
			});
			await page.route(`**${botApi}/social`, (route) => {
				if (route.request().method() === "PUT") {
					persona = (route.request().postDataJSON() as { content: string }).content;
				}
				return route.fulfill({ json: { content: persona } });
			});
			const snapshot = async (name: string) => {
				await page.evaluate(async () => {
					await document.fonts.ready;
				});
				await page.screenshot({ path: testInfo.outputPath(name) });
			};

			await page.goto("/me/bots");
			await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", phone ? "mobile" : "wide");
			const directory = page.getByRole("navigation", { name: "我", exact: true });
			const back = page.getByRole("button", { name: "返回", exact: true });
			if (phone) {
				await expect(page.getByRole("button", { name: "我的 Bot", exact: true })).toBeHidden();
				await expect(back).toBeVisible();
			} else {
				await expect(directory.getByRole("button", { name: "我的 Bot", exact: true })).toHaveAttribute(
					"aria-current",
					"page",
				);
				await expect(back).toBeHidden();
			}
			await expect(page.getByRole("heading", { name: "我的 Bot", exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: /主 Bot @chatbot/ }).locator("[data-bot-label]")).toBeVisible();
			await snapshot("bot-list.png");

			await page.getByRole("button", { name: /设置助手.*@settingsbot/ }).click();
			await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
			await page.getByRole("button", { name: /^基本资料/ }).click();
			await expect(page).toHaveURL(new RegExp(`${detailPath}/profile$`));
			await expect(page.getByRole("heading", { name: "基本资料", exact: true })).toBeVisible();
			const name = page.getByRole("textbox", { name: "名字", exact: true });
			const save = page.getByRole("button", { name: "保存资料", exact: true });
			await expect(name).toHaveValue("设置助手");
			await expect(save).toBeDisabled();
			await snapshot("bot-profile.png");
			await name.fill("更名助手");
			const updated = page.waitForRequest((request) => request.method() === "PATCH" && request.url().endsWith(botApi));
			await save.click();
			expect((await updated).postDataJSON()).toEqual({ displayName: "更名助手" });
			await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
			await expect(page.getByRole("heading", { name: "更名助手", exact: true })).toBeVisible();
			await expect(
				page.getByRole("region", { name: "我", exact: true }).getByText("AI", { exact: true }),
			).toBeVisible();

			await page.getByRole("button", { name: /^对外人格/ }).click();
			await expect(page).toHaveURL(new RegExp(`${detailPath}/persona$`));
			const personaField = page.getByRole("textbox", { name: "交流方式", exact: true });
			await expect(personaField).toHaveValue("先确认来访者的问题。");
			await personaField.fill("回复前先核对来访者的问题。");
			const saved = page.waitForRequest(
				(request) => request.method() === "PUT" && request.url().endsWith(`${botApi}/social`),
			);
			await page.getByRole("button", { name: "保存", exact: true }).click();
			expect((await saved).postDataJSON()).toEqual({ content: "回复前先核对来访者的问题。" });
			await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
			await page.getByRole("button", { name: /^对外人格/ }).click();
			await expect(personaField).toHaveValue("回复前先核对来访者的问题。");

			await back.click();
			await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
			await page.getByRole("button", { name: "渠道", exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/me/channels\\?bot=${settingsBot.id}$`));
			await page.getByRole("button", { name: "选择 Bot: 更名助手", exact: true }).click();
			await page.getByRole("option", { name: defaultBot.displayName, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/me/channels\\?bot=${defaultBot.id}$`));
			await expect(
				page.getByRole("button", { name: `选择 Bot: ${defaultBot.displayName}`, exact: true }),
			).toBeVisible();
			await back.click();
			await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
			await back.click();
			await expect(page).toHaveURL(/\/me\/bots$/);
			await expect(page.getByRole("button", { name: /更名助手.*@settingsbot/ })).toBeVisible();
			if (phone) {
				await back.click();
				await expect(page).toHaveURL(/\/me$/);
				await expect(page.getByRole("button", { name: "我的 Bot", exact: true })).toBeVisible();
				await snapshot("settings-directory.png");
			}
		});
	});
}

import { expect, test } from "@playwright/test";
import { bot, isolateChat, person } from "./chat-fixture.ts";

const defaultBot = { ...bot, ownerId: person.id, isDefault: true };
const helper = {
	...bot,
	id: "model-bot",
	handle: "modelbot",
	displayName: "模型助手",
	ownerId: person.id,
	isDefault: false,
};

const providerList = {
	platformModels: [{ id: "mdl_plat", name: "DeepSeek-V4.1-Flash-1017", enabled: true, isDefault: true }],
	items: [
		{
			id: "prv_mine",
			scope: "user",
			name: "我的网关",
			baseUrl: "http://127.0.0.1:8080/v1",
			protocol: "openai",
			models: ["local-model"],
			keyConfigured: true,
			enabled: true,
			isDefault: false,
			origin: "device",
			deviceId: "dev_1",
			deviceName: "工作室 Mac",
		},
	],
};

test.use({ viewport: { width: 1280, height: 900 } });

test("the main model is one list, and a Bot can pick its own model or follow the main one", async ({
	page,
}, testInfo) => {
	await isolateChat(page, { items: [] });
	let current: { modelChoice: string | null } = { modelChoice: null };
	const patches: unknown[] = [];
	const defaults: string[] = [];
	// The list the server returns follows the account's default once it is set.
	let defaultId = "mdl_plat";
	await page.route("**/v1/providers", (route) =>
		route.fulfill({
			json: {
				platformModels: providerList.platformModels.map((model) => ({ ...model, isDefault: model.id === defaultId })),
				items: providerList.items.map((item) => ({ ...item, isDefault: item.id === defaultId })),
			},
		}),
	);
	await page.route("**/v1/providers/*/default", (route) => {
		const id = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
		defaults.push(id);
		defaultId = id;
		return route.fulfill({ json: { ok: true } });
	});
	await page.route("**/v1/contacts", (route) =>
		route.fulfill({ json: { items: [defaultBot, { ...helper, ...current }] } }),
	);
	await page.route(`**/v1/bots/${helper.id}`, (route) => {
		const body = route.request().postDataJSON() as { modelChoice: string | null };
		patches.push(body);
		current = { modelChoice: body.modelChoice };
		return route.fulfill({ json: { ...helper, ...current, version: 2 } });
	});

	// The account's main model: platform models and own providers in one radio list.
	await page.goto("/me/models");
	const main = page.getByRole("radio");
	await expect(main.nth(0)).toHaveAccessibleName("DeepSeek-V4.1-Flash-1017");
	await expect(main.nth(0)).toBeChecked();
	await expect(main.nth(1)).toHaveAccessibleName("我的网关");
	await expect(page.getByText("经 工作室 Mac 转发")).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("main-model.png") });
	await main.nth(1).click();
	await expect.poll(() => defaults).toEqual(["prv_mine"]);
	await expect(main.nth(1)).toBeChecked();
	await expect(main.nth(0)).not.toBeChecked();

	// One Bot's own model: follow the main model, pick one, clear it again.
	await page.goto(`/me/bots/${helper.id}/model`);
	await expect(page.getByRole("radio", { name: "跟随主模型" })).toBeChecked();
	await page.getByRole("radio", { name: "我的网关" }).click();
	await expect(page.getByRole("radio", { name: "我的网关" })).toBeChecked();
	await page.screenshot({ path: testInfo.outputPath("bot-model.png") });
	await expect.poll(() => patches).toEqual([{ modelChoice: "prv_mine" }]);
	await page.getByRole("radio", { name: "跟随主模型" }).click();
	await expect(page.getByRole("radio", { name: "跟随主模型" })).toBeChecked();
	await expect.poll(() => patches).toEqual([{ modelChoice: "prv_mine" }, { modelChoice: null }]);
});

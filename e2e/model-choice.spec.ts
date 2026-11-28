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
			models: ["local-older", "local-model"],
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

test("the account chooses a provider model, and a Bot can pick a provider or follow the main model", async ({
	page,
}, testInfo) => {
	await isolateChat(page, { items: [] });
	let current: { modelChoice: string | null } = { modelChoice: null };
	const patches: unknown[] = [];
	const defaults: Array<{ action: string; id: string; body: unknown }> = [];
	// The server stores the selected provider and the exact model it should answer with.
	let defaultId = "mdl_plat";
	let providerModel = "local-older";
	await page.route("**/v1/providers", (route) =>
		route.fulfill({
			json: {
				platformModels: providerList.platformModels.map((model) => ({ ...model, isDefault: model.id === defaultId })),
				items: providerList.items.map((item) => ({
					...item,
					defaultModel: providerModel,
					isDefault: item.id === defaultId,
				})),
			},
		}),
	);
	await page.route(/\/v1\/providers\/[^/]+\/default(?:-model)?$/, (route) => {
		expect(route.request().method()).toBe("POST");
		const [, , , id, action] = new URL(route.request().url()).pathname.split("/");
		const body = route.request().postDataJSON() as { model?: string };
		defaults.push({ id: id ?? "", action: action ?? "", body });
		if (action === "default-model" && body.model) providerModel = body.model;
		if (action === "default" && id) defaultId = id;
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

	await page.goto("/me/models");
	const official = page.getByRole("heading", { name: "官方模型", exact: true }).locator("..");
	const custom = page.getByRole("heading", { name: "自定义供应商", exact: true }).locator("..");
	const platform = official.getByRole("radio", { name: "DeepSeek-V4.1-Flash-1017", exact: true });
	const local = custom.getByRole("radio", { name: "local-model", exact: true });
	await expect(platform).toBeChecked();
	await expect(custom.getByText("我的网关", { exact: true })).toBeVisible();
	await expect(local).not.toBeChecked();
	await page.screenshot({ path: testInfo.outputPath("main-model.png") });
	await local.click();
	await expect
		.poll(() => defaults)
		.toEqual([
			{ action: "default-model", id: "prv_mine", body: { model: "local-model" } },
			{ action: "default", id: "prv_mine", body: {} },
		]);
	await expect(local).toBeChecked();
	await expect(custom.getByRole("radio", { name: "local-older", exact: true })).not.toBeChecked();
	await expect(platform).not.toBeChecked();

	// One Bot's own model: follow the main model, pick one, clear it again.
	await page.goto(`/me/bots/${helper.id}/model`);
	await expect(page.getByRole("radio", { name: "跟随主模型" })).toBeChecked();
	await expect(page.getByText("经 工作室 Mac 转发")).toBeVisible();
	await page.getByRole("radio", { name: "我的网关" }).click();
	await expect(page.getByRole("radio", { name: "我的网关" })).toBeChecked();
	await page.screenshot({ path: testInfo.outputPath("bot-model.png") });
	await expect.poll(() => patches).toEqual([{ modelChoice: "prv_mine" }]);
	await page.getByRole("radio", { name: "跟随主模型" }).click();
	await expect(page.getByRole("radio", { name: "跟随主模型" })).toBeChecked();
	await expect.poll(() => patches).toEqual([{ modelChoice: "prv_mine" }, { modelChoice: null }]);
});

import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type { DeviceSummary, DiscoverModelsRequest, Provider, SaveProviderRequest } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const dir = process.env.YONDER_PREVIEW_DIR;
async function capture(page: Page, filename: string) {
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await page.screenshot({ path: `${dir}/${filename}.png`, animations: "disabled", scale: "css" });
}
const device: DeviceSummary = {
	id: "dev_00000000000000000000000001",
	name: "工作 Mac",
	platform: "macos",
	appVersion: "0.3.0",
	status: "online",
	lastSeenAt: "2026-11-22T10:00:00.000Z",
	current: false,
};
const offline: DeviceSummary = {
	...device,
	id: "dev_00000000000000000000000002",
	name: "另一台 Windows",
	platform: "windows",
	status: "offline",
};
const phone: DeviceSummary = { ...device, id: "dev_00000000000000000000000003", name: "不支持的手机", platform: "ios" };
const endpoint = {
	endpointId: "00000000-0000-4000-8000-000000000001",
	revision: 1,
	label: "本地模型 A",
	protocol: "openai-chat",
} as const;
const approvedAnthropic = {
	...endpoint,
	protocol: "anthropic-messages" as const,
	endpointId: "00000000-0000-4000-8000-000000000002",
	label: "本地 Anthropic",
};
const savedCloud: Provider = {
	id: "prv_00000000000000000000000001",
	scope: "user",
	origin: "cloud",
	name: "既有云端供应商",
	baseUrl: "https://models.example.test",
	enabled: true,
	isDefault: false,
	keyConfigured: true,
	protocol: "openai-chat",
	models: ["legacy"],
};
const expectedTarget = { origin: "device", deviceId: device.id, endpointId: endpoint.endpointId } as const;
async function setup(page: Page, { configured = false }: { configured?: boolean } = {}) {
	await isolateChat(page);
	await page.emulateMedia({ reducedMotion: "reduce" });
	const received: { discovery: DiscoverModelsRequest[]; saves: SaveProviderRequest[] } = { discovery: [], saves: [] };
	let items: Provider[] = configured ? [savedCloud] : [];
	await page.route("**/v1/devices", (route) =>
		route.fulfill({
			json: {
				items: [
					{ ...device, modelEndpoints: [endpoint, approvedAnthropic] },
					{
						...offline,
						modelEndpoints: [{ ...endpoint, endpointId: "00000000-0000-4000-8000-000000000003", label: "备用地址" }],
					},
					{
						...phone,
						modelEndpoints: [{ ...endpoint, endpointId: "00000000-0000-4000-8000-000000000004", label: "不应显示" }],
					},
				],
			},
		}),
	);
	await page.route("**/v1/providers/models", (route) => {
		received.discovery.push(route.request().postDataJSON());
		return route.fulfill({
			json: { models: ["fixture-model"], metadata: { "fixture-model": { contextLength: 4096 } } },
		});
	});
	await page.route("**/v1/providers", (route) => {
		if (route.request().method() === "GET") return route.fulfill({ json: { items, platformModels: [] } });
		const payload = route.request().postDataJSON() as SaveProviderRequest;
		received.saves.push(payload);
		const next: Provider = {
			...payload,
			id: "prv_00000000000000000000000002",
			scope: "user",
			baseUrl: payload.baseUrl ?? "",
			origin: payload.origin ?? "cloud",
			enabled: true,
			isDefault: true,
			keyConfigured: payload.origin !== "device",
		};
		items = [next, ...items];
		return route.fulfill({ json: next });
	});
	return received;
}
const name = (page: Page) => page.getByRole("textbox", { name: "名称", exact: true });
const url = (page: Page) => page.getByRole("textbox", { name: "请求地址", exact: true });
const location = (page: Page) => page.getByRole("button", { name: /^运行位置:/ });
const discoveredModel = (page: Page) => page.getByRole("textbox", { name: "请求模型", exact: true }).first();
const discover = (page: Page) => page.getByRole("button", { name: "获取模型列表", exact: true });
async function start(page: Page) {
	await page.goto("/me/models/add");
	await page.getByRole("button", { name: "自定义供应商", exact: true }).click();
	await expect(name(page)).toBeVisible();
}
test("one editor selects Cloud or an approved Desktop, and Web sends only the exact opaque target", async ({
	page,
}) => {
	const requests = await setup(page);
	await start(page);
	await expect(location(page)).toHaveText("云端");
	await expect(name(page).locator("xpath=../..").locator("label > span")).toHaveText("*");
	await expect(
		page.getByRole("textbox", { name: "备注", exact: true }).locator("xpath=../..").locator("label > span"),
	).toHaveCount(0);
	await capture(page, "provider-web-cloud");
	await url(page).fill("http://localhost:11434/v1");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page.getByRole("alert")).toHaveText("本机地址需要选择运行设备。");
	expect(requests).toEqual({ discovery: [], saves: [] });
	await location(page).click();
	await expect(page.getByRole("option", { name: /工作 Mac.*在线/ })).toBeVisible();
	await expect(page.getByRole("option", { name: /另一台 Windows.*上次在线/ })).toBeVisible();
	await expect(page.getByRole("option", { name: /不支持的手机/ })).toHaveCount(0);
	await capture(page, "provider-web-device-options");
	await page.getByRole("option", { name: /工作 Mac.*在线/ }).click();
	await expect(url(page)).toHaveCount(0);
	await expect(page.getByLabel("API Key")).toHaveCount(0);
	await page.getByRole("button", { name: /^请求地址:/ }).click();
	await page.getByRole("option", { name: "本地模型 A" }).click();
	await name(page).fill("本机模型 Vol.1");
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	expect(requests.discovery).toEqual([{ protocol: "openai-chat", ...expectedTarget }]);
	await capture(page, "provider-web-device-bound");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect
		.poll(() => requests.saves)
		.toEqual([
			{
				name: "本机模型 Vol.1",
				note: null,
				models: ["fixture-model"],
				metadata: { "fixture-model": { name: "fixture-model", contextLength: 4096 } },
				protocol: "openai-chat",
				...expectedTarget,
			},
		]);
	await expect(page.getByText("工作 Mac · 在线", { exact: true })).toBeVisible();
	await expect(page.getByText("密钥未配置", { exact: true })).toHaveCount(0);
	await capture(page, "provider-web-list-device");
	await page.setViewportSize({ width: 1280, height: 900 });
	await start(page);
	await location(page).click();
	await page.getByRole("option", { name: /工作 Mac.*在线/ }).click();
	await page.getByRole("button", { name: /^请求地址:/ }).click();
	await page.getByRole("option", { name: approvedAnthropic.label }).click();
	const protocol = page.getByRole("button", { name: /^协议:/ });
	await expect(protocol).toBeDisabled();
	await expect(protocol).toHaveText("Anthropic Messages");
	await expect(page.getByLabel("API Key")).toHaveCount(0);
	await capture(page, "provider-web-anthropic-bound");
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	expect(requests.discovery.at(-1)).toEqual({
		protocol: "anthropic-messages",
		...expectedTarget,
		endpointId: approvedAnthropic.endpointId,
	});
});
test("existing cloud key is not revealed and uses the stored key by provider ID", async ({ page }) => {
	const requests = await setup(page, { configured: true });
	await page.goto("/me/models");
	await page.getByRole("button", { name: "编辑供应商", exact: true }).click();
	await expect(name(page)).toHaveValue("既有云端供应商");
	await expect(page.getByLabel("API Key")).toHaveCount(0);
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	expect(requests.discovery).toEqual([
		{ protocol: "openai-chat", baseUrl: savedCloud.baseUrl, providerId: savedCloud.id },
	]);
	expect(requests.saves).toEqual([]);
});

test("desktop shell uses the same editor and keeps localhost in the current-device IPC", async ({ page }) => {
	const requests = await setup(page);
	const patches: SaveProviderRequest[] = [];
	await page.route("**/v1/providers/prv_00000000000000000000000002", async (route) => {
		expect(route.request().method()).toBe("PATCH");
		const payload = route.request().postDataJSON() as SaveProviderRequest;
		patches.push(payload);
		await route.fulfill({ json: { ...payload, scope: "user", id: "prv_00000000000000000000000002" } });
	});
	await page.setViewportSize({ width: 1280, height: 1080 });
	const registrations: unknown[] = [];
	await page.exposeFunction("recordProviderRegistration", (record: unknown) => registrations.push(record));
	let rejectedRegistrations = 0;
	await page.exposeFunction("recordProviderRejection", () => ++rejectedRegistrations);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
		localStorage.setItem("dev.yonder.desktop.refresh-token", "browser-fixture");
		Object.assign(window, {
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string, args: unknown) => {
					if (command === "get_desktop_refresh_token") return "browser-fixture";
					if (command === "device_model_register" || command === "device_model_set_key") {
						if ((args as { baseUrl?: string }).baseUrl === "http://127.0.0.1:9999/v1") {
							await (window as Window & { recordProviderRejection: () => Promise<void> }).recordProviderRejection();
							throw new Error("Synthetic local endpoint registration failed");
						}
						await (
							window as Window & {
								recordProviderRegistration: (record: unknown) => Promise<void>;
							}
						).recordProviderRegistration({ command, args });
						return {
							endpointId:
								command === "device_model_register"
									? "00000000-0000-4000-8000-000000000005"
									: (args as { endpointId: string }).endpointId,
							revision: 1,
							label: "本地模型",
							protocol: "anthropic-messages",
						};
					}
					return null;
				},
			},
		});
	});
	await page.route("**/v1/me/sessions", (route) =>
		route.fulfill({
			json: {
				items: [
					{
						id: "local-browser-session",
						deviceId: device.id,
						deviceName: device.name,
						platform: "macos",
						appVersion: "0.3.0",
						lastSeenAt: device.lastSeenAt,
						createdAt: device.lastSeenAt,
						current: true,
					},
				],
			},
		}),
	);
	let checks = 0;
	await page.route("**/v1/devices", (route) => {
		checks++;
		const modelEndpoints = registrations.length
			? [
					endpoint,
					approvedAnthropic,
					{ ...approvedAnthropic, endpointId: "00000000-0000-4000-8000-000000000005", label: "新地址" },
				]
			: [endpoint, approvedAnthropic];
		return route.fulfill({ json: { items: [{ ...device, current: true, modelEndpoints }] } });
	});
	await page.goto("/me/models/add");
	await page.getByRole("button", { name: "继续使用 Yonder" }).click();
	await page.getByRole("button", { name: "自定义供应商", exact: true }).click();
	await expect(location(page)).toHaveText("云端");
	await location(page).click();
	await page.getByRole("option", { name: /工作 Mac.*在线/ }).click();
	await expect(page.getByRole("button", { name: /^请求地址:/ })).toHaveCount(0);
	await expect(url(page)).toHaveCount(1);
	await expect(url(page)).toBeEditable();
	await expect(url(page)).toHaveAttribute("required", "");
	await expect(url(page)).toHaveValue("");
	await expect(discoveredModel(page)).toHaveValue("");
	expect(registrations).toEqual([]);
	await capture(page, "provider-desktop-local-address-empty");
	await name(page).fill("桌面本地模型");
	await url(page).fill("http://127.0.0.1:9999/v1");
	await discover(page).click();
	await expect.poll(() => rejectedRegistrations).toBe(1);
	await expect(page.getByRole("alert")).toHaveText("设备或地址不可用。");
	await discoveredModel(page).fill("fixture-model");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect.poll(() => rejectedRegistrations).toBe(2);
	await expect(page.getByRole("alert")).toHaveText("设备或地址不可用。");
	expect(requests).toEqual({ discovery: [], saves: [] });
	await discoveredModel(page).fill("");
	await url(page).fill("http://127.0.0.1:8788/v1");
	const protocol = page.getByRole("button", { name: /^协议:/ });
	await protocol.click();
	await page.getByRole("option", { name: "Anthropic Messages" }).click();
	await expect(protocol).toHaveText("Anthropic Messages");
	const keyField = page.getByLabel("API Key");
	await expect(keyField).toHaveAttribute("type", "password");
	await expect(page.locator('label[for="provider-key"]')).toHaveText("API Key");
	await keyField.scrollIntoViewIfNeeded();
	await capture(page, "provider-desktop-anthropic-loopback");
	await keyField.fill("synthetic-local-key");
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	expect(checks).toBeGreaterThan(1);
	const target = { origin: "device", deviceId: device.id, endpointId: "00000000-0000-4000-8000-000000000005" } as const;
	expect(requests.discovery).toEqual([{ protocol: "anthropic-messages", ...target }]);
	expect(registrations).toEqual([
		{
			command: "device_model_register",
			args: expect.objectContaining({
				context: { ownerId: "chat-person", deviceId: device.id, sessionId: "local-browser-session" },
				baseUrl: "http://127.0.0.1:8788/v1",
				protocol: "anthropic-messages",
				apiKey: "synthetic-local-key",
			}),
		},
	]);
	await expect(keyField).toHaveValue("");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect.poll(() => requests.saves.at(-1)).toMatchObject({ ...target, protocol: "anthropic-messages" });
	expect(requests.saves.at(-1)).not.toHaveProperty("baseUrl");
	expect(requests.saves.at(-1)).not.toHaveProperty("apiKey");
	await expect(page.getByRole("button", { name: "编辑供应商", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "编辑供应商", exact: true }).click();
	await expect(location(page)).toBeDisabled();
	const savedEndpoint = page.getByRole("button", { name: /^请求地址:/ });
	await expect(savedEndpoint).toBeDisabled();
	await expect(savedEndpoint).toHaveText("新地址");
	await expect(protocol).toBeDisabled();
	await expect(protocol).toHaveText("Anthropic Messages");
	await expect(url(page)).toHaveCount(0);
	await expect(keyField).toHaveValue("");
	await capture(page, "provider-canonical-desktop-bound-edit");
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	await expect.poll(() => requests.discovery).toHaveLength(2);
	expect(registrations).toHaveLength(1);
	await keyField.fill("synthetic-replacement-key");
	await discover(page).click();
	await expect(discoveredModel(page)).toHaveValue("fixture-model");
	await expect(keyField).toHaveValue("");
	expect(registrations).toHaveLength(2);
	expect(registrations.at(-1)).toEqual({
		command: "device_model_set_key",
		args: {
			context: { ownerId: "chat-person", deviceId: device.id, sessionId: "local-browser-session" },
			endpointId: target.endpointId,
			apiKey: "synthetic-replacement-key",
		},
	});
	await expect
		.poll(() => requests.discovery)
		.toEqual(Array.from({ length: 3 }, () => ({ protocol: "anthropic-messages", ...target })));
	expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("synthetic-");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect
		.poll(() => patches)
		.toEqual([
			{
				...target,
				protocol: "anthropic-messages",
				name: "桌面本地模型",
				note: null,
				models: ["fixture-model"],
				metadata: { "fixture-model": { name: "fixture-model", contextLength: 4096 } },
			},
		]);
	expect(registrations).toHaveLength(2);
});

test("existing relay providers retain device identity and can be tested, but never open a cloud key form", async ({
	page,
}) => {
	await setup(page);
	await page.route("**/v1/providers", (route) =>
		route.fulfill({
			json: {
				items: [
					{
						...savedCloud,
						id: "prv_00000000000000000000000003",
						name: "既有设备供应商",
						origin: "device",
						deviceId: device.id,
						deviceName: device.name,
						baseUrl: "http://127.0.0.1:9012/v1",
					},
				],
				platformModels: [],
			},
		}),
	);
	await page.route("**/v1/providers/prv_00000000000000000000000003/test", (route) =>
		route.fulfill({ json: { ok: true } }),
	);
	await page.goto("/me/models");
	const custom = page.getByRole("heading", { name: "自定义供应商", exact: true }).locator("..");
	await expect(custom.getByText("既有设备供应商", { exact: true })).toBeVisible();
	await expect(custom.getByText("工作 Mac · 在线", { exact: true })).toBeVisible();
	await expect(custom.getByRole("button", { name: "编辑供应商" })).toHaveCount(0);
	await expect(page.getByText("http://127.0.0.1:9012/v1", { exact: true })).toHaveCount(0);
	await custom.getByRole("button", { name: "更多操作", exact: true }).click();
	await expect(page.getByRole("button", { name: "复制", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "删除供应商", exact: true })).toBeEnabled();
	await page.getByRole("button", { name: "检测连通", exact: true }).click();
	await expect(custom.getByText("连接成功", { exact: true })).toBeVisible();
	await capture(page, "provider-legacy-relay-list");
});

for (const width of [1280, 390]) {
	test(`provider navigation and dirty draft remain usable without a native dialog at ${width}px`, async ({ page }) => {
		const requests = await setup(page);
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.setViewportSize({ width, height: 900 });
		await page.addInitScript(() => {
			window.confirm = () => {
				throw new Error("No native confirmation in this host");
			};
		});
		await page.goto("/tasks");
		const entry = page.getByRole("button", { name: "我", exact: true });
		await entry.click();
		await page.getByRole("button", { name: "模型", exact: true }).click();
		const back = (path: string) =>
			page.locator(`[data-page-layer="${path}"]`).getByRole("button", { name: "返回", exact: true });
		const open = async () => {
			await page.getByRole("button", { name: "添加供应商", exact: true }).click();
			await page.getByRole("button", { name: "自定义供应商", exact: true }).click();
		};
		const modal = page.getByRole("dialog", { name: "放弃更改", exact: true }).and(page.locator('[aria-modal="true"]'));
		await open();
		await name(page).click();
		await expect(name(page)).toBeFocused();
		await capture(page, `provider-clean-${width}`);
		await back("/me/models/add").click();
		await expect(page).toHaveURL(/\/me\/models$/);
		await open();
		await name(page).fill("浏览器测试");
		await back("/me/models/add").click();
		await expect(modal).toBeVisible({ timeout: 3000 });
		await expect(modal).toBeFocused();
		await expect
			.poll(() => modal.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))
			.toBeCloseTo(0, 0);
		await capture(page, `provider-confirmation-${width}`);
		await page.keyboard.press("Escape");
		await expect(modal).toHaveCount(0);
		await expect(name(page)).toHaveValue("浏览器测试");
		await expect(back("/me/models/add")).toBeFocused();
		// The scrim can disappear before the panel finishes animating. Its portal must not eat clicks.
		await expect(name(page)).toBeEnabled();
		await name(page).focus();
		const editable = await name(page).evaluate((element) => {
			const { x, y, width, height } = element.getBoundingClientRect();
			return document.elementFromPoint(x + width / 2, y + height / 2) === element;
		});
		expect(editable).toBe(true);
		const changePreset = page.getByRole("button", { name: "更换预设", exact: true });
		await changePreset.click();
		await modal.getByRole("button", { name: "取消", exact: true }).click();
		await expect(changePreset).toBeFocused();
		await expect(name(page)).toHaveValue("浏览器测试");
		if (width === 1280) {
			const close = page.getByRole("button", { name: "关闭", exact: true });
			await close.click();
			await modal.getByRole("button", { name: "取消", exact: true }).click();
			await expect(modal).toHaveCount(0);
			await expect(close).toBeFocused();
			await expect(page).toHaveURL(/\/me\/models\/add$/);
		}
		await page.keyboard.press("Escape");
		await expect(modal).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		const discard = modal.getByRole("button", { name: "放弃更改", exact: true });
		await expect(discard).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/me\/models$/);
		await expect(modal).toHaveCount(0);
		await open();
		await expect(name(page)).toHaveValue("");
		await name(page).fill("浏览器测试");
		await url(page).fill("https://models.example.test");
		await page.getByLabel("API Key").fill("synthetic-fixture-only");
		await discover(page).click();
		await expect(discoveredModel(page)).toHaveValue("fixture-model");
		await page.getByRole("button", { name: "保存", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/models$/);
		await expect(page.getByText("浏览器测试", { exact: true })).toBeVisible();
		expect(requests.saves).toHaveLength(1);
		if (width === 390) {
			await back("/me/models").click();
			await expect(page).toHaveURL(/\/me$/);
		}
		await page.getByRole("button", { name: "关闭", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks$/);
		await expect(page.locator("[data-overlay-backdrop]")).toHaveCount(0);
		await expect(entry).toBeFocused();
	});
}

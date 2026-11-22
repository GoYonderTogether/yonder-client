import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type {
	DeviceModelEndpointView,
	DeviceSummary,
	DiscoverModelsRequest,
	Provider,
	SaveProviderRequest,
} from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const dir = process.env.YONDER_PREVIEW_DIR;
async function capture(page: Page, filename: string) {
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await page.screenshot({ path: `${dir}/${filename}.png`, animations: "disabled", scale: "css" });
}
const device: DeviceSummary = {
	id: "production-shaped-desktop-fixture",
	name: "工作 Mac",
	platform: "macos",
	appVersion: "0.3.0",
	status: "online",
	lastSeenAt: "2026-11-22T10:00:00.000Z",
	current: false,
};
const offline: DeviceSummary = {
	...device,
	id: "desktop-offline-fixture",
	name: "另一台 Windows",
	platform: "windows",
	status: "offline",
};
const phone: DeviceSummary = { ...device, id: "phone-fixture", name: "不支持的手机", platform: "ios" };
const endpoint: DeviceModelEndpointView = {
	deviceId: device.id,
	endpointId: "published-endpoint-only",
	revision: 1,
	label: "本地模型 A",
};
const savedCloud: Provider = {
	id: "old-cloud-provider",
	scope: "user",
	name: "既有云端供应商",
	baseUrl: "https://models.example.test",
	enabled: true,
	isDefault: false,
	keyConfigured: true,
	protocol: "openai",
	models: ["legacy"],
};
const expectedTarget = { kind: "device", deviceId: device.id, endpointId: endpoint.endpointId } as const;
async function setup(page: Page, { configured = false }: { configured?: boolean } = {}) {
	await isolateChat(page);
	await page.emulateMedia({ reducedMotion: "reduce" });
	const received: { discovery: DiscoverModelsRequest[]; saves: SaveProviderRequest[] } = { discovery: [], saves: [] };
	let items: Provider[] = configured ? [savedCloud] : [];
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [device, offline, phone] } }));
	await page.route("**/v1/providers/device-endpoints", (route) =>
		route.fulfill({
			json: {
				items: [
					endpoint,
					{ ...endpoint, deviceId: offline.id, endpointId: "already-registered-offline", label: "备用地址" },
					{ ...endpoint, deviceId: phone.id, endpointId: "ineligible", label: "不应显示" },
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
			id: "new-fixture-provider",
			scope: "user",
			baseUrl: payload.baseUrl ?? "",
			enabled: true,
			isDefault: true,
			keyConfigured: !payload.target,
		};
		items = [next, ...items];
		return route.fulfill({ json: next });
	});
	return received;
}
const name = (page: Page) => page.getByRole("textbox", { name: "名称", exact: true });
const url = (page: Page) => page.getByRole("textbox", { name: "请求地址", exact: true });
const location = (page: Page) => page.getByRole("button", { name: /^运行位置:/ });
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
	await page.getByRole("checkbox", { name: "fixture-model" }).check();
	expect(requests.discovery).toEqual([{ protocol: "openai", target: expectedTarget }]);
	await capture(page, "provider-web-device-bound");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	expect(requests.saves).toEqual([
		{
			name: "本机模型 Vol.1",
			note: null,
			website: null,
			models: ["fixture-model"],
			metadata: { "fixture-model": { contextLength: 4096 } },
			protocol: "openai",
			target: expectedTarget,
		},
	]);
	await expect(page.getByText("工作 Mac · 在线", { exact: true })).toBeVisible();
	await expect(page.getByText("密钥未配置", { exact: true })).toHaveCount(0);
	await capture(page, "provider-web-list-device");
});
test("existing cloud key is not revealed and its model request remains the old shape", async ({ page }) => {
	const requests = await setup(page, { configured: true });
	await page.goto("/me/models");
	await page.getByRole("button", { name: "编辑供应商", exact: true }).click();
	await expect(name(page)).toHaveValue("既有云端供应商");
	await discover(page).click();
	await expect(page.getByRole("checkbox", { name: "fixture-model" })).toBeVisible();
	expect(requests.discovery).toEqual([{ protocol: "openai", baseUrl: savedCloud.baseUrl, providerId: savedCloud.id }]);
	expect(requests.saves).toEqual([]);
});

test("desktop shell uses the same editor and keeps localhost in the current-device IPC", async ({ page }) => {
	const requests = await setup(page);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)" });
		localStorage.setItem("dev.yonder.desktop.refresh-token", "browser-fixture");
		const registrations: unknown[] = [];
		Object.assign(window, {
			providerRegistrations: registrations,
			__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
			__TAURI_INTERNALS__: {
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
				transformCallback: () => 1,
				unregisterCallback() {},
				invoke: async (command: string, args: unknown) => {
					if (command.endsWith("get_password")) return "browser-fixture";
					if (command === "device_model_register") {
						registrations.push(args);
						return { endpointId: "native-approved-id", revision: 1, label: "本地模型" };
					}
					return null;
				},
			},
		});
	});
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items: [{ ...device, current: true }] } }));
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
	await page.route("**/v1/providers/device-endpoints", async (route) => {
		checks++;
		const approved = await page.evaluate(
			() => (window as Window & { providerRegistrations: unknown[] }).providerRegistrations.length,
		);
		return route.fulfill({ json: { items: approved ? [{ ...endpoint, endpointId: "native-approved-id" }] : [] } });
	});
	await page.goto("/me/models/add");
	await page.getByRole("button", { name: "继续使用 Yonder" }).click();
	await page.getByRole("button", { name: "自定义供应商", exact: true }).click();
	await expect(location(page)).toHaveText("云端");
	await location(page).click();
	await page.getByRole("option", { name: /工作 Mac.*在线/ }).click();
	await expect(url(page)).toBeEditable();
	await name(page).fill("桌面本地模型");
	await url(page).fill("http://localhost:11434/v1");
	await expect(page.getByLabel("API Key")).toHaveCount(0);
	await capture(page, "provider-desktop-local-address");
	await discover(page).click();
	await page.getByRole("checkbox", { name: "fixture-model" }).check();
	expect(checks).toBeGreaterThan(1);
	const target = { kind: "device", deviceId: device.id, endpointId: "native-approved-id" };
	expect(requests.discovery).toEqual([{ protocol: "openai", target }]);
	const local = await page.evaluate(
		() => (window as Window & { providerRegistrations: unknown[] }).providerRegistrations,
	);
	expect(local).toEqual([
		expect.objectContaining({
			context: { ownerId: "chat-person", deviceId: device.id, sessionId: "local-browser-session" },
			baseUrl: "http://localhost:11434/v1",
		}),
	]);
	await capture(page, "provider-desktop-local-discovered");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect.poll(() => requests.saves.at(-1)?.target).toEqual(target);
	expect(requests.saves.at(-1)).not.toHaveProperty("baseUrl");
	expect(requests.saves.at(-1)).not.toHaveProperty("apiKey");
});

import { expect, type Page, test } from "@playwright/test";
import type { ConnectorDefinition, DeviceSummary } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const connectLabel = "连接其他设备";
const deviceGuide = "在要连接的设备上安装 Yonder，并登录同一账号。";
const iPhone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";
const macOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const catalog: ConnectorDefinition[] = [
	{
		id: "local-files",
		name: "local-files",
		description: "local-files",
		kind: "device",
		platforms: ["windows", "linux"],
	},
	{
		id: "computer-control",
		name: "computer-control",
		description: "computer-control",
		kind: "device",
		platforms: ["windows"],
	},
];

async function isolate(page: Page, platform: DeviceSummary["platform"]) {
	await isolateChat(page, { items: [] });
	const items: DeviceSummary[] = [
		{
			id: "fixture-device",
			name: "测试设备",
			platform,
			current: true,
			status: "online",
			lastSeenAt: "2026-11-19T00:00:00Z",
			appVersion: "0.3.0",
		},
	];
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items } }));
	await page.route(
		(url) => url.pathname === "/v1/connectors/catalog",
		(route) => route.fulfill({ json: { items: catalog } }),
	);
}

async function mockNative(page: Page, userAgent: string, failure: "open" | "share" | null = null, touchPoints = 0) {
	await page.addInitScript(
		({ userAgent, failure, touchPoints }) => {
			const calls: { action: string; url: string }[] = [];
			Object.defineProperty(navigator, "userAgent", { value: userAgent });
			if (touchPoints) Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints });
			localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-device-download");
			Object.assign(window, {
				deviceDownloadCalls: calls,
				__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
				__TAURI_INTERNALS__: {
					metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
					transformCallback: () => 1,
					unregisterCallback() {},
					invoke: async (command: string, args: { url: string }) => {
						if (command === "get_desktop_refresh_token") return "isolated-device-download";
						if (!command.startsWith("plugin:yonder-device-download|")) return null;
						const action = command.split("|")[1] ?? "";
						calls.push({ action, url: args.url });
						if (action === failure && calls.filter((call) => call.action === action).length === 1) {
							throw new Error("Fixture native action failed");
						}
						return null;
					},
				},
			});
		},
		{ userAgent, failure, touchPoints },
	);
	return () => page.evaluate(() => (window as unknown as { deviceDownloadCalls: unknown[] }).deviceDownloadCalls);
}

test("desktop web opens the settings download subpage and Back returns to device management", async ({
	page,
}, info) => {
	await isolate(page, "web");
	await page.goto("/me/devices");
	await page.getByRole("button", { name: connectLabel }).click();
	await expect(page).toHaveURL(/\/me\/devices\/connect$/);
	await expect(page.getByRole("heading", { name: connectLabel })).toBeVisible();
	await expect(page.getByText(deviceGuide)).toBeVisible();
	await expect(page.getByRole("heading", { level: 2 })).toHaveText(["macOS", "Windows", "Android", "iOS", "网页版"]);
	await expect(page.getByText("支持连接器")).toHaveCount(0);
	expect(page.context().pages()).toHaveLength(1);
	const installer = page.getByRole("link", { name: "下载 macOS 版" });
	await page.route("**/desktop/**/*.dmg", (route) =>
		route.fulfill({ headers: { "content-disposition": "attachment; filename=yonder.dmg" }, body: "fixture" }),
	);
	const [download] = await Promise.all([page.waitForEvent("download"), installer.click()]);
	expect(download.suggestedFilename()).toBe("yonder.dmg");
	await expect(page).toHaveURL(/\/me\/devices\/connect$/);
	await page.screenshot({ path: info.outputPath("web-all-downloads.png") });
	await page.goBack();
	await expect(page).toHaveURL(/\/me\/devices$/);
	await expect(page.getByRole("button", { name: connectLabel })).toBeVisible();
});

test("Web asks before opening TestFlight and keeps the settings subpage in the original tab", async ({
	page,
}, info) => {
	await isolate(page, "web");
	const iosUrl = "https://testflight.apple.com/join/8C5Y9KHQ";
	const context = page.context();
	await context.route(iosUrl, (route) => route.fulfill({ body: "TestFlight" }));
	await page.goto("/me/devices/connect");
	const ios = page.getByRole("button", { name: "下载 iOS 版" });
	const confirm = page.getByRole("dialog", { name: "在浏览器中打开" });
	await ios.click();
	await expect(confirm.getByText("将在浏览器中打开下载链接。")).toBeVisible();
	await page.screenshot({ path: info.outputPath("web-browser-confirmation.png") });
	await confirm.getByRole("button", { name: "取消" }).click();
	await expect(confirm).toHaveCount(0);
	expect(context.pages()).toHaveLength(1);

	await ios.click();
	const [popup] = await Promise.all([
		context.waitForEvent("page"),
		confirm.getByRole("button", { name: "继续打开" }).click(),
	]);
	await expect(popup).toHaveURL(iosUrl);
	await expect(page).toHaveURL(/\/me\/devices\/connect$/);
	await expect(confirm).toHaveCount(0);
	await popup.close();
	await page.getByRole("link", { name: "用网页版" }).click();
	await expect(page).toHaveURL(/\/messages$/);
	expect(context.pages()).toHaveLength(1);
});

test.describe("mobile web", () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: iPhone });

	test("connector subpage keeps supported platforms first after reload and returns to connectors", async ({
		page,
	}, info) => {
		await isolate(page, "web");
		await page.goto("/me/connectors");
		await page.getByRole("button", { name: new RegExp(connectLabel) }).click();
		await expect(page).toHaveURL(/\/me\/connectors\/connect\?platform=windows$/);
		await page.reload();
		await expect(page.getByText(deviceGuide)).toBeVisible();
		await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Windows", "macOS", "Android", "iOS", "网页版"]);
		await expect(page.getByRole("region", { name: "Windows" }).getByText("支持连接器")).toBeVisible();
		await expect(page.getByText("支持连接器")).toHaveCount(1);
		await page.screenshot({ path: info.outputPath("web-connector-downloads.png") });
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/connectors$/);
		await expect(page.getByRole("button", { name: new RegExp(connectLabel) })).toBeVisible();
	});
});

for (const { label, platform, userAgent, path, failure } of [
	{ label: "macOS", platform: "macos", userAgent: macOS, path: "/me/connectors", failure: false },
	{ label: "Windows", platform: "windows", userAgent: windows, path: "/me/devices", failure: true },
	{ label: "Android", platform: "android", userAgent: android, path: "/me/devices", failure: false },
] as const) {
	test(`simulated ${label} lists one download per system and opens it in the system browser`, async ({
		page,
	}, info) => {
		await isolate(page, platform);
		const calls = await mockNative(page, userAgent, failure ? "open" : null);
		await page.goto(path);
		await page
			.getByRole("button", { name: new RegExp(connectLabel) })
			.first()
			.click();
		await expect(page).toHaveURL(new RegExp(`${path}/connect`));
		await expect(page.getByText(deviceGuide)).toBeVisible();
		await expect(page.getByRole("dialog", { name: /连接其他设备|在浏览器中打开/ })).toHaveCount(0);
		for (const name of ["分享下载链接", "复制下载链接", "复制链接", "在浏览器中打开"])
			await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
		const action = page.getByRole("button", { name: "下载 Windows 版" });
		await action.click();
		if (failure) {
			await expect(page.getByRole("alert")).toHaveText("无法打开下载页。");
			await action.click();
			await expect(page.getByRole("alert")).toHaveCount(0);
		}
		await expect.poll(calls).toHaveLength(failure ? 2 : 1);
		for (const call of (await calls()) as { action: string; url: string }[]) {
			expect(call.action).toBe("open");
			expect(call.url).toMatch(/_x64-setup\.exe$/);
		}
		await page.screenshot({ path: info.outputPath(`${label}-device-downloads.png`) });
	});
}

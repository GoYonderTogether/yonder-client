import { expect, type Page, test } from "@playwright/test";
import type { ConnectorDefinition, DeviceSummary } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const connectLabel = "连接其他设备";
const deviceGuide = "在要连接的设备上安装 Yonder，并登录同一账号。";
const downloadPath = "/download?connect-device=1";
const connectorPath = `${downloadPath}&platform=windows`;
const publicOrigin = "https://yonder.zethai.cn";
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
	await page.route("**/v1/connectors/catalog", (route) => route.fulfill({ json: { items: catalog } }));
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
						if (command.endsWith("get_password")) return "isolated-device-download";
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

test("desktop web opens all downloads in the same tab and Back returns to device management", async ({
	page,
}, info) => {
	await isolate(page, "web");
	await page.goto("/me/devices");
	await page.getByRole("button", { name: connectLabel }).click();
	await expect(page).toHaveURL(new RegExp(`${downloadPath.replace("?", "\\?")}$`));
	await expect(page.getByText(deviceGuide)).toBeVisible();
	await expect(page.getByRole("heading", { level: 2 })).toHaveText(["macOS", "Windows", "Android", "iOS", "网页版"]);
	await expect(page.getByText("支持连接器")).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("web-all-downloads.png") });
	expect(page.context().pages()).toHaveLength(1);
	await page.goBack();
	await expect(page).toHaveURL(/\/me\/devices$/);
	await expect(page.getByRole("button", { name: connectLabel })).toBeVisible();
});

test.describe("mobile web", () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: iPhone });

	test("connector opens in browser history with supported platforms first", async ({ page }, info) => {
		await isolate(page, "web");
		await page.goto("/me/connectors");
		await page.getByRole("button", { name: new RegExp(connectLabel) }).click();
		await expect(page).toHaveURL(new RegExp(`${connectorPath.replace("?", "\\?")}$`));
		await expect(page.getByText(deviceGuide)).toBeVisible();
		await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Windows", "macOS", "Android", "iOS", "网页版"]);
		await expect(page.getByRole("region", { name: "Windows" }).getByText("支持连接器")).toBeVisible();
		await expect(page.getByText("支持连接器")).toHaveCount(1);
		await page.screenshot({ path: info.outputPath("web-connector-downloads.png") });
		await page.goBack();
		await expect(page).toHaveURL(/\/me\/connectors$/);
		await expect(page.getByRole("button", { name: new RegExp(connectLabel) })).toBeVisible();
	});
});

test("simulated macOS opens the public URL through the native default-browser bridge", async ({ page }) => {
	await isolate(page, "macos");
	const calls = await mockNative(page, macOS);
	await page.goto("/me/connectors");
	await page.getByRole("button", { name: new RegExp(connectLabel) }).click();
	await expect.poll(calls).toEqual([{ action: "open", url: publicOrigin + connectorPath }]);
	await expect(page).toHaveURL(/\/me\/connectors$/);
	await expect(page.getByRole("dialog", { name: connectLabel })).toHaveCount(0);
});

test("simulated Windows can copy the download link when the system browser fails", async ({ page }, info) => {
	await isolate(page, "windows");
	const calls = await mockNative(page, windows, "open");
	await page.goto("/me/devices");
	await page.getByRole("button", { name: connectLabel }).click();
	const dialog = page.getByRole("dialog", { name: connectLabel });
	await expect(dialog.getByRole("alert")).toHaveText("无法打开下载页。");
	await page.screenshot({ path: info.outputPath("windows-browser-fallback.png") });
	await dialog.getByRole("button", { name: "复制下载链接" }).click();
	await expect(dialog.getByRole("status")).toHaveText("已复制");
	await dialog.getByRole("button", { name: "关闭" }).click();
	await expect(dialog).toHaveCount(0);
	await page.getByRole("button", { name: connectLabel }).click();
	await expect
		.poll(calls)
		.toEqual(["open", "copy", "open"].map((action) => ({ action, url: publicOrigin + downloadPath })));
	await expect(page).toHaveURL(/\/me\/devices$/);
});

for (const { label, platform, userAgent, path, download, failure } of [
	{ label: "ios", platform: "ios", userAgent: iPhone, path: "/me/connectors", download: connectorPath, failure: null },
	{ label: "ipad", platform: "ios", userAgent: macOS, path: "/me/devices", download: downloadPath, failure: null },
	{
		label: "android",
		platform: "android",
		userAgent: android,
		path: "/me/devices",
		download: downloadPath,
		failure: "share",
	},
] as const) {
	test.describe(`simulated ${label}`, () => {
		test.use({
			viewport: label === "ipad" ? { width: 768, height: 1024 } : { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
			reducedMotion: "reduce",
		});

		test("offers share first and supports clipboard and external browser actions", async ({ page }, info) => {
			await isolate(page, platform);
			const calls = await mockNative(page, userAgent, failure, label === "ipad" ? 5 : 0);
			await page.goto(path);
			await page.getByRole("button", { name: new RegExp(connectLabel) }).click();
			const dialog = page.getByRole("dialog", { name: connectLabel });
			await expect(dialog.getByText(deviceGuide)).toBeVisible();
			await expect(dialog.getByRole("button")).toHaveText(["", "分享下载链接", "复制链接", "在浏览器中打开"]);
			await expect.poll(calls).toEqual([]);
			await page.screenshot({ path: info.outputPath(`${label}-device-download-sheet.png`) });
			const share = dialog.getByRole("button", { name: "分享下载链接" });
			await share.click();
			if (failure) {
				await expect(dialog.getByRole("alert")).toHaveText("无法分享下载链接。");
				await share.click();
			}
			await expect(dialog.getByRole("alert")).toHaveCount(0);
			await dialog.getByRole("button", { name: "复制链接" }).click();
			await expect(dialog.getByRole("status")).toHaveText("已复制");
			await dialog.getByRole("button", { name: "在浏览器中打开" }).click();
			await expect(dialog).toHaveCount(0);
			await expect.poll(calls).toEqual(
				[...(failure ? ["share"] : []), "share", "copy", "open"].map((action) => ({
					action,
					url: publicOrigin + download,
				})),
			);
			await expect(page).toHaveURL(new RegExp(`${path}$`));
		});
	});
}

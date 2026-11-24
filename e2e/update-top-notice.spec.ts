import { devices, expect, type Page, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

type Shell = "web" | "windows" | "android" | "ios";
const version = "0.3.26112499";
const sha = "a".repeat(64);
const testFlight = "https://testflight.apple.com/join/Abcd1234";
const { defaultBrowserType: _android, ...android } = devices["Pixel 7"];
const { defaultBrowserType: _ios, ...ios } = devices["iPhone 13"];
const desktop = { viewport: { width: 1280, height: 832 } };
const calls = (page: Page) =>
	page.evaluate(() => (window as Window & { updateCommands?: string[] }).updateCommands ?? []);

test.use({
	reducedMotion: "reduce",
	launchOptions: {
		args: [
			"--disable-gpu",
			"--disable-software-rasterizer",
			"--no-zygote",
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
		],
	},
});

async function prepare(page: Page, platform: Shell, absent = false) {
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1" ? route.fallback() : route.abort("blockedbyclient"),
	);
	const socket = await isolateChat(page, {
		items: [
			message("preview-01", "稍后帮我整理一下今天讨论的产品方案。", true),
			message("preview-02", "好，我会按决策、待解决的问题和下一步来整理。"),
		],
	});
	if (platform !== "web")
		await page.addInitScript(
			({ platform, version, sha }) => {
				const updateCommands: string[] = [];
				Object.assign(window, { updateCommands });
				localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-fixture");
				if (platform === "windows")
					Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
				Object.defineProperty(window, "__TAURI_INTERNALS__", {
					value: {
						invoke: async (command: string, args?: { url?: string }) => {
							updateCommands.push(args?.url ? `${command} ${args.url}` : command);
							switch (command) {
								case "get_desktop_refresh_token":
									return "isolated-fixture";
								case "plugin:updater|check":
									return { rid: 8, version, currentVersion: "0.3.26112408" };
								case "plugin:updater|download":
									return 9;
								case "plugin:android-update|versionCode":
									return { versionCode: 26112408 };
								case "plugin:android-update|latest":
									return {
										version,
										versionCode: 26112499,
										sha256: sha,
										url: "https://dl.zethai.cn/android/yonder.apk",
									};
								case "plugin:yonder-notifications|permission_status":
									return document.documentElement.dataset.fixturePermission ?? "granted";
								case "plugin:yonder-notifications|push_registration":
									return platform === "android" ? { provider: "fcm", token: "fixture-token" } : null;
								case "plugin:meeting-recorder|set_owner":
								case "plugin:meeting-recorder|get_state":
									return { supported: false, recordings: [], activeId: null };
								default:
									return null;
							}
						},
						transformCallback: () => 1,
						unregisterCallback: () => undefined,
						metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
					},
				});
			},
			{ platform, version, sha },
		);
	const post: unknown[] = [];
	const get: string[] = [];
	await page.route("**/v1/devices/update**", async (route) => {
		const request = route.request();
		if (request.method() === "POST") {
			post.push(request.postDataJSON());
			return route.fulfill({ json: { ok: true } });
		}
		const channel = new URL(request.url()).searchParams.get("channel") ?? "";
		get.push(channel);
		if (absent) return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
		return route.fulfill({
			json: {
				release: {
					id: `fixture-${platform}`,
					platform,
					channel,
					version,
					url: platform === "ios" ? testFlight : "https://not-an-installer.invalid",
				},
			},
		});
	});
	await page.goto("/messages/main");
	await expect(page.getByText("好，我会按决策、待解决的问题和下一步来整理。")).toBeVisible();
	return { post, get, socket, notice: page.getByRole("complementary", { name: "有可用的新版本" }) };
}

test.describe("desktop", () => {
	test.use(desktop);
	test("signed desktop candidate stages before a single actionable top notice", async ({ page }, info) => {
		const { notice } = await prepare(page, "windows");
		await expect(notice).toBeVisible();
		expect(await calls(page)).toContain("plugin:updater|download");
		expect(await calls(page)).not.toContain("plugin:updater|install");
		await expect(page.getByRole("button", { name: /已下载.*重启/ })).toHaveCount(0);
		await page.mouse.click(30, 334);
		await expect(notice).toBeVisible();
		await page.screenshot({ path: info.outputPath("01-desktop-ready.png"), animations: "disabled", scale: "css" });
		await notice.getByRole("button", { name: "立即更新" }).click();
		await expect.poll(() => calls(page)).toContain("plugin:updater|install");
	});

	test("old API is silent; a later foreground does not turn it into a toast", async ({ page }) => {
		const { notice, get } = await prepare(page, "windows", true);
		await expect.poll(() => get.length).toBeGreaterThan(0);
		await expect(notice).toHaveCount(0);
		expect(await calls(page)).not.toContain("plugin:updater|check");
	});
});

test.describe("Android", () => {
	test.use(android);
	test("a verified package only opens Android confirmation after tap; permission state scopes push", async ({
		page,
	}, info) => {
		const { notice, post } = await prepare(page, "android");
		await expect(notice).toBeVisible();
		await expect
			.poll(() =>
				calls(page).then((items) => items.some((value) => value.startsWith("plugin:android-update|download "))),
			)
			.toBe(true);
		expect(await calls(page)).not.toContain("plugin:android-update|install");
		await expect
			.poll(() => post)
			.toEqual(
				expect.arrayContaining([
					{ channel: "stable", releaseId: "fixture-android" },
					{ channel: "stable", systemPush: true },
				]),
			);
		await page.screenshot({ path: info.outputPath("02-android-ready.png"), animations: "disabled", scale: "css" });
		await page.evaluate(() => {
			document.documentElement.dataset.fixturePermission = "denied";
			window.dispatchEvent(new Event("yonder:notification-permission-changed"));
		});
		await expect.poll(() => post).toContainEqual({ channel: "stable", systemPush: false });
		await notice.getByRole("button", { name: "立即更新" }).click();
		await expect.poll(() => calls(page)).toContain("plugin:android-update|install");
		await expect(notice).toHaveCount(0);
	});

	test("Later hides this release across a reload without introducing a tab badge", async ({ page }, info) => {
		const { get, notice } = await prepare(page, "android");
		await expect(notice).toBeVisible();
		await notice.getByRole("button", { name: "稍后" }).click();
		await expect(notice).toHaveCount(0);
		await page.screenshot({
			path: info.outputPath("06-android-later-hidden.png"),
			animations: "disabled",
			scale: "css",
		});
		const checks = get.length;
		await page.reload();
		await expect.poll(() => get.length).toBeGreaterThan(checks);
		await expect(page.getByText("好，我会按决策、待解决的问题和下一步来整理。")).toBeVisible();
		await expect(notice).toHaveCount(0);
	});
});

test.describe("iOS", () => {
	test.use(ios);
	test("internal build opens only the confirmed Apple invitation upon explicit click", async ({ page }, info) => {
		test.skip(
			process.env.YONDER_TESTFLIGHT_FIXTURE !== "1",
			"Build this isolated browser fixture with the TestFlight internal channel",
		);
		const { notice, get } = await prepare(page, "ios");
		await expect(notice).toBeVisible();
		expect(get).toContain("testflight-internal");
		expect(await calls(page)).not.toContain(`plugin:opener|open_url ${testFlight}`);
		await page.screenshot({
			path: info.outputPath("03-ios-testflight-ready.png"),
			animations: "disabled",
			scale: "css",
		});
		await notice.getByRole("button", { name: "立即更新" }).click();
		await expect.poll(() => calls(page)).toContain(`plugin:opener|open_url ${testFlight}`);
	});
});

test.describe("Web", () => {
	test.use(desktop);
	test("a data-free socket hint and subsequent reconnect both refresh the authenticated offer", async ({ page }) => {
		const { get, notice, socket } = await prepare(page, "web");
		await expect(notice).toBeVisible();
		await expect.poll(socket.connected).toBe(true);
		const startup = get.length;
		socket.updateOffer();
		await expect.poll(() => get.length).toBeGreaterThan(startup);
		const hinted = get.length;
		await socket.disconnect();
		await expect.poll(() => get.length).toBeGreaterThan(hinted);
		await expect(notice).toHaveCount(1);
	});

	test("a collapsed ongoing recording blocks explicit update", async ({ page }, info) => {
		const { notice } = await prepare(page, "web");
		await expect(notice).toBeVisible();
		await page.getByRole("button", { name: "添加附件" }).click();
		await page.getByRole("button", { name: "录音笔记", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "实时转写" });
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "收起录音" }).click();
		await expect(dialog).toHaveCount(0);
		await notice.getByRole("button", { name: "立即更新" }).click();
		await expect(notice.getByText("结束录音后才能更新。")).toBeVisible();
		await page.screenshot({
			path: info.outputPath("04-web-recording-blocked.png"),
			animations: "disabled",
			scale: "css",
		});
	});

	test("preparation waits for the real IndexedDB draft transaction, then reload restores it", async ({
		page,
	}, info) => {
		const { notice } = await prepare(page, "web");
		await expect(notice).toBeVisible();
		const text = page.locator("textarea");
		const draft = "评审通过后，继续补上今天的三个待办。";
		await text.fill(draft);
		await page.evaluate(() => {
			const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
			if (!descriptor?.set) throw new Error("Missing IndexedDB completion descriptor");
			const set = descriptor.set;
			Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
				...descriptor,
				set(handler) {
					set.call(
						this,
						typeof handler === "function"
							? (event: Event) => setTimeout(() => handler.call(this, event), 1800)
							: handler,
					);
				},
			});
		});
		await notice.getByRole("button", { name: "立即更新" }).click();
		await expect(notice.getByText("正在准备更新…")).toBeVisible();
		await expect(text).toHaveValue(draft);
		await page.screenshot({
			path: info.outputPath("05-web-preparing-draft-retained.png"),
			animations: "disabled",
			scale: "css",
		});
		await expect(notice).toHaveCount(0);
		await expect(text).toHaveValue(draft);
	});
});

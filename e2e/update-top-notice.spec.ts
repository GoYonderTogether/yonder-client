import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

type Shell = "web" | "windows" | "android" | "ios";
const version = "0.3.26112499";
const sha = "a".repeat(64);
const testFlight = "https://testflight.apple.com/join/Abcd1234";
const { defaultBrowserType: _android, ...android } = devices["Pixel 7"];
const { defaultBrowserType: _ios, ...ios } = devices["iPhone 13"];
const narrowAndroid = { ...android, viewport: { width: 320, height: 700 } };
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

const allowDownload = (page: Page) =>
	page.evaluate(() => (window as Window & { releaseUpdateStage?: () => void }).releaseUpdateStage?.());

async function assertSingleLine(notice: Locator, primary: string) {
	const title = notice.getByRole("heading", { name: "有新版本" });
	const button = notice.getByRole("button", { name: primary });
	await expect(button).toBeVisible();
	await expect(notice).toHaveText(`有新版本${primary}稍后`);
	const [headingBox, buttonBox] = await Promise.all([title.boundingBox(), button.boundingBox()]);
	expect(
		headingBox && buttonBox && Math.abs(headingBox.y + headingBox.height / 2 - buttonBox.y - buttonBox.height / 2),
	).toBeLessThan(3);
}

async function prepare(page: Page, platform: Shell, absent = false, holdStage = false, dark = false) {
	await page.route("**/*", (route) =>
		new URL(route.request().url()).hostname === "127.0.0.1" ? route.fallback() : route.abort("blockedbyclient"),
	);
	const socket = await isolateChat(page, {
		dark,
		items: [
			message("preview-01", "稍后帮我整理一下今天讨论的产品方案。", true),
			message("preview-02", "好，我会按决策、待解决的问题和下一步来整理。"),
		],
	});
	if (platform !== "web")
		await page.addInitScript(
			({ platform, version, sha, holdStage }) => {
				const updateCommands: string[] = [];
				let releaseUpdateStage: () => void = () => {};
				const staging = holdStage
					? new Promise<void>((done) => {
							releaseUpdateStage = done;
						})
					: Promise.resolve();
				Object.assign(window, { updateCommands, releaseUpdateStage });
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
									await staging;
									return 9;
								case "plugin:android-update|download":
									await staging;
									return null;
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
			{ platform, version, sha, holdStage },
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
	return { post, get, socket, notice: page.getByRole("complementary", { name: "有新版本" }) };
}

for (const name of ["mobile", "desktop"] as const) {
	test.describe(`layout overlay on ${name}`, () => {
		test.use(name === "mobile" ? narrowAndroid : desktop);
		test("notice and transient errors never move app chrome, and an upward swipe dismisses", async ({ page }, info) => {
			await page.addInitScript(() => {
				Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
					value: async () => {
						throw new DOMException("Fixture permission denial", "NotAllowedError");
					},
				});
			});
			const { notice } = await prepare(page, "web", false, false, name === "mobile");
			if (name === "mobile")
				await page.evaluate(() => {
					document.documentElement.dataset.nativeMobile = "true";
					document.documentElement.style.setProperty("--native-safe-area-inset-top", "59px");
				});
			await assertSingleLine(notice, "立即刷新");
			const layout = () =>
				page.evaluate((mobile) => {
					const selectors = [
						"[data-layout-mode]",
						'[data-page-layer="detail"] [data-chat-agent-title]',
						'[role="log"]',
						'[data-page-layer="detail"] .composer-layout',
						mobile ? "[data-mobile-dock] nav" : "nav:has([data-tauri-drag-region])",
					];
					return selectors.map((selector) => {
						const element = document.querySelector(selector);
						if (!element) throw new Error(`Missing layout element: ${selector}`);
						return { ...element.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop };
					});
				}, name === "mobile");
			const withOffer = await layout();
			await page.screenshot({ path: info.outputPath(`${name}-update-overlay.png`), animations: "disabled" });
			await page.getByRole("button", { name: "添加附件" }).click();
			await page.getByRole("button", { name: "录音笔记", exact: true }).click();
			const passive = page.getByText("请在系统设置中允许麦克风访问。", { exact: true });
			await expect(passive).toBeVisible();
			await expect(passive).toHaveCSS("pointer-events", "none");
			const offerBox = await notice.boundingBox();
			const passiveBox = await passive.boundingBox();
			if (!offerBox || !passiveBox) throw new Error("Expected both notices");
			expect(passiveBox.y).toBeGreaterThan(offerBox.y + offerBox.height);
			await expect(notice.getByRole("button", { name: "稍后" })).toHaveCSS("pointer-events", "auto");
			await expect.poll(layout).toEqual(withOffer);
			await page.screenshot({ path: info.outputPath(`${name}-stacked-overlay.png`), animations: "disabled" });
			const titleBox = await notice.getByRole("heading").boundingBox();
			if (!titleBox) throw new Error("Missing title");
			const point = { x: titleBox.x + titleBox.width / 2, y: titleBox.y + titleBox.height / 2 };
			await page.mouse.move(point.x, point.y);
			await page.mouse.down();
			await page.mouse.move(point.x, point.y - 32);
			await page.mouse.up();
			await expect(notice).toHaveCount(0);
			await expect(passive).toBeVisible();
			await expect.poll(layout).toEqual(withOffer);
			await expect(passive).toHaveCount(0, { timeout: 5_000 });
			await expect.poll(layout).toEqual(withOffer);
			await page.screenshot({ path: info.outputPath(`${name}-no-notices.png`), animations: "disabled" });
		});
	});
}

test.describe("desktop", () => {
	test.use(desktop);
	test("signed desktop candidate stages before a single actionable top notice", async ({ page }, info) => {
		const { notice } = await prepare(page, "windows", false, true);
		await assertSingleLine(notice, "下载并更新");
		await expect.poll(() => calls(page)).toContain("plugin:updater|download");
		await page.screenshot({
			path: info.outputPath("01-desktop-downloading.png"),
			animations: "disabled",
			scale: "css",
		});
		await allowDownload(page);
		await assertSingleLine(notice, "重启后更新");
		expect(await calls(page)).not.toContain("plugin:updater|install");
		await expect(page.getByRole("button", { name: /已下载.*重启/ })).toHaveCount(0);
		await page.mouse.click(30, 334);
		await expect(notice).toBeVisible();
		await page.screenshot({ path: info.outputPath("02-desktop-ready.png"), animations: "disabled", scale: "css" });
		await notice.getByRole("button", { name: "重启后更新" }).click();
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
	test.use(narrowAndroid);
	test("a verified package only opens Android confirmation after tap; permission state scopes push", async ({
		page,
	}, info) => {
		const { notice, post } = await prepare(page, "android", false, true);
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
		await assertSingleLine(notice, "下载并更新");
		await page.screenshot({
			path: info.outputPath("03-android-downloading.png"),
			animations: "disabled",
			scale: "css",
		});
		await page.evaluate(() => {
			document.documentElement.dataset.fixturePermission = "denied";
			window.dispatchEvent(new Event("yonder:notification-permission-changed"));
		});
		await expect.poll(() => post).toContainEqual({ channel: "stable", systemPush: false });
		await notice.getByRole("button", { name: "下载并更新" }).click();
		await expect(notice.getByRole("button", { name: "下载并更新" })).toBeDisabled();
		expect(await calls(page)).not.toContain("plugin:android-update|install");
		await allowDownload(page);
		await expect.poll(() => calls(page)).toContain("plugin:android-update|install");
		expect((await calls(page)).filter((value) => value.startsWith("plugin:android-update|download "))).toHaveLength(1);
		await expect(notice).toHaveCount(0);
	});

	test("Later hides this release across a reload without introducing a tab badge", async ({ page }, info) => {
		const { get, notice } = await prepare(page, "android");
		await assertSingleLine(notice, "安装更新");
		await page.screenshot({ path: info.outputPath("04-android-ready.png"), animations: "disabled", scale: "css" });
		await notice.getByRole("button", { name: "稍后" }).click();
		await expect(notice).toHaveCount(0);
		await page.screenshot({
			path: info.outputPath("05-android-later-hidden.png"),
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
		await assertSingleLine(notice, "打开 TestFlight");
		expect(get).toContain("testflight-internal");
		expect(await calls(page)).not.toContain(`plugin:opener|open_url ${testFlight}`);
		await page.screenshot({
			path: info.outputPath("06-ios-testflight-ready.png"),
			animations: "disabled",
			scale: "css",
		});
		await notice.getByRole("button", { name: "打开 TestFlight" }).click();
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
		await assertSingleLine(notice, "立即刷新");
		await expect(notice.getByRole("button", { name: "立即刷新" })).toBeDisabled();
		await page.screenshot({
			path: info.outputPath("07-web-recording-blocked.png"),
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
		await notice.getByRole("button", { name: "立即刷新" }).click();
		await assertSingleLine(notice, "立即刷新");
		await expect(notice.getByRole("button", { name: "立即刷新" })).toBeDisabled();
		await expect(text).toHaveValue(draft);
		await page.screenshot({
			path: info.outputPath("08-web-draft-checkpoint.png"),
			animations: "disabled",
			scale: "css",
		});
		await expect(notice).toHaveCount(0);
		await expect(text).toHaveValue(draft);
	});
	test("a failed durable draft write never reloads or drops the live draft", async ({ page }) => {
		const { notice } = await prepare(page, "web");
		const text = page.locator("textarea");
		const refresh = notice.getByRole("button", { name: "立即刷新" });
		await text.fill("不能丢掉的本地草稿。");
		await expect(refresh).toBeEnabled();
		await page.evaluate(() => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (...args) {
				if (this.transaction.db.name === "yonder-chat") {
					document.documentElement.dataset.fixtureDraftRejected = "true";
					throw new DOMException("Synthetic storage failure", "QuotaExceededError");
				}
				return put.apply(this, args);
			};
		});
		let navigated = false;
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) navigated = true;
		});
		await refresh.click();
		await expect(page.locator("html")).toHaveAttribute("data-fixture-draft-rejected", "true");
		await expect(refresh).toBeEnabled();
		await assertSingleLine(notice, "立即刷新");
		await expect(text).toHaveValue("不能丢掉的本地草稿。");
		expect(navigated).toBe(false);
	});
});

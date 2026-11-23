import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const { version } = JSON.parse(readFileSync(new URL("../apps/web/package.json", import.meta.url), "utf8")) as {
	version: string;
};
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
const downloadRoot = `https://dl.zethai.cn/desktop/${version}/Yonder_${version}`;
const androidApk = "https://dl.zethai.cn/android/yonder-android.apk";

test.use({ locale: "en-US" });

test("the filing appears in both languages on the filed host only", async ({ page, baseURL }, info) => {
	await page.route(/^https:\/\/(yonderbot\.net|yonder\.zethai\.cn)\//, async (route) => {
		const { pathname, search } = new URL(route.request().url());
		const response = await route.fetch({ url: new URL(pathname + search, baseURL).href });
		await route.fulfill({ response });
	});
	const filing = page.locator("footer").getByRole("link", { name: /鄂ICP备2026027205号-2/ });
	await page.goto("https://yonderbot.net/");
	await expect(filing).toHaveText("ICP filing: 鄂ICP备2026027205号-2");
	await expect(filing).toHaveAttribute("href", "https://beian.miit.gov.cn/");
	await page.getByRole("button", { name: "中文", exact: true }).click();
	await expect(filing).toHaveText("鄂ICP备2026027205号-2");
	await page.locator("footer").screenshot({ path: info.outputPath("yonderbot-icp-footer.png") });
	for (const url of ["https://yonder.zethai.cn/", "/"]) {
		await page.goto(url);
		await expect(page.locator("footer")).toBeVisible();
		await expect(filing).toHaveCount(0);
	}
});

async function watchDownloads(page: Page) {
	await page.addInitScript(() => {
		const seen: string[] = [];
		Object.assign(window, { seenDownloadLinks: seen });
		new MutationObserver(() => {
			for (const link of document.querySelectorAll("a[href]")) {
				const href = link.getAttribute("href") ?? "";
				if (/\.(dmg|exe|apk)(?:$|[?#])/i.test(href)) seen.push(href);
			}
		}).observe(document, { childList: true, attributes: true, subtree: true });
	});
}

async function seenDownloads(page: Page): Promise<string[]> {
	return page.evaluate(() => (window as unknown as { seenDownloadLinks: string[] }).seenDownloadLinks);
}

test.describe("desktop landing", () => {
	test.use({ userAgent: mac, locale: "en-US" });

	test("offers the matching installer and remembers a manual choice for seven days", async ({ page }) => {
		await watchDownloads(page);
		await page.goto("/?next=%2Fother");
		await expect(page.getByRole("link", { name: "Download for macOS" })).toHaveAttribute(
			"href",
			`${downloadRoot}_aarch64.dmg`,
		);
		await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible();
		const seen = await seenDownloads(page);
		expect(seen).toContain(`${downloadRoot}_aarch64.dmg`);
		expect(seen.every((href) => href === `${downloadRoot}_aarch64.dmg`)).toBe(true);
		await page.keyboard.press("Tab");
		await expect(page.locator(":focus-visible")).toHaveCount(1);
		await page.getByText("Wrong platform? Choose manually", { exact: true }).click();
		const before = Date.now();
		await page.getByRole("button", { name: "Windows", exact: true }).click();
		await expect(page.getByRole("link", { name: "Download for Windows" })).toHaveAttribute(
			"href",
			`${downloadRoot}_x64-setup.exe`,
		);
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("yonder.landing.platform") ?? "null"));
		expect(saved.platform).toBe("windows");
		expect(saved.expiresAt).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
		expect(saved.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
		await page.reload();
		await expect(page.getByRole("link", { name: "Download for Windows" })).toBeVisible();
		await page.evaluate(() => {
			const saved = JSON.parse(localStorage.getItem("yonder.landing.platform") ?? "null");
			saved.expiresAt = Date.now() - 1;
			localStorage.setItem("yonder.landing.platform", JSON.stringify(saved));
		});
		await page.reload();
		await expect(page.getByRole("link", { name: "Download for macOS" })).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem("yonder.landing.platform"))).toBeNull();
	});
});

test.describe("in-app landing", () => {
	test.use({
		userAgent: `${iphone} MicroMessenger/8.0`,
		locale: "zh-CN",
		permissions: ["clipboard-read", "clipboard-write"],
	});

	test("never flashes an installer, even after manual selection, and copies the link", async ({ page }) => {
		await watchDownloads(page);
		await page.goto("/");
		await expect(page.getByRole("link", { name: "用网页版" })).toBeVisible();
		await expect(page.getByText("在微信中，点右上角 ···，选在浏览器打开。")).toBeVisible();
		await page.getByText("不对？手动选", { exact: true }).click();
		await page.getByRole("button", { name: "Windows", exact: true }).click();
		await expect(page.locator('a[href$=".exe"], a[href$=".dmg"], a[href$=".apk"]')).toHaveCount(0);
		expect(await seenDownloads(page)).toEqual([]);
		await page.getByRole("button", { name: "复制链接" }).click();
		await expect(page.getByRole("status").filter({ hasText: /^已复制$/ })).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
	});
});

test("iPhone offers the public TestFlight link and the web version", async ({ browser }) => {
	const context = await browser.newContext({ userAgent: iphone, locale: "en-US" });
	const page = await context.newPage();
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Download for iOS" })).toHaveAttribute(
		"href",
		"https://testflight.apple.com/join/8C5Y9KHQ",
	);
	await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible();
	await context.close();
});

test("Android offers the APK and the web version", async ({ browser }) => {
	const context = await browser.newContext({ userAgent: android, locale: "en-US" });
	const page = await context.newPage();
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Download for Android" })).toHaveAttribute("href", androidApk);
	await page.getByRole("link", { name: "Use web version" }).click();
	await expect(page).toHaveURL(/\/sign-in/);
	await context.close();
});

test("both public pages work when API requests fail", async ({ page }) => {
	await page.route("**/v1/**", (route) => route.abort());
	await page.goto("/");
	await expect(page.getByRole("link", { name: /Use web version|用网页版/ })).toBeVisible();
	await page.goto("/download");
	await expect(page.getByText("macOS", { exact: true })).toBeVisible();
	await expect(page.getByText("Windows", { exact: true })).toBeVisible();
	await expect(page.getByText("Android", { exact: true })).toBeVisible();
	await expect(page.getByText("iOS", { exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "macOS" })).toContainText(`Version ${version}`);
	await expect(page.getByRole("region", { name: "macOS" })).toContainText("Apple silicon");
	await expect(page.getByRole("region", { name: "Windows" })).toContainText("64-bit Windows 10+");
	await expect(page.getByText("Not available", { exact: true })).toHaveCount(0);
	await expect(page.locator('a[href$=".dmg"]')).toHaveAttribute("href", `${downloadRoot}_aarch64.dmg`);
	await expect(page.locator('a[href$=".exe"]')).toHaveAttribute("href", `${downloadRoot}_x64-setup.exe`);
	await expect(page.locator('a[href$=".apk"]')).toHaveAttribute("href", androidApk);
});

test("the landing page appears when the session refresh hangs", async ({ page }) => {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/v1/auth/refresh", async (route) => {
		await pending;
		await route.abort();
	});
	const requested = page.waitForRequest("**/v1/auth/refresh", { timeout: 5000 });
	try {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await requested;
		await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible({ timeout: 10000 });
	} finally {
		release();
	}
});

test("a shell without a session goes to sign in", async ({ page }) => {
	await page.addInitScript(() => {
		Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => null } });
	});
	await page.goto("/");
	await expect(page).toHaveURL(/\/sign-in$/);
	await expect(page.getByRole("link", { name: /All downloads|全部下载/ })).toHaveCount(0);
});

test("a shell with stored credentials enters the app while session refresh hangs", async ({ page }) => {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.addInitScript(() => {
		Object.assign(window, { __TAURI_INTERNALS__: { invoke: async () => "test-token" } });
	});
	await page.route("**/v1/auth/refresh", async (route) => {
		await pending;
		await route.abort();
	});
	const requested = page.waitForRequest("**/v1/auth/refresh", { timeout: 5000 });
	try {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await requested;
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(page.getByRole("link", { name: /All downloads|全部下载/ })).toHaveCount(0);
	} finally {
		release();
	}
});

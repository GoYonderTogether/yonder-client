import { devices, expect, test } from "@playwright/test";
import { bodies, conversation, isolateChat } from "./chat-fixture.ts";

const launchPath = "/messages/main";

test("Chrome can install Yonder, and a returning user can retry the same conversation after reconnecting", async ({
	context,
	page,
}) => {
	await isolateChat(page);
	await page.goto(launchPath);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/push-sw\.js$/);

	const cdp = await context.newCDPSession(page);
	const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
	// Playwright's isolated browser context is incognito, where Chrome disables installing apps.
	expect(installabilityErrors.filter((error) => error.errorId !== "in-incognito")).toEqual([]);

	const direct = `/messages/${conversation.id}?from=install#latest`;
	await context.setOffline(true);
	const offline = await page.goto(direct);
	expect(offline?.fromServiceWorker()).toBe(true);
	expect(offline?.status()).toBe(503);
	await expect(page.getByRole("heading", { name: "网络连接已断开" })).toBeVisible();
	await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === direct);

	await context.setOffline(false);
	await page.getByRole("button", { name: "重试", exact: true }).click();
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === direct);

	for (const path of ["/v1/pwa-test", "/files/pwa-test"]) {
		await page.route(`**${path}`, (route) => route.fulfill({ status: 404, body: "missing" }));
		const response = await page.goto(path);
		expect(response?.fromServiceWorker()).toBe(false);
		expect(response?.status()).toBe(404);
	}
});

test.describe("mobile launch", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["Pixel 7"];
	test.use(phone);

	test("the installed app opens the main Bot route and signs guests in through the normal guard", async ({ page }) => {
		await page.route("**/v1/auth/refresh", (route) =>
			route.fulfill({ status: 401, json: { error: { code: "unauthorized" } } }),
		);
		await page.goto("/");
		const href = await page.locator('link[rel="manifest"]').getAttribute("href");
		if (!href) throw new Error("missing web app manifest");
		const response = await page.request.get(href);
		await expect(response).toBeOK();
		const manifest = await response.json();
		expect(manifest).toMatchObject({ id: "/", scope: "/", start_url: launchPath, display: "standalone" });
		await page.goto(manifest.start_url);
		await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === launchPath);
		await expect(page.locator("#sign-in-phone")).toBeVisible();
	});
});

test.describe("iOS standalone launch", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	test.use(phone);

	test("the first launch skips the browser's copied cookie, then restores a session created in the app", async ({
		baseURL,
		context,
		page,
	}) => {
		if (!baseURL) throw new Error("missing browser test origin");
		await isolateChat(page);
		await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
		await context.addCookies([
			{ name: "yonder_rt", value: "copied", domain: new URL(baseURL).hostname, path: "/v1/auth", httpOnly: true },
		]);
		const refreshCookies: Array<string | undefined> = [];
		await page.route("**/v1/auth/refresh", async (route) => {
			refreshCookies.push((await route.request().allHeaders()).cookie);
			await route.fulfill({ json: { accessToken: "restored-pwa-session", expiresIn: 3600 } });
		});
		await page.route("**/v1/auth/password", (route) =>
			route.fulfill({
				headers: { "set-cookie": "yonder_rt=installed; Path=/v1/auth; HttpOnly; SameSite=Lax" },
				json: { isNewAccount: false, accessToken: "new-pwa-session", expiresIn: 3600 },
			}),
		);

		await page.goto(launchPath);
		await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === launchPath);
		expect(refreshCookies).toEqual([]);
		await page.getByRole("button", { name: "用密码登录" }).click();
		await page.getByLabel("手机号").fill("13800138000");
		await page.getByLabel("密码", { exact: true }).fill("example-password");
		await page.getByRole("button", { name: "登录", exact: true }).click();
		await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
		await expect(page).toHaveURL((url) => url.pathname === launchPath);

		await page.reload();
		await expect.poll(() => refreshCookies).toEqual(["yonder_rt=installed"]);
		await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	});
});

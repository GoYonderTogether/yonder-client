import { devices, expect, type Page, test } from "@playwright/test";

async function isolate(page: Page) {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "zh-CN"));
	const member = {
		id: "settings-person",
		kind: "person",
		handle: "settingstest",
		displayName: "设置检查",
		avatarUrl: null,
		bio: null,
		createdAt: "2026-11-15T00:00:00Z",
		version: 1,
	};
	const bot = { ...member, id: "settings-bot", kind: "bot", handle: "settingsbot", displayName: "Bot" };
	await page.route("**/v1/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		const json =
			path === "/v1/auth/refresh"
				? { accessToken: "isolated-settings-test" }
				: path === "/v1/me"
					? { member, bot, hasPassword: true, signInMethods: [], settings: { locale: "zh-CN", theme: "light" } }
					: path === "/v1/providers"
						? {
								items: [],
								platformModels: [
									{ id: "mdl-glm", name: "glm-5.3-flash", enabled: true, isDefault: true },
									{ id: "mdl-deepseek", name: "DeepSeek-V4.1-Flash-1017", enabled: true, isDefault: false },
								],
							}
						: path === "/v1/quota"
							? { balance: 100, granted: 100, used: 0 }
							: path === "/v1/health"
								? { ok: true, version: "isolated-settings-test" }
								: { items: [], hasMore: false, nextCursor: null };
		await route.fulfill({ json });
	});
	await page.routeWebSocket("**/v1/realtime*", (socket) => socket.onMessage(() => undefined));
}

test("wide desktop settings use flat selected rows and only deeper pages show Back", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await isolate(page);
	await page.goto("/me/models");
	const sidebar = page.getByRole("navigation", { name: "我", exact: true });
	const models = sidebar.getByRole("button", { name: "模型", exact: true });
	await expect(models).toHaveAttribute("aria-current", "page");
	await expect(models.locator("svg")).toHaveCount(1);
	expect((await models.boundingBox())?.height).toBe(32);
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
	const selectedColor = await models.evaluate((element) => getComputedStyle(element).backgroundColor);
	await models.hover();
	await expect.poll(() => models.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(selectedColor);
	await sidebar.getByRole("button", { name: "额度", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/quota$/);
	await models.focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/me\/models$/);
	const search = page.getByRole("searchbox", { name: "搜索模型或供应商" });
	await search.fill("1017");
	await expect(page.getByText("glm-5.3-flash", { exact: true })).toHaveCount(0);
	await search.clear();
	await page.mouse.move(1200, 850);
	await page.screenshot({ path: testInfo.outputPath("desktop-settings-list.png"), fullPage: true });

	await page.getByRole("button", { name: "添加供应商", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/models\/add$/);
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(1);
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/models$/);
	await sidebar.getByRole("button", { name: "账号与安全", exact: true }).click();
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: /^修改密码/ }).click();
	await expect(page).toHaveURL(/\/me\/account\/password$/);
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(1);
	await page.screenshot({ path: testInfo.outputPath("desktop-settings-detail.png"), fullPage: true });
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/account$/);
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
});

test("narrow desktop keeps a named Close for the root and Back for the covering section", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await isolate(page);
	await page.goto("/me");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "compact");
	await expect(page.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
	await page
		.getByRole("navigation", { name: "我", exact: true })
		.getByRole("button", { name: "模型", exact: true })
		.click();
	await expect(page).toHaveURL(/\/me\/models$/);
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page).toHaveURL(/\/me$/);
	await page.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(page).toHaveURL(/\/messages$/);
});

test.describe("phone settings", () => {
	test.use({
		userAgent: devices["iPhone 15"].userAgent,
		viewport: devices["iPhone 15"].viewport,
		isMobile: true,
		hasTouch: true,
	});
	test("keeps grouped cards, chevrons and root/section Back on an actual phone user agent", async ({
		page,
	}, testInfo) => {
		await isolate(page);
		await page.goto("/me");
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		const models = page.getByRole("button", { name: "模型", exact: true });
		await expect(models.locator("svg")).toHaveCount(2);
		await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(1);
		await expect(page.getByRole("button", { name: "关闭", exact: true })).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath("mobile-settings-list.png"), fullPage: true });
		await models.click();
		await expect(page).toHaveURL(/\/me\/models$/);
		const search = page.getByRole("searchbox", { name: "搜索模型或供应商" });
		await search.fill("1017");
		await expect(page.getByText("DeepSeek-V4.1-Flash-1017", { exact: true })).toBeVisible();
		await expect(page.getByText("glm-5.3-flash", { exact: true })).toHaveCount(0);
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/me$/);
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/messages$/);
	});
});

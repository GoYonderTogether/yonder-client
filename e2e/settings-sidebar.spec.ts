import { devices, expect, type Page, test } from "@playwright/test";
import { quota } from "./fixtures/quota.ts";

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
							? quota
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
	expect((await models.boundingBox())?.height).toBeCloseTo(35.2, 1);
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
	await expect(page.getByRole("radio", { name: "glm-5.3-flash", exact: true })).toBeChecked();
	await search.clear();
	await search.blur();
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

test("narrow desktop uses the phone-style settings list and Back at both levels", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await isolate(page);
	await page.goto("/messages");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "compact");
	await page.getByRole("button", { name: "我", exact: true }).click();
	const back = page.getByRole("button", { name: "返回", exact: true });
	const close = page.getByRole("button", { name: "关闭", exact: true });
	const models = page.getByRole("button", { name: "模型", exact: true });
	await expect(page.getByRole("dialog", { name: "我", exact: true }).locator("[data-shell-topbar]")).toHaveText("我");
	// The list enters from the left and leaves to the left: a round close, never a back arrow.
	await expect(close).toBeVisible();
	await expect(back).toHaveCount(0);
	await expect(models.locator("svg")).toHaveCount(2);
	await page.screenshot({ path: testInfo.outputPath("narrow-desktop-settings-list.png"), fullPage: true });
	await models.click();
	await expect(page).toHaveURL(/\/me\/models$/);
	// The pushed page covers the directory, which leaves the accessibility tree; only then is the
	// one visible Back the page's own (the URL changes a render before that happens).
	await expect(models).toHaveCount(0);
	await back.click();
	await expect(page).toHaveURL(/\/me$/);
	await close.click();
	await expect(page).toHaveURL(/\/messages$/);
});

test.describe("phone settings", () => {
	test.use({
		userAgent: devices["iPhone 15"].userAgent,
		viewport: devices["iPhone 15"].viewport,
		isMobile: true,
		hasTouch: true,
	});
	for (const native of [false, true]) {
		test(`phone Me uses a standalone close above the name card (${native ? "simulated native" : "mobile web"})`, async ({
			page,
		}, testInfo) => {
			const safeTop = native ? 59 : 0;
			const safeRight = native ? 12 : 0;
			if (native) {
				await page.addInitScript(
					({ safeTop, safeRight }) => {
						const observer = new MutationObserver(() => {
							const root = document.documentElement;
							if (!root) return;
							root.dataset.nativeMobile = "true";
							root.style.setProperty("--native-safe-area-inset-top", `${safeTop}px`);
							root.style.setProperty("--native-safe-area-inset-right", `${safeRight}px`);
							observer.disconnect();
						});
						observer.observe(document, { childList: true, subtree: true });
					},
					{ safeTop, safeRight },
				);
			}
			await isolate(page);
			await page.goto("/messages");
			const avatar = page.getByRole("button", { name: "我", exact: true });
			await avatar.click();
			const dialog = page.getByRole("dialog", { name: "我", exact: true });
			await expect(dialog).toHaveAttribute("aria-modal", "true");
			await expect(dialog.locator("[data-shell-topbar]")).toHaveCount(0);
			await expect(dialog.getByText("我", { exact: true })).toHaveCount(0);
			const close = dialog.getByRole("button", { name: "关闭", exact: true });
			const card = dialog.locator(".me-card");
			await expect(card.getByText("@settingstest")).toBeVisible();
			const [closeBox, cardBox] = await Promise.all([close.boundingBox(), card.boundingBox()]);
			if (!closeBox || !cardBox) throw new Error("Expected a visible close control and name card");
			expect(closeBox.y).toBeGreaterThan(safeTop);
			expect(closeBox.x).toBeGreaterThan(devices["iPhone 15"].viewport.width / 2);
			expect(closeBox.x + closeBox.width).toBeLessThan(devices["iPhone 15"].viewport.width - safeRight);
			expect(closeBox.height).toBe(closeBox.width);
			expect(cardBox.y).toBeGreaterThan(closeBox.y + closeBox.height);
			const appearance = await close.evaluate((element) => {
				const style = getComputedStyle(element);
				return { radius: parseFloat(style.borderTopLeftRadius), filled: style.backgroundColor !== "rgba(0, 0, 0, 0)" };
			});
			expect(appearance.radius).toBeGreaterThanOrEqual(closeBox.width / 2);
			expect(appearance.filled).toBe(true);
			await page.screenshot({
				path: testInfo.outputPath(`me-${native ? "native-insets" : "phone-web"}.png`),
				animations: "disabled",
			});
			await close.click();
			await expect(page).toHaveURL(/\/messages$/);
			await expect(dialog).toHaveCount(0);
			await avatar.click();
			await expect(dialog).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(page).toHaveURL(/\/messages$/);
			await expect(dialog).toHaveCount(0);
		});
	}

	test("keeps grouped cards, chevrons and root/section Back on an actual phone user agent", async ({
		page,
	}, testInfo) => {
		await isolate(page);
		await page.goto("/me");
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		const models = page.getByRole("button", { name: "模型", exact: true });
		await expect(models.locator("svg")).toHaveCount(2);
		await expect(page.getByRole("button", { name: "关闭", exact: true })).toHaveCount(1);
		await expect(page.getByRole("button", { name: "返回", exact: true })).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath("mobile-settings-list.png"), fullPage: true });
		await models.click();
		await expect(page).toHaveURL(/\/me\/models$/);
		const search = page.getByRole("searchbox", { name: "搜索模型或供应商" });
		await search.fill("1017");
		await expect(page.getByText("DeepSeek-V4.1-Flash-1017", { exact: true })).toBeVisible();
		await expect(page.getByRole("radio", { name: "glm-5.3-flash", exact: true })).toBeChecked();
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/me$/);
		await page.getByRole("button", { name: "关闭", exact: true }).click();
		await expect(page).toHaveURL(/\/messages$/);
	});
});

for (const width of [1280, 820, 390]) {
	test(`desktop settings enter and restore focus at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await isolate(page);
		await page.goto("/tasks");
		const avatar = page.getByRole("button", { name: "我", exact: true });
		const settings = page.getByRole("button", { name: "设置", exact: true });
		const rail = page.locator('nav[aria-label="主导航"]');
		const dialog = page.getByRole("dialog", { name: "我", exact: true });
		const backdrop = page.locator("[data-overlay-backdrop]");
		for (const entry of [avatar, settings]) {
			await expect(rail).toBeVisible();
			await entry.click();
			await expect(dialog).toBeFocused();
			await expect(dialog).toHaveAttribute("aria-modal", "true");
			await expect(rail.locator("..")).toHaveAttribute("inert", "");
			const box = await dialog.boundingBox();
			if (!box) throw new Error("Expected a visible settings surface");
			if (width === 1280) {
				await expect(rail).toBeVisible();
				expect(box.x).toBeGreaterThan(0);
				expect(box.y).toBeGreaterThan(0);
				expect(box.x * 2 + box.width).toBeCloseTo(width, 0);
				expect(box.y * 2 + box.height).toBeCloseTo(900, 0);
				await page.mouse.click(box.x + box.width / 2, box.y + 4);
				await expect(dialog).toBeVisible();
				await backdrop.click({ position: { x: 5, y: 100 } });
			} else {
				await expect(rail).toBeHidden();
				await expect(backdrop).toHaveCount(0);
				expect(box).toEqual({ x: 0, y: 0, width, height: 900 });
				await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			}
			await expect(page).toHaveURL(/\/tasks$/);
			await expect(dialog).toHaveCount(0);
			await expect(entry).toBeFocused();
		}
	});
}

test("mobile has no desktop settings shortcut", async ({ browser }) => {
	const context = await browser.newContext({ ...devices["iPhone 13"] });
	const page = await context.newPage();
	await isolate(page);
	await page.goto("/messages");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
	await expect(page.getByRole("button", { name: "设置", exact: true })).toHaveCount(0);
	await context.close();
});

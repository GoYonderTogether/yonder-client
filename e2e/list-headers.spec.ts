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

for (const width of [1280, 820, 390]) {
	test(`list headers keep titles above capsule tabs at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await isolate(page);
		await page.goto("/tasks");
		const header = page
			.locator("[data-frame-header]")
			.filter({ has: page.getByRole("heading", { name: "任务", exact: true }) });
		await expect(header.getByRole("heading", { name: "任务", exact: true })).toBeVisible();
		await expect(header.getByRole("button", { name: "新建事项" })).toBeVisible();
		const group = header.getByRole("radiogroup", { name: "任务" });
		await expect(group).toBeVisible();
		const titleBox = await header.getByRole("heading", { name: "任务", exact: true }).boundingBox();
		const tabBox = await group.boundingBox();
		if (!titleBox || !tabBox) throw new Error("List header must be visible");
		expect(tabBox.y).toBeGreaterThan(titleBox.y + titleBox.height);
		expect(tabBox.height).toBeGreaterThanOrEqual(44);
		// Selection is controlled by an asynchronous router transition, not native radio state.
		await group.getByRole("radio", { name: "目标", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await expect(group.getByRole("radio", { name: "目标", exact: true })).toBeChecked();
		await header.getByRole("button", { name: "新建目标" }).click();
		await expect(page.getByRole("menuitem", { name: "新建目标" })).toBeVisible();
		await page.getByRole("menuitem", { name: "新建定时任务" }).click();
		await expect(page.getByRole("menu")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "取消", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "取消", exact: true }).click();
		await page.goto("/memory");
		await expect(page.getByRole("heading", { name: "记忆", exact: true })).toBeVisible();
		await expect(page.getByRole("radiogroup", { name: "记忆" })).toBeVisible();
		await page.goto("/messages");
		await expect(page.getByRole("heading", { name: "消息", exact: true })).toBeVisible();
	});
}

test.describe("phone header", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	test.use(phone);
	test("shows the title and add action above the existing mobile capsule", async ({ page }) => {
		await isolate(page);
		await page.goto("/tasks");
		await expect(page.locator('[data-layout-mode="mobile"]')).toBeVisible();
		const header = page
			.locator("[data-frame-header]")
			.filter({ has: page.getByRole("heading", { name: "任务", exact: true }) });
		await expect(header.getByRole("button", { name: "新建事项" })).toBeVisible();
		await expect(header.getByRole("radiogroup", { name: "任务" })).toBeVisible();
		await header.getByRole("radio", { name: "目标", exact: true }).click();
		await expect(page).toHaveURL(/\/tasks\/scheduled$/);
		await expect(header.getByRole("radio", { name: "目标", exact: true })).toBeChecked();
		await header.getByRole("button", { name: "新建目标" }).click();
		await expect(page.getByRole("menuitem", { name: "新建定时任务" })).toBeVisible();
	});
});

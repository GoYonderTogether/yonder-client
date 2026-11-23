import { devices, expect, type Page, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

async function isolateNetwork(page: Page) {
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.hostname !== "127.0.0.1" || /^\/(api|v1|files)(\/|$)/.test(url.pathname)) return route.abort();
		return route.continue();
	});
	await page.routeWebSocket("**/*", (socket) => socket.onMessage(() => undefined));
}

function observeChunks(page: Page) {
	const requested: string[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (path.endsWith(".js")) requested.push(path);
	});
	return requested;
}

const loaded = (requested: string[], chunk: string) => requested.some((path) => path.includes(`/assets/${chunk}-`));

test("public pages and protected redirects defer the application chunks", async ({ page }, testInfo) => {
	await isolateNetwork(page);
	await page.route("**/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
	const requested = observeChunks(page);
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible();
	for (const chunk of ["app-frame", "models-section", "skills-section", "memory-page"])
		expect(loaded(requested, chunk)).toBe(false);
	await page.screenshot({ path: testInfo.outputPath("landing.png") });
	await page.getByRole("link", { name: "Use web version" }).click();
	await expect(page.locator("#sign-in-phone")).toBeVisible();
	await page.locator("#sign-in-phone").fill("13800138000");
	await page.getByRole("link", { name: "Terms of service", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
	await page.getByRole("button", { name: "Back", exact: true }).click();
	await expect(page.locator("#sign-in-phone")).toHaveValue(/138\s*0013\s*8000/);
	await page.goto("/messages/main");
	await expect(page).toHaveURL(/\/sign-in\?next=/);
	for (const chunk of ["app-frame", "models-section", "skills-section", "memory-page"])
		expect(loaded(requested, chunk)).toBe(false);
});

test("features load on navigation while the chat draft survives", async ({ page }, testInfo) => {
	await isolateNetwork(page);
	const chat = await isolateChat(page, { items: [] });
	const requested = observeChunks(page);
	await page.setViewportSize({ width: 1280, height: 850 });
	await page.goto("/messages/main");
	const draft = page.getByRole("textbox", { name: "对 界面验收 BOT 说点什么" });
	await draft.fill("保留这条未发送草稿");
	expect(loaded(requested, "app-frame")).toBe(true);
	for (const chunk of ["models-section", "skills-section", "memory-page"]) expect(loaded(requested, chunk)).toBe(false);
	const nav = page.getByRole("navigation", { name: "主导航" });
	await nav.getByRole("button", { name: "我", exact: true }).click();
	await page.getByRole("button", { name: "模型", exact: true }).click();
	await expect(page.getByRole("searchbox", { name: "搜索模型或供应商" })).toBeVisible();
	expect(loaded(requested, "models-section")).toBe(true);
	expect(loaded(requested, "skills-section")).toBe(false);
	await page.screenshot({ path: testInfo.outputPath("models.png") });
	await page.getByRole("button", { name: "技能", exact: true }).click();
	await expect(page.getByRole("searchbox", { name: "搜索技能" })).toBeVisible();
	expect(loaded(requested, "skills-section")).toBe(true);
	await page.screenshot({ path: testInfo.outputPath("skills.png") });
	await page.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(draft).toHaveValue("保留这条未发送草稿");
	await nav.getByRole("button", { name: "记忆", exact: true }).click();
	await expect.poll(() => loaded(requested, "memory-page")).toBe(true);
	await page.screenshot({ path: testInfo.outputPath("memory.png") });
	await nav.getByRole("button", { name: "消息", exact: true }).click();
	await expect(draft).toHaveValue("保留这条未发送草稿");
	expect(chat.sent).toEqual([]);
});

test("a direct memory entry starts the visible route before the app frame finishes loading", async ({ page }) => {
	await isolateNetwork(page);
	await isolateChat(page, { items: [] });
	const requested = observeChunks(page);
	let releaseFrame = () => {};
	const waitingForFrame = new Promise<void>((resolve) => {
		releaseFrame = resolve;
	});
	await page.route("**/assets/app-frame-*.js", async (route) => {
		await waitingForFrame;
		await route.continue();
	});

	await page.goto("/memory", { waitUntil: "domcontentloaded" });
	try {
		await expect.poll(() => loaded(requested, "app-frame")).toBe(true);
		await expect.poll(() => loaded(requested, "memory-page")).toBe(true);
		for (const chunk of ["tasks-page", "settings-pages", "models-section", "skills-section"])
			expect(loaded(requested, chunk)).toBe(false);
	} finally {
		releaseFrame();
	}
	await expect(page.getByRole("heading", { name: "记忆", exact: true }).first()).toBeVisible();
});

test("mobile chat does not warm unrelated tabs during boot", async ({ browser, baseURL }) => {
	const { viewport, userAgent } = devices["iPhone 13"];
	const page = await browser.newPage({
		viewport,
		userAgent,
		isMobile: true,
		hasTouch: true,
		baseURL,
	});
	try {
		await isolateNetwork(page);
		await isolateChat(page, { items: [] });
		const requested = observeChunks(page);
		// Expose the original app's idle prefetch deterministically, without sleeping.
		await page.addInitScript(() => {
			window.requestIdleCallback = (callback) =>
				window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 30 }), 0);
		});
		await page.goto("/messages/main");
		await expect(page.getByRole("textbox", { name: "对 界面验收 BOT 说点什么" })).toBeVisible();
		for (const chunk of ["tasks-page", "memory-page", "settings-pages"]) expect(loaded(requested, chunk)).toBe(false);
		await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "任务" }).click();
		await expect.poll(() => loaded(requested, "tasks-page")).toBe(true);
		expect(loaded(requested, "memory-page")).toBe(false);
	} finally {
		await page.close();
	}
});

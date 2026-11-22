import { writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { quota } from "./fixtures/quota.ts";

// These fixtures stay in the isolated browser; no real account, message, or native command is used.
const member = {
	id: "person-ui",
	kind: "person",
	handle: "uitest",
	displayName: "UI Test",
	avatarUrl: null,
	bio: null,
	createdAt: "2026-11-15T00:00:00Z",
	version: 1,
};
const bot = { ...member, id: "bot-ui", kind: "bot", handle: "uibot", displayName: "Test Bot" };
const conversation = {
	id: "conversation-ui",
	kind: "direct",
	isPrimary: true,
	title: null,
	members: [member, bot].map(({ id, ...rest }) => ({ ...rest, memberId: id })),
	lastMessageAt: null,
	unreadCount: 0,
	pinned: true,
	version: 1,
};

async function isolate(page: Page) {
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
	await page.route("**/v1/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === "/v1/providers") return route.fulfill({ json: { items: [], platformModels: [] } });
		const json =
			path === "/v1/auth/refresh"
				? { accessToken: "public-ui-test", refreshToken: "public-ui-test" }
				: path === "/v1/me"
					? { member, bot, hasPassword: true, signInMethods: [], settings: { locale: "en", theme: "light" } }
					: path === "/v1/conversations"
						? { items: [conversation] }
						: path.endsWith("/messages")
							? { items: [], nextCursor: null, hasMore: false }
							: path === "/v1/health"
								? { ok: true, version: "public-ui-test" }
								: path === "/v1/quota"
									? quota
									: { items: [] };
		await route.fulfill({ json });
	});
	await page.routeWebSocket("**/v1/realtime*", (socket) => socket.onMessage(() => undefined));
}

function panel(page: Page, side: "left" | "right") {
	return page.locator(`[data-page-side="${side}"]`).last();
}

async function translation(layer: Locator) {
	return layer.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
}

async function settled(layer: Locator) {
	await expect(layer).toBeVisible();
	await expect.poll(() => translation(layer)).toBeCloseTo(0, 0);
}

type MotionCapture = Window & {
	navigationCapture?: { frame: number; values: number[]; childValues: number[]; childWorld: number[] };
};

async function startCapture(page: Page, key: string, childKey?: string) {
	await page.evaluate(
		({ layerKey, childKey }) => {
			const capture = { frame: 0, values: [] as number[], childValues: [] as number[], childWorld: [] as number[] };
			(window as MotionCapture).navigationCapture = capture;
			const tick = () => {
				const element = document.querySelector(`[data-page-layer="${layerKey}"]`);
				if (element && getComputedStyle(element).visibility !== "hidden") {
					capture.values.push(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
				}
				const child = childKey ? document.querySelector(`[data-page-layer="${childKey}"]`) : null;
				if (child) {
					capture.childValues.push(new DOMMatrixReadOnly(getComputedStyle(child).transform).m41);
					capture.childWorld.push(child.getBoundingClientRect().x);
				}
				capture.frame = requestAnimationFrame(tick);
			};
			capture.frame = requestAnimationFrame(tick);
		},
		{ layerKey: key, childKey },
	);
}

async function stopCapture(page: Page) {
	return page.evaluate(() => {
		const capture = (window as MotionCapture).navigationCapture;
		if (!capture) throw new Error("Expected an active motion capture");
		cancelAnimationFrame(capture.frame);
		return { values: capture.values, childValues: capture.childValues, childWorld: capture.childWorld };
	});
}

async function drag(page: Page, layer: Locator, distance: number, release = true) {
	const bounds = await layer.boundingBox();
	if (!bounds) throw new Error("Expected a visible navigation layer");
	const startX = distance > 0 ? bounds.x + 12 : bounds.x + bounds.width - 12;
	const y = bounds.y + Math.min(150, bounds.height / 3);
	await page.mouse.move(startX, y);
	await page.mouse.down();
	await page.mouse.move(startX + distance, y, { steps: 12 });
	if (release) await page.mouse.up();
}

async function checkChatAction(page: Page) {
	const trigger = page.getByRole("button", { name: "New chat", exact: true });
	await trigger.click();
	await page.getByRole("menuitem", { name: "Create BOT", exact: true }).click();
	const action = page.locator('[data-page-layer="action:Create BOT"]');
	await settled(action);
	await expect(page.getByRole("dialog", { name: "Create BOT", exact: true })).toBeVisible();
	await drag(page, action, 65, false);
	await expect.poll(() => translation(action)).toBeGreaterThan(30);
	await page.mouse.move(280, 150, { steps: 12 });
	await page.mouse.up();
	await expect(page.getByRole("dialog", { name: "Create BOT", exact: true })).not.toBeVisible();
	await expect(trigger).toBeFocused();
	await expect(page).toHaveURL(/\/messages$/);
	await page.keyboard.press("Tab");
	await expect(trigger).not.toBeFocused();
}

test.beforeEach(async ({ page }) => isolate(page));

test("wide Me restores the section and returns to the chat draft", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 850 });
	await page.goto("/messages/main");
	await page.getByRole("textbox", { name: "Message Test Bot" }).fill("Keep this draft");
	const navigation = page.getByRole("navigation", { name: "Main navigation" });
	await navigation.getByRole("button", { name: "Me", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/profile$/);
	await expect(page.locator("header").getByText("Edit profile", { exact: true })).toBeVisible();
	await settled(panel(page, "left"));
	await page.screenshot({ path: testInfo.outputPath("desktop-me-profile.png") });
	await page.getByRole("button", { name: "Account and security", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/account$/);
	await page.getByRole("button", { name: /^Change password/ }).click();
	await expect(page).toHaveURL(/\/me\/account\/password$/);
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByRole("textbox", { name: "Message Test Bot" })).toHaveValue("Keep this draft");
	await navigation.getByRole("button", { name: "Me", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/account$/);
	await expect(page.locator("header").getByText("Account and security", { exact: true })).toBeVisible();
	await page.goto("/me");
	await expect(page).toHaveURL(/\/me\/account$/);
	await page.reload();
	await expect(page).toHaveURL(/\/me\/account$/);
	await page.getByRole("button", { name: "General", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/general$/);
	await page.getByRole("radio", { name: "中文", exact: true }).click();
	await page.getByRole("button", { name: "编辑资料", exact: true }).click();
	await expect(page.locator("header").getByText("编辑资料", { exact: true })).toBeVisible();
	await settled(panel(page, "right"));
	await page.screenshot({ path: testInfo.outputPath("desktop-me-profile-zh.png") });
});

test("wide Me defaults safely and does not reuse another account's section", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 850 });
	await page.addInitScript(() => {
		localStorage.setItem("yonder.me-section.other-account", "about");
		localStorage.setItem("yonder.me-section.person-ui", "account/password");
	});
	await page.goto("/me");
	await expect(page).toHaveURL(/\/me\/profile$/);
	await expect(page.locator("header").getByText("Edit profile", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "About", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/about$/);
	await expect.poll(() => page.evaluate(() => localStorage.getItem("yonder.me-section.person-ui"))).toBe("about");
	// A wide window keeps the list beside the page, so there is no Back button; Escape is the exit.
	await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/messages$/);
});

test("a cached narrow desktop can open the Me list directly", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await expect(page.getByRole("button", { name: /Test Bot/ })).toBeVisible();
	await page.goto("/me");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "compact");
	await expect(page.getByRole("button", { name: "Account and security", exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/me$/);
});

test("a narrow desktop retains its rail, lists, layered settings, and draft", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "compact");
	const navigation = page.getByRole("navigation", { name: "Main navigation" });
	await expect(navigation.getByRole("button", { name: "Messages", exact: true })).toBeVisible();
	await expect(navigation.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
	await expect(navigation.getByRole("button", { name: "Memory", exact: true })).toBeVisible();
	await expect(page.getByRole("list", { name: "Messages", exact: true })).toBeVisible();
	await expect(page.locator('[data-page-layer="detail"]')).not.toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("desktop-390-list.png") });
	await page.getByRole("button", { name: /Test Bot/ }).click();
	await expect(page).toHaveURL(/\/messages\/main$/);
	await settled(panel(page, "right"));
	await page.getByRole("textbox", { name: "Message Test Bot" }).fill("Unsent UI check");
	await page.screenshot({ path: testInfo.outputPath("desktop-390-chat.png") });
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/messages$/);
	await page.getByRole("button", { name: "Me", exact: true }).click();
	await expect(page).toHaveURL(/\/me$/);
	await settled(panel(page, "left"));
	await page.getByRole("button", { name: "Account and security", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/account$/);
	await settled(panel(page, "right"));
	await page.getByRole("button", { name: /^Change password/ }).click();
	await expect(page).toHaveURL(/\/me\/account\/password$/);
	await page.goBack();
	await expect(page).toHaveURL(/\/me\/account$/);
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/me$/);
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/messages$/);
	await page.getByRole("button", { name: /Test Bot/ }).click();
	await expect(page.getByRole("textbox", { name: "Message Test Bot" })).toHaveValue("Unsent UI check");
});

test("narrow desktop conversations and settings keep their opposing slide gestures", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await page.getByRole("button", { name: /Test Bot/ }).click();
	const right = panel(page, "right");
	await settled(right);
	await drag(page, right, 45, false);
	await expect.poll(() => translation(right)).toBeGreaterThan(20);
	await expect(page).toHaveURL(/\/messages\/main$/);
	// Hold still before release: a short drag should return rather than count as a fast flick.
	await page.waitForTimeout(150);
	await page.mouse.up();
	await settled(right);
	await expect(page).toHaveURL(/\/messages\/main$/);
	await drag(page, right, 260);
	await expect(page).toHaveURL(/\/messages$/);
	await startCapture(page, "me");
	await page.getByRole("button", { name: "Me", exact: true }).click();
	const settings = panel(page, "left");
	await settled(settings);
	const entry = await stopCapture(page);
	expect(Math.min(...entry.values)).toBeLessThan(-20);
	await drag(page, settings, -260);
	await expect(page).toHaveURL(/\/messages$/);
});

test("a slow drag follows the finger to a stop, and letting go decides by where it is", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await page.getByRole("button", { name: "Me", exact: true }).click();
	const settings = panel(page, "left");
	await settled(settings);
	// Slowly out from the trailing edge, then hold: the layer stays exactly under the finger.
	const bounds = await settings.boundingBox();
	if (!bounds) throw new Error("Expected the settings layer");
	const startX = bounds.x + bounds.width - 12;
	const y = bounds.y + 200;
	await page.mouse.move(startX, y);
	await page.mouse.down();
	for (let step = 1; step <= 20; step += 1) {
		await page.mouse.move(startX - step * 7, y);
		await page.waitForTimeout(30);
	}
	const held = await translation(settings);
	expect(held).toBeLessThan(-100);
	await page.waitForTimeout(600);
	expect(Math.abs((await translation(settings)) - held)).toBeLessThan(1);
	await expect(page).toHaveURL(/\/me$/);
	// Letting go past a quarter of the width after holding still closes, with no flick needed.
	await page.mouse.up();
	await expect(page).toHaveURL(/\/messages$/);

	await page.getByRole("button", { name: "Me", exact: true }).click();
	await settled(settings);
	await page.mouse.move(startX, y);
	await page.mouse.down();
	for (let step = 1; step <= 6; step += 1) {
		await page.mouse.move(startX - step * 7, y);
		await page.waitForTimeout(30);
	}
	await page.waitForTimeout(300);
	await page.mouse.up();
	await settled(settings);
	await expect(page).toHaveURL(/\/me$/);
});

test("desktop resizing keeps platform behavior and deep links have a safe parent", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	await page.goto("/messages");
	for (const [width, mode] of [
		[1180, "wide"],
		[820, "medium"],
		[360, "compact"],
	] as const) {
		await page.setViewportSize({ width, height: 760 });
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", mode);
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
	}
	await page.screenshot({ path: testInfo.outputPath("desktop-360-list.png") });
	await page.goto("/me/account/password");
	await page.reload();
	await expect(page.getByRole("button", { name: "Back", exact: true }).last()).toBeVisible();
	await page.getByRole("button", { name: "Back", exact: true }).last().click();
	await expect(page).toHaveURL(/\/me\/account$/);
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/me$/);
});

test("a macOS Tauri host keeps desktop navigation and clears the traffic lights in settings", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 760 });
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			value: {
				// The Mac permission step is already done, so the app opens on its normal navigation.
				invoke: async (command: string) =>
					command === "get_desktop_refresh_token"
						? "public-ui-test"
						: command.endsWith("yonder-mac-permissions|permission_status")
							? { accessibility: "granted", microphone: "granted" }
							: command.endsWith("yonder-mac-permissions|login_item_status")
								? "enabled"
								: null,
				transformCallback: () => 1,
				unregisterCallback: () => undefined,
				metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
			},
		});
	});
	await page.goto("/messages");
	// A Mac signing in for the first time sees the permission step once; this test is about what follows it.
	await page.getByRole("button", { name: "Continue to Yonder" }).click();
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "compact");
	await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
	await expect(page.getByRole("button", { name: /Test Bot/ })).toBeVisible();
	await page.getByRole("button", { name: "Me", exact: true }).click();
	await settled(panel(page, "left"));
	// The root closes at the trailing edge, far from the traffic lights; only pages pushed on it
	// carry a Back arrow at the leading edge, and that one must stay clear of them.
	const close = page.getByRole("button", { name: "Close", exact: true });
	await expect(close.locator("xpath=ancestor::header")).toHaveAttribute("data-tauri-drag-region", "true");
	expect((await close.boundingBox())?.x).toBeGreaterThan(200);
	await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Account and security", exact: true }).click();
	await settled(panel(page, "right"));
	const back = page.getByRole("button", { name: "Back", exact: true });
	expect((await back.boundingBox())?.x).toBeGreaterThanOrEqual(76);
});

test("compact chat actions use the shared right layer and restore focus", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await checkChatAction(page);
});

test("desktop task sections use compact capsules below the title row", async ({ page }) => {
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 844 });
		// Memory has no sections since 11-19.
		for (const [path, label] of [["/tasks", "Tasks"]]) {
			await page.goto(path);
			const header = page.locator("[data-frame-header]").filter({
				has: page.getByRole("radiogroup", { name: label, exact: true }),
			});
			const sections = header.getByRole("radiogroup", { name: label, exact: true });
			await expect(header.getByRole("heading", { name: label, exact: true })).toBeVisible();
			await expect(sections).toBeVisible();
			const titleRow = await header.locator("header").boundingBox();
			const bounds = await sections.boundingBox();
			if (!titleRow || !bounds) throw new Error("Expected the title row and capsule");
			expect(bounds.y).toBeGreaterThanOrEqual(titleRow.y + titleRow.height);
			expect(bounds.height).toBe(48);
			const radios = await sections.getByRole("radio").all();
			const targets = await Promise.all(radios.map((radio) => radio.boundingBox()));
			expect(targets[0]?.width).toBeCloseTo(targets[1]?.width ?? 0, 0);
			for (const target of targets) expect(target?.height).toBe(44);
			expect((await sections.locator("input:checked + span").boundingBox())?.height).toBe(40);
			for (const pill of [sections, sections.locator("input:checked + span")]) {
				const radius = await pill.evaluate((element) =>
					Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
				);
				expect(radius).toBeGreaterThanOrEqual(26);
			}
		}
	}
});

test("settings keep the active form across desktop resize and guard outside clicks", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 844 });
	await page.goto("/me/models");
	await page.getByRole("button", { name: "Add provider", exact: true }).click();
	await page.getByRole("button", { name: "Custom provider", exact: true }).click();
	const name = page.getByRole("textbox", { name: "Name", exact: true });
	await name.fill("Unsent provider");
	const settings = page.getByRole("dialog", { name: "Me", exact: true });
	const backdrop = page.locator("[data-overlay-backdrop]");
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(backdrop).toHaveCount(0);
	await expect(name).toHaveValue("Unsent provider");
	await expect(name).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 844 });
	await expect(backdrop).toBeVisible();
	await expect(name).toHaveValue("Unsent provider");
	await expect(name).toBeFocused();
	const rejected = page.waitForEvent("dialog").then((dialog) => dialog.dismiss());
	await backdrop.click({ position: { x: 5, y: 100 } });
	await rejected;
	await expect(page).toHaveURL(/\/me\/models\/add$/);
	await expect(settings).toBeVisible();
	await expect(name).toHaveValue("Unsent provider");
	const accepted = page.waitForEvent("dialog").then((dialog) => dialog.accept());
	await backdrop.click({ position: { x: 5, y: 100 } });
	await accepted;
	await expect(settings).toHaveCount(0);
	await expect(page).toHaveURL(/\/messages$/);
});

test("reduced motion retains layered navigation and usable returns", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/messages");
	await startCapture(page, "me");
	await page.getByRole("button", { name: "Me", exact: true }).click();
	await settled(panel(page, "left"));
	await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	const entry = await stopCapture(page);
	expect(entry.values.length).toBeGreaterThan(0);
	expect(Math.max(...entry.values.map(Math.abs))).toBeLessThan(0.1);
	await page.getByRole("button", { name: "About", exact: true }).click();
	await settled(panel(page, "right"));
	await page.getByRole("button", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL(/\/me$/);
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/\/messages$/);
});

test("wide desktop avatar entry opens its remembered page in a centered settings dialog", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	await page.goto("/messages");
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "wide");
	await startCapture(page, "me", "/me/profile");
	await page.getByRole("button", { name: "Me", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/profile$/);
	await expect(page.getByRole("dialog", { name: "Me", exact: true })).toBeVisible();
	await expect(page.locator("header").getByText("Edit profile", { exact: true })).toBeVisible();
	const entry = await stopCapture(page);
	expect(entry.values.length).toBeGreaterThan(0);
	expect(Math.max(...entry.values.map(Math.abs))).toBeLessThan(1);
	expect(Math.max(...entry.childValues.map(Math.abs))).toBeLessThan(1);
	await page.screenshot({ path: testInfo.outputPath("desktop-1180-settings.png"), animations: "disabled" });
	const capturePath = testInfo.outputPath("actual-wide-avatar-transform-frames.json");
	await writeFile(capturePath, JSON.stringify(entry));
	await testInfo.attach("actual-wide-avatar-transform-frames", { path: capturePath, contentType: "application/json" });
});

test.describe("phone", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});

	test("task and memory sections use their own row below the mobile top bar", async ({ page }, testInfo) => {
		await page.goto("/tasks");
		await page.getByRole("button", { name: "Me", exact: true }).click();
		await page.getByRole("button", { name: "General", exact: true }).click();
		await page.getByRole("radio", { name: "中文", exact: true }).click();
		await page.keyboard.press("Escape");
		await expect(page).toHaveURL(/\/me$/);
		await expect(page.locator('[data-page-layer="/me/general"]')).not.toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.locator('[data-page-layer="me"]')).not.toBeVisible();
		for (const [label, option, path, screenshot] of [
			// Memory has no sections since 11-19: it is one page under its card.
			["任务", "目标", "/tasks/scheduled", "phone-tasks-zh.png"],
		]) {
			await page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
			const sections = page.getByRole("radiogroup", { name: label, exact: true });
			await expect(sections).toBeVisible();
			await expect(page.locator("header").getByRole("radiogroup")).toHaveCount(0);
			const headerBottom = await page
				.getByRole("complementary")
				.locator("header")
				.evaluate((header) => header.getBoundingClientRect().bottom);
			const bounds = await sections.boundingBox();
			expect(bounds?.y).toBeGreaterThanOrEqual(headerBottom);
			expect(bounds?.height).toBe(48);
			expect(bounds?.width).toBeGreaterThanOrEqual(350);
			const radios = await sections.getByRole("radio").all();
			const targets = await Promise.all(radios.map((radio) => radio.boundingBox()));
			// Segments share the row equally.
			for (const target of targets) {
				expect(target?.width).toBeCloseTo(targets[0]?.width ?? 0, 0);
				expect(target?.height).toBe(44);
				expect(target?.width).toBeGreaterThan((bounds?.width ?? 0) / targets.length - 12);
			}
			await sections.getByRole("radio", { name: option, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(sections.getByRole("radio", { name: option, exact: true })).toBeChecked();
			const pills = await sections.evaluate((group) =>
				[group, ...group.querySelectorAll("label"), group.querySelector("input:checked + span")].map((element) => {
					if (!element) throw new Error("Expected the selected section");
					const style = getComputedStyle(element);
					return {
						height: element.getBoundingClientRect().height,
						radius: Math.min(
							...[
								style.borderTopLeftRadius,
								style.borderTopRightRadius,
								style.borderBottomLeftRadius,
								style.borderBottomRightRadius,
							].map(Number.parseFloat),
						),
					};
				}),
			);
			for (const pill of pills) expect(pill.radius).toBeGreaterThanOrEqual(pill.height / 2);
			await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
			await page.screenshot({ path: testInfo.outputPath(screenshot) });
		}
	});

	test("mobile navigation keeps a dock while settings and details use opposing layers", async ({ page }, testInfo) => {
		await page.goto("/messages");
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		await page.getByRole("button", { name: "Me", exact: true }).click();
		await settled(panel(page, "left"));
		await page.screenshot({ path: testInfo.outputPath("phone-390-settings.png") });
		await page.getByRole("button", { name: "About", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/about$/);
		await settled(panel(page, "right"));
		await page.screenshot({ path: testInfo.outputPath("phone-390-about.png") });
		await page.keyboard.press("Escape");
		await expect(page).toHaveURL(/\/me$/);
		await page.keyboard.press("Escape");
		await expect(page).toHaveURL(/\/messages$/);
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		await checkChatAction(page);
	});

	test("a wrong-direction swipe on a child page does not dismiss the settings stack", async ({ page }) => {
		await page.goto("/messages");
		await page.getByRole("button", { name: "Me", exact: true }).click();
		await settled(panel(page, "left"));
		await page.getByRole("button", { name: "About", exact: true }).click();
		const right = panel(page, "right");
		await settled(right);
		await drag(page, right, -190);
		await expect(page).toHaveURL(/\/me\/about$/);
		await expect.poll(() => translation(panel(page, "left"))).toBeCloseTo(0, 0);
		await drag(page, right, 260);
		await expect(page).toHaveURL(/\/me$/);
	});

	test("avatar settings enter and exit left while child pages enter and exit right", async ({ page }, testInfo) => {
		await page.goto("/messages");
		await startCapture(page, "me");
		await page.getByRole("button", { name: "Me", exact: true }).click();
		await settled(panel(page, "left"));
		const meEntry = await stopCapture(page);
		expect(Math.min(...meEntry.values)).toBeLessThan(-20);
		const width = await panel(page, "left").evaluate((element) => element.getBoundingClientRect().width);
		expect(Math.min(...meEntry.values)).toBeGreaterThanOrEqual(-width - 1);
		await startCapture(page, "/me/about");
		await page.getByRole("button", { name: "About", exact: true }).click();
		await settled(panel(page, "right"));
		const childEntry = await stopCapture(page);
		expect(Math.max(...childEntry.values)).toBeGreaterThan(20);
		expect(Math.max(...childEntry.values)).toBeLessThanOrEqual(width + 1);
		await startCapture(page, "/me/about");
		await page.getByRole("button", { name: "Back", exact: true }).click();
		await expect(page.locator('[data-page-layer="/me/about"]')).not.toBeVisible();
		const childExit = await stopCapture(page);
		expect(Math.max(...childExit.values)).toBeGreaterThan(20);
		await startCapture(page, "me");
		await page.keyboard.press("Escape");
		await expect(page.locator('[data-page-layer="me"]')).not.toBeVisible();
		const meExit = await stopCapture(page);
		expect(Math.min(...meExit.values)).toBeLessThan(-20);
		const capturePath = testInfo.outputPath("actual-transform-frames.json");
		await writeFile(capturePath, JSON.stringify({ meEntry, childEntry, childExit, meExit }));
		await testInfo.attach("actual-transform-frames", { path: capturePath, contentType: "application/json" });
	});

	// A short phone viewport leaves the settings list long enough to scroll. It is declared here
	// rather than resized after load: Chromium's touch emulation drops the first scroll gesture when
	// the viewport changes size mid-session, which has nothing to do with the app.
	test.describe("short phone", () => {
		test.use({ viewport: { width: 390, height: 420 } });

		test("vertical touch scrolling at the drawer edge does not start a back gesture", async ({ page }) => {
			await page.goto("/messages");
			await page.getByRole("button", { name: "Me", exact: true }).click();
			const left = panel(page, "left");
			await settled(left);
			const session = await page.context().newCDPSession(page);
			await session.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ x: 378, y: 350 }],
			});
			for (let index = 1; index <= 12; index += 1) {
				await session.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [{ x: 378, y: 350 - index * 16 }],
				});
				await page.waitForTimeout(16);
			}
			await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await expect
				.poll(() =>
					left.evaluate((element) => Math.max(...[...element.querySelectorAll("div")].map((div) => div.scrollTop))),
				)
				.toBeGreaterThan(50);
			await expect(page).toHaveURL(/\/me$/);
			await expect.poll(() => translation(left)).toBeCloseTo(0, 0);
		});
	});
});

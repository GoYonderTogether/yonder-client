import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { conversation, isolateChat } from "./chat-fixture.ts";

test.use({ reducedMotion: "reduce" });

const neutralText = (dark: boolean) => (dark ? "rgb(249, 249, 249)" : "rgb(28, 31, 35)");
const neutralSelection = (dark: boolean) => (dark ? "rgba(255, 255, 255, 0.2)" : "rgba(46, 50, 56, 0.13)");

async function capture(page: Page, info: TestInfo, name: string) {
	const directory = process.env.YONDER_STYLE_CAPTURE_DIR ?? info.outputPath("styles");
	await mkdir(directory, { recursive: true });
	await page.mouse.move(0, 0);
	await page.screenshot({ path: join(directory, `${name}.png`), animations: "disabled" });
}

async function selectStyle(page: Page, style: "classic" | "glow") {
	await page.goto("/me/general");
	await expect(page.locator("html")).toHaveAttribute("data-style", "classic");
	const choice = page.getByRole("radio", { name: style === "glow" ? "渐变晕染" : "清爽克制", exact: true });
	if (style === "classic") {
		// Native radios ignore Space on the checked option, so move away first and come back: the
		// stored value then comes from a real keyboard change, not from the default.
		const other = page.getByRole("radio", { name: "渐变晕染", exact: true });
		await other.focus();
		await page.keyboard.press("Space");
		await expect(page.locator("html")).toHaveAttribute("data-style", "glow");
	}
	await choice.focus();
	await page.keyboard.press("Space");
	await expect(choice).toBeChecked();
	await expect(page.locator("html")).toHaveAttribute("data-style", style);
	const dark = (await page.locator("html").getAttribute("data-theme")) === "dark";
	// The native radio is visually hidden; its label row carries the check mark.
	const mark = page.locator("label", { has: choice }).locator("svg");
	await expect(mark).toHaveCount(1);
	await expect(mark).toHaveCSS("color", neutralText(dark));
	await page.reload();
	await expect(
		page.getByRole("radio", { name: style === "glow" ? "渐变晕染" : "清爽克制", exact: true }),
	).toBeChecked();
	await expect(page.locator("html")).toHaveAttribute("data-style", style);
}

async function assertNeutralNavigation(page: Page, dark: boolean) {
	const selected = page.getByRole("navigation", { name: "主导航" }).locator('[aria-current="page"]');
	await expect(selected).toHaveCSS("color", neutralText(dark));
	await expect(selected.locator("svg")).toHaveCSS("color", neutralText(dark));
}

async function assertChatSurfaces(page: Page, dark: boolean, style: "classic" | "glow") {
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-theme", dark ? "dark" : "light");
	const surfaces = await page.locator("[data-layout-mode]").evaluate((shell) => {
		const main = shell.querySelector("main");
		const chrome = shell.querySelector(".yonder-chrome");
		if (!main || !chrome) throw new Error("Expected the actual app shell");
		return {
			main: getComputedStyle(main).backgroundColor,
			mainImage: getComputedStyle(main).backgroundImage,
			chromeImage: getComputedStyle(chrome).backgroundImage,
			style: localStorage.getItem("yonder.style"),
			overflow: document.documentElement.scrollWidth > innerWidth,
		};
	});
	expect(surfaces.main).toBe(dark ? "rgb(22, 22, 26)" : "rgb(255, 255, 255)");
	expect(surfaces.mainImage).toBe("none");
	expect(surfaces.style).toBe(style);
	expect(surfaces.overflow).toBe(false);
	if (style === "glow") expect(surfaces.chromeImage).toContain("linear-gradient(201.15deg");
	else expect(surfaces.chromeImage).toBe("none");
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.focus();
	await expect(page.locator(".composer-box")).toHaveCSS("outline-style", "solid");
	await input.blur();
	if ((await page.locator("[data-layout-mode]").getAttribute("data-layout-mode")) === "wide") {
		await assertNeutralNavigation(page, dark);
		await expect(page.getByRole("navigation", { name: "主导航" }).locator('[aria-current="page"]')).toHaveCSS(
			"background-color",
			neutralSelection(dark),
		);
		const selected = page.locator('aside button[aria-current="true"]');
		await expect(selected).toHaveCSS("background-color", neutralSelection(dark));
		await expect(selected).toHaveCSS("color", neutralText(dark));
		const selection = await selected.evaluate((element) => getComputedStyle(element, "::selection").backgroundColor);
		expect(selection).toBe(neutralSelection(dark));
	}
}

for (const dark of [false, true]) {
	for (const style of ["classic", "glow"] as const) {
		test(`desktop ${style} ${dark ? "dark" : "light"} uses Semi surfaces and persists keyboard selection`, async ({
			page,
			browser,
		}, info) => {
			await page.setViewportSize({ width: 1440, height: 960 });
			await isolateChat(page, { dark });
			await selectStyle(page, style);
			await capture(page, info, `desktop-settings-${style}-${dark ? "dark" : "light"}`);
			await assertChatSurfaces(page, dark, style);
			await capture(page, info, `desktop-chat-${style}-${dark ? "dark" : "light"}`);
			await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "任务", exact: true }).click();
			const segment = page.getByRole("radiogroup").getByRole("radio", { checked: true }).locator("+ span");
			await expect(segment).toHaveCSS("background-color", neutralSelection(dark));
			await expect(segment).toHaveCSS("color", neutralText(dark));
			// The guest split download menu uses menu items, not sticky pressed platform buttons.
			const guest = await browser.newContext();
			try {
				await guest.addInitScript(
					({ dark, style }) => {
						localStorage.setItem("yonder.locale", "zh-CN");
						localStorage.setItem("yonder.theme", dark ? "dark" : "light");
						localStorage.setItem("yonder.style", style);
					},
					{ dark, style },
				);
				const guestPage = await guest.newPage();
				await guestPage.goto("/");
				await expect(guestPage.getByRole("link", { name: "用网页版", exact: true })).toBeVisible();
				const options = guestPage.getByRole("button", { name: "下载选项", exact: true });
				await options.press("Enter");
				const menu = guestPage.getByRole("menu", { name: "下载选项", exact: true });
				await expect(menu.getByRole("menuitem", { name: /Windows/ })).toBeVisible();
			} finally {
				await guest.close();
			}
			await page.route("**/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
			await page.goto("/sign-in");
			for (const name of ["用户协议", "隐私政策"]) {
				await expect(page.getByRole("link", { name, exact: true })).toHaveCSS("text-decoration-line", "underline");
			}
			await page.locator('[aria-haspopup="listbox"]').first().click();
			const option = page.getByRole("option", { selected: true });
			await expect(option).toHaveCSS("background-color", neutralSelection(dark));
			await expect(option).toHaveCSS("color", neutralText(dark));
		});
	}
}

test.describe("phone styles", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});
	for (const dark of [false, true]) {
		for (const style of ["classic", "glow"] as const) {
			test(`${style} ${dark ? "dark" : "light"} stays readable with a static chrome gradient`, async ({
				page,
			}, info) => {
				await isolateChat(page, { dark });
				await selectStyle(page, style);
				await assertChatSurfaces(page, dark, style);
				await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
				await expect(page.locator("[data-mobile-dock]")).toHaveCount(1);
				await capture(page, info, `phone-chat-${style}-${dark ? "dark" : "light"}`);
				await page.goto("/messages");
				await expect(page.getByRole("button", { name: /界面验收 BOT/ }).first()).toBeVisible();
				await assertNeutralNavigation(page, dark);
				await capture(page, info, `phone-list-${style}-${dark ? "dark" : "light"}`);
			});
		}
	}
});

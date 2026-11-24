import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

/**
 * 通用 · 界面大小 writes `data-ui-size` on `<html>` and the app reads it on the first paint, so a
 * stored level survives a reload without a flash of another one. The check measures type, spacing
 * and the phone's floating chrome, because one multiplier is supposed to reach all three.
 */

const LEVELS = [
	{ level: "xsmall", scale: 0.85 },
	{ level: "small", scale: 0.95 },
	{ level: "medium", scale: 1.1 },
	{ level: "large", scale: 1.2 },
	{ level: "xlarge", scale: 1.3 },
] as const;

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];

test.use({ ...phone, hasTouch: true });

for (const { level, scale } of LEVELS) {
	test(`${level} scales type, spacing and the phone's chrome together`, async ({ page }) => {
		await isolateChat(page);
		await page.addInitScript((value) => localStorage.setItem("yonder.ui-size", value), level);
		await page.goto("/messages/main");
		await expect(page.locator("[data-mobile-dock]")).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("data-ui-size", level);

		const measured = await page.evaluate(() => {
			const root = getComputedStyle(document.documentElement);
			const dock = document.querySelector("[data-mobile-dock] nav");
			// A token holds `calc(15px * var(--ui-scale))`; what reaches a screen is the resolved pixel
			// value, so read a probe element rather than the variable's own text.
			const probe = document.createElement("div");
			probe.style.fontSize = "var(--text-body)";
			probe.style.paddingLeft = "var(--spacing-4)";
			document.body.appendChild(probe);
			const body = Number.parseFloat(getComputedStyle(probe).fontSize);
			const spacing = Number.parseFloat(getComputedStyle(probe).paddingLeft);
			probe.remove();
			return {
				scale: root.getPropertyValue("--ui-scale").trim(),
				body,
				spacing,
				tabbar: dock ? dock.getBoundingClientRect().height : 0,
			};
		});
		expect(Number(measured.scale)).toBeCloseTo(scale, 4);
		expect(measured.body).toBeCloseTo(15 * scale, 2);
		expect(measured.spacing).toBeCloseTo(16 * scale, 2);
		expect(measured.tabbar).toBeGreaterThan(54 * scale - 1);
	});

	test(`${level} is the one the settings page checks after a reload`, async ({ page }) => {
		await isolateChat(page);
		await page.addInitScript((value) => localStorage.setItem("yonder.ui-size", value), level);
		await page.goto("/me/general");
		const chosen = page.getByRole("radio", {
			name: { xsmall: "最小", small: "小", medium: "中", large: "大", xlarge: "最大" }[level],
			exact: true,
		});
		await expect(chosen).toBeChecked();
		await page.reload();
		await expect(chosen).toBeChecked();
	});
}

test("a level picked in 通用 reaches the chat the moment it is chosen", async ({ page }) => {
	await isolateChat(page);
	await page.goto("/me/general");
	await expect(page.locator("html")).toHaveAttribute("data-ui-size", "medium");
	const before = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
	await page.getByRole("radio", { name: "最大", exact: true }).check();
	await expect(page.locator("html")).toHaveAttribute("data-ui-size", "xlarge");
	const after = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
	expect(after).toBeCloseTo(before * (1.3 / 1.1), 2);
});

import { expect, type Page, test } from "@playwright/test";
import type { ConnectorDefinition, DeviceSummary } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const catalog: ConnectorDefinition[] = (["local-files", "computer-control"] as const).map((id) => ({
	id,
	name: id,
	description: id,
	kind: "device",
	platforms: ["macos", "windows", "linux"],
}));

function device(id: string, name: string, platform: DeviceSummary["platform"], current = false): DeviceSummary {
	return { id, name, platform, current, status: "online", lastSeenAt: "2026-11-19T00:00:00Z", appVersion: "0.3.0" };
}

const browser = device("web", "Chrome", "web", true);
const phone = device("ios", "iPhone", "ios");
const mac = device("mac", "MacBook Pro", "macos");
const work = device("work", "工作室的桌面电脑", "windows");
const home = device("home", "家用工作站桌面电脑", "windows");

async function openConnectors(page: Page, items: DeviceSummary[]) {
	await isolateChat(page);
	await page.route("**/v1/connectors/catalog", (route) => route.fulfill({ json: { items: catalog } }));
	await page.route("**/v1/devices", (route) => route.fulfill({ json: { items } }));
	await page.goto("/me/connectors");
}

test("shows only signed-in devices supported by the connector catalog", async ({ page }, info) => {
	await openConnectors(page, [browser, phone, mac]);
	const nav = page.getByRole("navigation", { name: "设备" });
	await expect(nav.getByRole("link")).toHaveText([mac.name]);
	await expect(nav.getByRole("link", { name: mac.name })).toHaveAttribute("aria-current", "true");
	await expect(
		page
			.getByRole("region", { name: mac.name })
			.getByRole("button", { name: /读取文件/ })
			.first(),
	).toBeVisible();
	await expect(page.getByRole("region", { name: /Chrome|iPhone/ })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("connectors-supported-devices.png") });
});

test("scrolling and device links keep the same selected group on a narrow screen", async ({ page }, info) => {
	await page.setViewportSize({ width: 390, height: 450 });
	await openConnectors(page, [browser, mac, work, home, phone]);
	const nav = page.getByRole("navigation", { name: "设备" });
	const link = (entry: DeviceSummary) => nav.getByRole("link", { name: entry.name });
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	const middle = page.getByRole("region", { name: work.name });
	const distance = await middle.evaluate((section) => {
		const frame = section.closest("[data-frame-scroll]");
		if (!frame) throw new Error("Missing settings scroll container");
		return Math.ceil(section.getBoundingClientRect().top - frame.getBoundingClientRect().top);
	});
	await page.mouse.move(195, 300);
	await page.mouse.wheel(0, distance);
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await page.mouse.wheel(0, 1000);
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	await expect.poll(() => nav.evaluate((bar) => bar.scrollLeft)).toBeGreaterThan(0);
	await page.screenshot({ path: info.outputPath("connectors-scroll-selected.png") });
	await page.mouse.wheel(0, -1000);
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	await link(work).click();
	await expect(middle).toBeFocused();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await expect(nav.getByRole("link")).toHaveText([mac.name, work.name, home.name]);
	await expect(page).toHaveURL(/\/me\/connectors$/);
});

test("device clicks select each group even when scroll targets coincide", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 505 });
	await openConnectors(page, [browser, mac, work, home, phone]);
	const nav = page.getByRole("navigation", { name: "设备" });
	const link = (entry: DeviceSummary) => nav.getByRole("link", { name: entry.name });
	await expect(link(mac)).toHaveAttribute("aria-current", "true");
	await link(work).click();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	const top = () =>
		nav.evaluate((bar) => {
			const frame = bar.closest("[data-frame-scroll]");
			if (!frame) throw new Error("Missing settings scroll container");
			return frame.scrollTop;
		});
	const middleTop = await top();
	expect(middleTop).toBeGreaterThan(0);
	await link(home).click();
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	expect(await top()).toBe(middleTop);
	await link(work).click();
	await expect(link(work)).toHaveAttribute("aria-current", "true");
	await expect(page.getByRole("region", { name: work.name })).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect.poll(top).toBe(0);
	await link(home).click();
	await expect(link(home)).toHaveAttribute("aria-current", "true");
	expect(await top()).toBe(0);
});

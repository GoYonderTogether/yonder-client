import { expect, test } from "@playwright/test";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({
	viewport: { width: 390, height: 844 },
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
});

test("mobile browsers retain the existing header and dock layout", async ({ page }) => {
	await isolateChat(page);
	await page.goto(`/messages/${conversation.id}`);
	const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
	await expect(frame.locator("[data-frame-header]")).toBeVisible();
	await expect(page.locator("html")).not.toHaveAttribute("data-native-mobile");
	await expect(frame.locator("[data-frame-header]")).toHaveCSS("position", "static");
	await expect(page.locator("[data-mobile-dock]")).toHaveCSS("position", "relative");
	expect(
		await frame.locator("[data-frame-header]").evaluate((element) => getComputedStyle(element, "::before").content),
	).toBe("none");
});

test("native geometry lets content pass under chrome while retaining first and last item clearance", async ({
	page,
}) => {
	// The native runtime is covered separately on each platform. This fixture exercises the shared layout.
	await page.addInitScript(() => {
		const observer = new MutationObserver(() => {
			const root = document.documentElement;
			if (!root) return;
			root.dataset.nativeMobile = "true";
			root.style.setProperty("--native-safe-area-inset-top", "59px");
			root.style.setProperty("--native-safe-area-inset-bottom", "34px");
			observer.disconnect();
		});
		observer.observe(document, { childList: true, subtree: true });
	});
	await isolateChat(page, {
		items: Array.from({ length: 40 }, (_, index) =>
			message(`message-${String(index).padStart(2, "0")}`, `滚动验证内容 ${index}。`.repeat(5)),
		),
	});
	await page.goto(`/messages/${conversation.id}`);
	const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
	const header = frame.locator("[data-frame-header]");
	const scroll = frame.locator("[data-frame-scroll]");
	await expect(header).toBeVisible();
	await expect(header).toHaveCSS("position", "absolute");
	await expect(page.locator("[data-mobile-dock]")).toHaveCSS("position", "absolute");
	await expect
		.poll(() => scroll.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop)))
		.toBe(111);
	const blur = await header.evaluate((element) => {
		const style = getComputedStyle(element, "::before");
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas unavailable");
		context.fillStyle = style.backgroundColor;
		context.fillRect(0, 0, 1, 1);
		return { blur: style.backdropFilter, mask: style.maskImage, alpha: context.getImageData(0, 0, 1, 1).data[3] };
	});
	expect(blur.blur).toContain("blur(");
	expect(blur.mask).toContain("linear-gradient");
	expect(blur.mask).toContain("calc(100% - 24px)");
	expect(blur.alpha).toBeGreaterThan(0);
	expect(blur.alpha).toBeLessThan(255);
	await scroll.evaluate((element) => {
		element.scrollTop = 0;
	});
	const first = page.getByText("滚动验证内容 0。".repeat(5), { exact: true });
	const firstTop = (await first.boundingBox())?.y ?? 0;
	expect(firstTop).toBeGreaterThanOrEqual(111);
	await scroll.evaluate((element) => {
		element.scrollTop = 90;
	});
	expect((await first.boundingBox())?.y ?? 0).toBeLessThan(59);
	await scroll.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	const last = page.getByText("滚动验证内容 39。".repeat(5), { exact: true });
	const lastBox = await last.boundingBox();
	const dockBox = await page.locator("[data-mobile-dock]").boundingBox();
	expect(lastBox && dockBox && lastBox.y + lastBox.height <= dockBox.y).toBe(true);
	await page.setViewportSize({ width: 844, height: 390 });
	const landscapeComposer = page.locator("[data-native-composer]");
	await expect(landscapeComposer).toBeVisible();
	await expect(landscapeComposer).toHaveCSS("position", "absolute");
	await expect(page.locator('[data-page-layer="detail"]')).toHaveCSS("padding-top", "0px");
	await expect(page.locator('[data-page-layer="detail"] > main')).toHaveCSS("border-top-left-radius", "0px");
	expect((await scroll.boundingBox())?.y).toBe(0);
	await scroll.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	const landscapeLast = await last.boundingBox();
	const landscapeDock = await landscapeComposer.boundingBox();
	expect(landscapeLast && landscapeDock && landscapeLast.y + landscapeLast.height <= landscapeDock.y).toBe(true);
});

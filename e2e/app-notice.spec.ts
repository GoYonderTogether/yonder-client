import { expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

for (const mobile of [false, true]) {
	test.describe(mobile ? "mobile touch" : "desktop mouse", () => {
		if (mobile) {
			test.use({
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
				userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
			});
		} else {
			test.use({ viewport: { width: 1280, height: 800 } });
		}
		test.use({ reducedMotion: "reduce" });
		test("a real recording error appears briefly and passes input through", async ({ page }, info) => {
			await isolateChat(page, { dark: mobile });
			await page.addInitScript(() => {
				Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
					value: async () => {
						throw new DOMException("Fixture permission denial", "NotAllowedError");
					},
				});
			});
			await page.goto("/messages/main");
			if (mobile) {
				await page.evaluate(() => {
					document.documentElement.dataset.nativeMobile = "true";
					document.documentElement.style.setProperty("--native-safe-area-inset-top", "59px");
				});
			}
			await page.getByRole("button", { name: "添加附件" }).click();
			await page.getByRole("button", { name: "录音笔记", exact: true }).click();

			const notice = page.getByRole("status").filter({ hasText: "请在系统设置中允许麦克风访问。" });
			await expect(notice).toHaveCount(1);
			const bubble = notice.locator(".app-notice");
			await expect(bubble).toHaveCSS("pointer-events", "none");
			await expect(bubble.locator("span")).toHaveCSS("pointer-events", "none");
			await expect(bubble).toHaveCSS("animation-duration", "0s");
			const box = await bubble.boundingBox();
			if (!box) throw new Error("Expected a measured notice");
			const viewport = page.locator(".app-notice-viewport");
			await expect(viewport).toHaveCSS("position", "fixed");
			const inset = await viewport.evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
			expect(box.y).toBeCloseTo(inset, 1);
			if (mobile) expect(inset).toBeGreaterThan(59);
			await page.screenshot({ path: info.outputPath(mobile ? "mobile.png" : "desktop.png"), scale: "css" });

			const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			await page.evaluate(({ x, y }) => {
				const button = document.createElement("button");
				button.id = "notice-hit-target";
				button.textContent = "Page action";
				button.style.cssText = `position:fixed;left:${x - 30}px;top:${y - 20}px;width:60px;height:40px;z-index:var(--z-overlay)`;
				button.addEventListener("click", () => {
					button.dataset.clicked = "yes";
				});
				document.body.append(button);
			}, point);
			if (mobile) await page.touchscreen.tap(point.x, point.y);
			else await page.mouse.click(point.x, point.y);
			await expect(page.locator("#notice-hit-target")).toHaveAttribute("data-clicked", "yes");
			await expect(notice).toBeVisible();
			await expect(notice).toHaveCount(0, { timeout: 5000 });
		});
	});
}

import { expect, test } from "@playwright/test";
import { conversation, isolateChat } from "./chat-fixture.ts";

for (const native of [false, true]) {
	test.describe(native ? "native mobile" : "desktop", () => {
		test.use(
			native
				? {
						viewport: { width: 390, height: 844 },
						isMobile: true,
						hasTouch: true,
						userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
					}
				: { viewport: { width: 1280, height: 900 } },
		);
		test("non-chat chrome stops at the top inset", async ({ page }, info) => {
			const safeTop = native ? 59 : 0;
			await page.emulateMedia({ reducedMotion: "reduce" });
			if (native) {
				await page.addInitScript((top) => {
					const observer = new MutationObserver(() => {
						const root = document.documentElement;
						if (!root) return;
						root.dataset.nativeMobile = "true";
						root.style.setProperty("--native-safe-area-inset-top", `${top}px`);
						root.style.setProperty("--native-safe-area-inset-bottom", "34px");
						observer.disconnect();
					});
					observer.observe(document, { childList: true, subtree: true });
				}, safeTop);
			}
			await isolateChat(page, { dark: native });
			await page.route("**/v1/conversations", (route) =>
				route.fulfill({
					json: {
						items: Array.from({ length: 35 }, (_, index) => ({
							...conversation,
							id: index === 0 ? conversation.id : `conversation-${index}`,
							kind: index === 0 ? "direct" : "group",
							isPrimary: index === 0,
							title: index === 0 ? null : `项目讨论 ${index}`,
						})),
					},
				}),
			);
			await page.goto("/messages");
			await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", native ? "mobile" : "wide");
			const header = page.getByRole("complementary").locator("[data-frame-header]").first();
			const scroller = header.locator("xpath=following-sibling::*[@data-frame-scroll]");
			await expect(scroller.getByText("项目讨论 1", { exact: true })).toBeVisible();
			const scrollTop = await scroller.evaluate((element) => {
				element.scrollTop = 40;
				return element.scrollTop;
			});
			expect(scrollTop).toBe(40);
			await page.screenshot({ path: info.outputPath("messages-list.png"), animations: "disabled" });
			const chrome = await header.evaluate((element) => {
				const pseudo = getComputedStyle(element, "::before");
				return {
					backdrop: pseudo.backdropFilter,
					height: pseudo.height,
					content: pseudo.content,
					padding: getComputedStyle(element.querySelector("[data-shell-topbar]") as HTMLElement).paddingTop,
				};
			});

			await page.goto("/privacy");
			const legal = page.locator("[data-native-legal-header]");
			await expect(legal.getByRole("button")).toBeVisible();
			await page.evaluate(() => window.scrollTo(0, 158));
			await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(158);
			await page.screenshot({ path: info.outputPath("privacy.png"), animations: "disabled" });
			expect(chrome).toEqual(
				native
					? { backdrop: "blur(20px)", height: `${safeTop}px`, content: '""', padding: `${safeTop}px` }
					: { backdrop: "none", height: "auto", content: "none", padding: "0px" },
			);
			expect(await legal.evaluate((element) => getComputedStyle(element, "::before").height)).toBe(
				native ? `${safeTop}px` : "auto",
			);
		});
	});
}

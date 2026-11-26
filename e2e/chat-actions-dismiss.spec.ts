import { devices, expect, test } from "@playwright/test";
import { bodies, isolateChat } from "./chat-fixture.ts";

for (const width of [1440, 900, 600]) {
	test(`chat action dialogs close and reopen at viewport width ${width}`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		await isolateChat(page);
		await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
		await page.goto("/messages");
		for (const action of ["Add contacts", "Start group chat", "Create BOT"]) {
			const dialog = page.getByRole("dialog", { name: action, exact: true });
			for (const exit of ["close", "Escape", ...(width === 1440 ? ["backdrop"] : [])]) {
				await page.getByRole("button", { name: "New chat", exact: true }).click();
				await expect(page.getByRole("menuitem", { name: "Scan QR code" })).toHaveCount(0);
				await page.getByRole("menuitem", { name: action, exact: true }).click();
				await expect(dialog).toBeVisible();
				if (width === 1440) {
					const ratio = await dialog.evaluate((panel) => panel.clientHeight / panel.clientWidth);
					expect(ratio).toBeGreaterThanOrEqual(1);
				}
				if (action === "Add contacts") {
					await expect(dialog.getByRole("button", { name: /Scan QR code/ })).toHaveCount(0);
					await expect(dialog.getByRole("img", { name: "My QR code" })).toBeVisible();
				}
				// Clicking inside must not dismiss the dialog.
				await dialog.getByRole("heading", { name: action, exact: true }).click();
				await expect(dialog).toBeVisible();
				if (exit === "Escape") await page.keyboard.press("Escape");
				else if (exit === "backdrop") await page.mouse.click(10, 10);
				else await dialog.getByRole("button", { name: /^(Close|Back)$/, exact: true }).click();
				await expect(dialog).toHaveCount(0);
				await expect(page.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
			}
		}
	});
}

for (const mobile of [false, true]) {
	test.describe(mobile ? "phone composer" : "desktop composer", () => {
		const { viewport, userAgent } = devices["iPhone 13"];
		test.use(
			mobile ? { viewport, userAgent, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 844 } },
		);
		test("attachment menu closes when pressing outside", async ({ page }, testInfo) => {
			await isolateChat(page);
			await page.goto("/messages/main");
			const press = mobile ? "tap" : "click";
			const trigger = page.getByRole("button", { name: "添加附件", exact: true });
			const files = page.getByRole("button", { name: mobile ? "发送文件" : "上传文件", exact: true });
			const recording = page.getByRole("button", { name: "录音笔记", exact: true });
			const editor = page.getByRole("textbox", { name: /^对 界面验收/ });
			await trigger[press]();
			await expect(files).toBeVisible();
			await expect(recording).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath("menu-open.png"), animations: "disabled" });
			await editor[press]();
			await expect(editor).toBeFocused();
			await expect(trigger).toHaveAttribute("aria-expanded", "false");
			await trigger[press]();
			await page.getByText(bodies.question, { exact: true })[press]();
			await expect(trigger).toHaveAttribute("aria-expanded", "false");
			await expect(files).toHaveCount(0);
			await expect(recording).toHaveCount(0);
			await page.screenshot({ path: testInfo.outputPath("menu-closed.png"), animations: "disabled" });
		});
	});
}
test("desktop add-contact route keeps ID search and QR without opening the camera", async ({ page }) => {
	await isolateChat(page);
	await page.addInitScript(() => {
		localStorage.setItem("yonder.locale", "en");
		Object.defineProperty(navigator, "mediaDevices", {
			value: {
				getUserMedia: () => {
					throw new Error("Unexpected camera request");
				},
			},
		});
	});
	await page.goto("/contacts/add");
	await expect(page.getByRole("searchbox", { name: "Search ID or phone" })).toBeVisible();
	await expect(page.getByRole("img", { name: "My QR code" })).toBeVisible();
	await expect(page.getByRole("button", { name: /Scan QR code/ })).toHaveCount(0);
	await expect(page.locator("video")).toHaveCount(0);
});

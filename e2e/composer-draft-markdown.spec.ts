import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
const sample = "# 周末安排\n- 买 **咖啡**\n- 带伞\n\n1. 查天气\n2. 确认出门时间";

for (const mobile of [true, false]) {
	test.describe(mobile ? "mobile Markdown draft" : "desktop Markdown draft", () => {
		test.use(mobile ? iphone : { viewport: { width: 1120, height: 800 } });

		test("decorates a draft without altering its clipboard, caret, or outgoing source", async ({
			page,
			context,
		}, info) => {
			const { sent } = await isolateChat(page);
			await page.goto("/messages/main");
			const input = page.locator("textarea.composer-text");
			if (mobile) await input.fill(sample);
			else {
				await context.grantPermissions(["clipboard-read", "clipboard-write"]);
				await page.evaluate((text) => navigator.clipboard.writeText(text), sample);
				await input.focus();
				await page.keyboard.press("Control+v");
			}
			const mirror = page.locator(".composer-highlight");
			const layout = page.locator(".composer-layout");
			if (mobile) {
				const [paintBounds, inputBounds, layoutBounds] = await Promise.all([
					mirror.boundingBox(),
					input.boundingBox(),
					layout.boundingBox(),
				]);
				expect(paintBounds?.x).toBe(layoutBounds?.x);
				expect(inputBounds?.x).toBe(layoutBounds?.x);
				await expect(mirror).not.toHaveCSS("text-align", "center");
			}
			await expect(mirror).toBeVisible();
			await expect(mirror.locator(".composer-draft-heading")).toHaveText("周末安排");
			await expect(mirror.locator(".composer-draft-strong")).toHaveText("咖啡");
			await expect(mirror.locator(".composer-draft-syntax")).toHaveCount(7);
			expect(await mirror.textContent()).toBe(`${sample}\n`);
			await expect(input).toHaveValue(sample);
			const fontMetrics = await input.evaluate((node) => {
				const paint = node.parentElement?.querySelector(".composer-draft-strong");
				if (!paint) throw new Error("Missing emphasis");
				const sourceStyle = getComputedStyle(node);
				const paintStyle = getComputedStyle(paint);
				return [sourceStyle.fontSize, paintStyle.fontSize, sourceStyle.fontWeight, paintStyle.fontWeight];
			});
			expect(fontMetrics[0]).toBe(fontMetrics[1]);
			expect(fontMetrics[2]).toBe(fontMetrics[3]);
			await page.screenshot({ path: info.outputPath("01-markdown-draft.png"), animations: "disabled", scale: "css" });

			if (mobile) {
				await input.evaluate((node) => (node as HTMLTextAreaElement).setSelectionRange(1, 5));
				await page.getByRole("button", { name: "展开输入框" }).tap();
				await expect(mirror).toBeVisible();
				expect(await input.evaluate((node) => (node as HTMLTextAreaElement).selectionEnd)).toBe(5);
				await page.screenshot({
					path: info.outputPath("02-markdown-fullscreen.png"),
					animations: "disabled",
					scale: "css",
				});
				await page.getByRole("button", { name: "收起输入框" }).tap();
			}
			if (!mobile) await page.evaluate(() => navigator.clipboard.writeText("clipboard before copy"));
			const clipboardText = await input.evaluate((node) => {
				const editor = node as HTMLTextAreaElement;
				editor.select();
				return editor.value.slice(editor.selectionStart, editor.selectionEnd);
			});
			expect(clipboardText).toBe(sample);
			if (!mobile) {
				await page.keyboard.press("Control+c");
				expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sample);
			}
			await page.getByRole("button", { name: "发送", exact: true }).click();
			await expect.poll(() => sent.map(({ body }) => body)).toEqual([sample]);
			const message = page.locator("[data-message-sender=self]").last();
			const heading = message.getByRole("heading", { name: "周末安排", level: 1 });
			await expect(heading).toBeVisible();
			await expect(heading).toHaveCSS("font-size", "16px");
			await expect(message.locator("ul li")).toHaveCount(2);
			await expect(message.locator("ol li")).toHaveCount(2);
			await expect(message.locator("strong")).toHaveText("咖啡");
			await page.screenshot({ path: info.outputPath("03-markdown-sent.png"), animations: "disabled", scale: "css" });
		});
	});
}

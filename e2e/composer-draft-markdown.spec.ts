import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
const sample = "# 周末安排\n- 买 **咖啡**\n- 带伞\n\n1. 查天气\n2. 确认出门时间";

// Each construct in prose, and the bubble element it must turn into once sent.
const cases = [
	{ name: "bold", source: "今天 **咖啡** 到了", kind: "strong", bubble: "strong" },
	{ name: "italic", source: "这事 _重要_ 记得", kind: "em", bubble: "em" },
	{ name: "underline-bold", source: "明天 __记得__ 带伞", kind: "strong", bubble: "strong" },
	{ name: "inline-code", source: "改在 `composer.tsx` 里", kind: "code", bubble: "code" },
	{ name: "strike", source: "旧值 ~~作废~~ 了", kind: "strike", bubble: "del" },
	{ name: "link", source: "见 [文档](https://example.com)", kind: "link", bubble: "a" },
	{ name: "bare-url", source: "见 https://example.com 页", kind: "link", bubble: "a" },
	{ name: "heading", source: "## 计划 内容", kind: "heading", bubble: "h2" },
	{ name: "quote", source: "> 转写质量太差", kind: "syntax", bubble: "blockquote" },
	{ name: "bullet", source: "- 一条 待办", kind: "syntax", bubble: "li" },
	{ name: "ordered", source: "1. 第一件事\n2. 第二件事", kind: "syntax", bubble: "li" },
] as const;

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
			const canClipboard = await context
				.grantPermissions(["clipboard-read", "clipboard-write"])
				.then(() => true)
				.catch(() => false);
			if (!mobile && canClipboard) {
				await page.evaluate((text) => navigator.clipboard.writeText(text), sample);
				await input.focus();
				await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v");
			} else await input.fill(sample);
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
			// # , two list bullets, two ordered markers, and the two `**` of **咖啡**: seven marker runs.
			await expect(mirror.locator(".composer-draft-syntax")).toHaveCount(7);
			expect(await mirror.textContent()).toBe(`${sample}\n`);
			await expect(input).toHaveValue(sample);
			// Paint-only: emphasis never changes weight or size, so glyphs stay on the textarea grid.
			const metrics = await input.evaluate((node) => {
				const paint = node.parentElement?.querySelector(".composer-draft-strong");
				if (!paint) throw new Error("Missing emphasis");
				const source = getComputedStyle(node);
				const formatted = getComputedStyle(paint);
				return [source.fontSize, formatted.fontSize, source.fontWeight, formatted.fontWeight];
			});
			expect(metrics[0]).toBe(metrics[1]);
			expect(metrics[2]).toBe(metrics[3]);
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
			if (!mobile && canClipboard) {
				await page.keyboard.press(process.platform === "darwin" ? "Meta+c" : "Control+c");
				expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sample);
			}
			await page.getByRole("button", { name: "发送", exact: true }).click();
			await expect.poll(() => sent.map(({ body }) => body)).toEqual([sample]);
			const message = page.locator("[data-message-sender=self]").last();
			await expect(message.getByRole("heading", { name: "周末安排", level: 1 })).toBeVisible();
			await expect(message.locator("ul li")).toHaveCount(2);
			await expect(message.locator("ol li")).toHaveCount(2);
			await expect(message.locator("strong")).toHaveText("咖啡");
			await page.screenshot({ path: info.outputPath("03-markdown-sent.png"), animations: "disabled", scale: "css" });
		});

		test("every syntax lights up exactly the format its sent bubble renders", async ({ page }, info) => {
			const { sent } = await isolateChat(page);
			await page.goto("/messages/main");
			const input = page.locator("textarea.composer-text");
			const mirror = page.locator(".composer-highlight");
			const rows: string[] = [];
			for (const sample of cases) {
				await input.fill(sample.source);
				const overlay = await mirror.locator(`.composer-draft-${sample.kind}`).count();
				expect(overlay, `${sample.name}: overlay marks`).toBeGreaterThan(0);
				await page.getByRole("button", { name: "发送", exact: true }).click();
				await expect.poll(() => sent.length).toBeGreaterThan(0);
				const message = page.locator("[data-message-sender=self]").last();
				await expect(message.locator(sample.bubble).first(), `${sample.name}: bubble renders`).toBeVisible();
				rows.push(`${sample.name}: .composer-draft-${sample.kind} → ${sample.bubble}`);
				sent.length = 0;
			}
			console.log(`SYNTAX TABLE\n${rows.join("\n")}`);
			await page.screenshot({ path: info.outputPath("04-syntax-table.png"), animations: "disabled", scale: "css" });
		});

		// The clipboard read/write permission is Chromium-only; skip on the mobile WebKit profile.
		if (!mobile) {
			test("copying a rendered bubble hands back the Markdown source", async ({ page, context }) => {
				const canClipboard = await context
					.grantPermissions(["clipboard-read", "clipboard-write"])
					.then(() => true)
					.catch(() => false);
				test.skip(!canClipboard, "clipboard permissions are Chromium-only");
				await isolateChat(page);
				await page.goto("/messages/main");
				const input = page.locator("textarea.composer-text");
				const source = "**重点** 和 `code` 以及 [链接](https://example.com)";
				await input.fill(source);
				await page.getByRole("button", { name: "发送", exact: true }).click();
				const message = page.locator("[data-message-sender=self]").last();
				await expect(message.locator("strong")).toHaveText("重点");
				await page.evaluate(() => navigator.clipboard.writeText("before"));
				// Select the whole rendered bubble and copy it; the clipboard must carry the source, not
				// the flattened "重点 和 code 以及 链接".
				await message
					.locator(".message-content")
					.last()
					.evaluate((node) => {
						const range = document.createRange();
						range.selectNodeContents(node);
						const selection = window.getSelection();
						selection?.removeAllRanges();
						selection?.addRange(range);
					});
				await page.keyboard.press(process.platform === "darwin" ? "Meta+c" : "Control+c");
				expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
			});
		}
	});
}

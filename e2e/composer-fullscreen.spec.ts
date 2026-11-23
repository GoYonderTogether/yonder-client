import { devices, expect, type Locator, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
const sample = "明天记得检查消息气泡和录音笔记。输入几行之后可以展开，写完再收起。";

function metrics(input: Locator) {
	return input.evaluate((node) => {
		const mirror = node.parentElement?.querySelector(".composer-highlight");
		if (!mirror) throw new Error("Missing mirror");
		const textStyle = getComputedStyle(node);
		const mirrorStyle = getComputedStyle(mirror);
		const { width, height, left } = node.getBoundingClientRect();
		return {
			width,
			height,
			left,
			font: textStyle.fontSize,
			mirrorFont: mirrorStyle.fontSize,
			lineHeight: textStyle.lineHeight,
			mirrorLineHeight: mirrorStyle.lineHeight,
		};
	});
}

for (const width of [320, 390]) {
	test.describe(`phone ${width}px`, () => {
		test.use({ ...iphone, viewport: { width, height: 780 } });

		test("Chinese input keeps stable line geometry and expands the same scrollable draft with voice on the left", async ({
			page,
		}, info) => {
			await isolateChat(page);
			await page.goto("/messages/main");
			const input = page.locator("textarea.composer-text");
			const expand = page.getByRole("button", { name: "展开输入框" });
			const collapse = page.getByRole("button", { name: "收起输入框" });
			const voice = page.getByRole("button", { name: "语音输入", exact: true });
			const layout = page.locator(".composer-layout");
			await expect(voice).toBeVisible();
			const voiceLeft = await voice.evaluate((node) => node.getBoundingClientRect().left);
			expect(voiceLeft).toBe((await layout.boundingBox())?.x);
			await input.fill("明");
			await expect(expand).toHaveCount(0);
			const one = await metrics(input);
			expect((await voice.boundingBox())?.x).toBe(voiceLeft);
			expect(one.left).toBeGreaterThan(voiceLeft);
			expect(one.font).toBe("16px");
			expect(one.mirrorFont).toBe(one.font);
			expect(one.mirrorLineHeight).toBe(one.lineHeight);
			await page.screenshot({ path: info.outputPath("01-one-line.png"), animations: "disabled", scale: "css" });

			for (const character of sample.slice(1)) {
				await page.keyboard.insertText(character);
				const current = await metrics(input);
				expect(current.width).toBe(one.width);
				expect(current.mirrorFont).toBe(current.font);
			}
			await expect(expand).toBeVisible();
			await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
			const expanded = await metrics(input);
			expect(expanded.height).toBeGreaterThan(one.height);
			expect(expanded.left).toBe(voiceLeft);
			expect((await voice.boundingBox())?.x).toBe(voiceLeft);
			await page.screenshot({ path: info.outputPath("02-multiline.png"), animations: "disabled", scale: "css" });

			const originalNode = await input.elementHandle();
			await input.evaluate((e) => (e as HTMLTextAreaElement).setSelectionRange(2, 6));
			await expand.tap();
			const modal = page.getByRole("dialog", { name: "文字输入" });
			await expect(modal).toBeVisible();
			await expect(input).toBeFocused();
			expect(await modal.evaluate((node) => node.getBoundingClientRect().width)).toBe(width);
			expect((await metrics(input)).width).toBeGreaterThan(one.width);
			expect(await input.evaluate((node, original) => node === original, originalNode)).toBe(true);
			expect(await input.evaluate((node) => (node as HTMLTextAreaElement).selectionEnd)).toBe(6);

			// The native host announces the future keyboard height before its own animation.
			await page.evaluate(() => {
				window.dispatchEvent(new CustomEvent("yonder-keyboard", { detail: { height: 280, duration: 0 } }));
			});
			await expect.poll(async () => (await modal.boundingBox())?.height).toBe(500);
			expect((await input.boundingBox())?.height).toBeLessThan(500);
			await page.evaluate(() => {
				window.dispatchEvent(new CustomEvent("yonder-keyboard", { detail: { height: 0, duration: 0 } }));
			});
			await expect.poll(async () => (await modal.boundingBox())?.height).toBe(780);

			const text = Array.from({ length: 40 }, (_, i) => `${i + 1}、${sample}`).join("\n");
			await input.fill(text);
			await input.evaluate((node) => {
				(node as HTMLTextAreaElement).setSelectionRange(0, 0);
				node.scrollTop = 0;
			});
			await page.screenshot({ path: info.outputPath("03-fullscreen.png"), animations: "disabled", scale: "css" });
			const scrolled = await input.evaluate((node) => {
				node.scrollTop = node.scrollHeight;
				return node.scrollTop;
			});
			expect(scrolled).toBeGreaterThan(0);
			await input.evaluate((node) => (node as HTMLTextAreaElement).setSelectionRange(2, 6));
			await collapse.tap();
			await expect(modal).toBeHidden();
			await expect(input).toBeFocused();
			await expect(input).toHaveValue(text);
			expect(await input.evaluate((node, original) => node === original, originalNode)).toBe(true);
			expect(await input.evaluate((node) => (node as HTMLTextAreaElement).selectionStart)).toBe(2);
			expect(await input.evaluate((node) => (node as HTMLTextAreaElement).selectionEnd)).toBe(6);
			await input.fill("一\n");
			await expect(expand).toBeVisible();
			const iconBounds = await expand.boundingBox();
			for (const name of ["发送", "添加附件", "语音输入"]) {
				const button = page.getByRole("button", { name, exact: true });
				const bounds = await button.boundingBox();
				expect(iconBounds && bounds && iconBounds.y + iconBounds.height <= bounds.y).toBe(true);
			}
			await input.fill("一");
			await expect(expand).toHaveCount(0);
			expect((await voice.boundingBox())?.x).toBe(voiceLeft);
			await input.clear();
			expect((await voice.boundingBox())?.x).toBe(voiceLeft);
		});
	});
}

test("desktop keeps voice controls on the right without a fullscreen toggle", async ({ page }, info) => {
	await page.setViewportSize({ width: 1200, height: 800 });
	await isolateChat(page);
	await page.goto("/messages/main");
	const input = page.locator("textarea.composer-text");
	const voice = page.getByRole("button", { name: "语音输入", exact: true });
	const send = page.getByRole("button", { name: "发送", exact: true });
	for (const text of ["", "第一行", "第一行\n第二行"]) {
		await input.fill(text);
		await expect(page.getByRole("button", { name: "展开输入框" })).toHaveCount(0);
		const voiceBox = await voice.boundingBox();
		const inputBox = await input.boundingBox();
		const sendBox = await send.boundingBox();
		expect(voiceBox && inputBox && sendBox && inputBox.x < voiceBox.x && voiceBox.x < sendBox.x).toBe(true);
	}
	await page.screenshot({ path: info.outputPath("desktop-multiline.png"), animations: "disabled", scale: "css" });
});

test.describe("phone conversation", () => {
	test.use(iphone);

	test("Escape closes fullscreen without leaving a pushed conversation", async ({ page }) => {
		await isolateChat(page, { group: true });
		await page.goto("/messages/chat-route-check");
		const input = page.locator("textarea.composer-text");
		await input.fill("第一行\n第二行");
		await page.getByRole("button", { name: "展开输入框" }).tap();
		const modal = page.getByRole("dialog", { name: "文字输入" });
		await expect(modal).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(modal).toBeHidden();
		await expect(page).toHaveURL(/\/messages\/chat-route-check$/);
		await expect(input).toHaveValue("第一行\n第二行");
	});
});

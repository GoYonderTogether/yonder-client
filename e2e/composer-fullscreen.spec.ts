import { devices, expect, type Locator, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

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
			const bodyFont = await page.locator("body").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
			expect(Number.parseFloat(one.font)).toBeCloseTo(Math.max(16, bodyFont));
			expect(one.mirrorFont).toBe(one.font);
			expect(one.mirrorLineHeight).toBe(one.lineHeight);
			await page.screenshot({ path: info.outputPath("01-one-line.png"), animations: "disabled", scale: "css" });

			// While it is one line the draft keeps one width; the moment it wraps it takes the whole row.
			// Nothing in between: the width only ever moves from the one-line value to the expanded one.
			const widths = new Set<number>([one.width]);
			for (const character of sample.slice(1)) {
				await page.keyboard.insertText(character);
				const current = await metrics(input);
				widths.add(current.width);
				expect(current.mirrorFont).toBe(current.font);
			}
			await expect(expand).toHaveCount(0);
			await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
			await expect.poll(async () => (await metrics(input)).width, { timeout: 2000 }).toBeGreaterThan(one.width);
			const expanded = await metrics(input);
			expect([...widths].every((width) => width === one.width || width === expanded.width)).toBe(true);
			expect(expanded.height).toBeGreaterThan(one.height);
			expect(expanded.left).toBe(voiceLeft);
			expect((await voice.boundingBox())?.x).toBe(voiceLeft);
			await page.screenshot({ path: info.outputPath("02-multiline.png"), animations: "disabled", scale: "css" });

			// The draft stops growing at its line or page-share limit; only then does the scroll
			// affordance and the expand control appear.
			await input.fill(Array.from({ length: 6 }, (_, i) => `第 ${i + 1} 行`).join("\n"));
			await expect(expand).toBeVisible();
			await expect.poll(() => input.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);

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
			await input.fill(Array.from({ length: 6 }, (_, i) => `第 ${i + 1} 行`).join("\n"));
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

		test("the largest interface keeps the phone draft and Markdown mirror aligned", async ({ page }, info) => {
			await isolateChat(page);
			await page.addInitScript(() => localStorage.setItem("yonder.ui-size", "xlarge"));
			await page.goto("/messages/main");
			await expect(page.locator("html")).toHaveAttribute("data-ui-size", "xlarge");
			const input = page.locator("textarea.composer-text");
			await input.fill(`**明天**记得检查消息气泡和录音笔记。\n${sample}\n${sample}\n${sample}`);
			await expect(page.locator(".composer-draft-strong")).toHaveText("明天");
			await expect(page.getByRole("button", { name: "展开输入框" })).toBeVisible();
			const inline = await metrics(input);
			expect(inline.font).toBe("19.5px");
			expect(inline.mirrorFont).toBe(inline.font);
			expect(inline.mirrorLineHeight).toBe(inline.lineHeight);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
			await page.screenshot({ path: info.outputPath("largest-draft.png"), animations: "disabled", scale: "css" });
			await page.getByRole("button", { name: "展开输入框" }).tap();
			await expect(page.getByRole("dialog", { name: "文字输入" })).toBeVisible();
			const full = await metrics(input);
			expect(full.font).toBe(inline.font);
			expect(full.mirrorFont).toBe(full.font);
			expect(full.mirrorLineHeight).toBe(full.lineHeight);
		});
	});
}

test.describe("phone draft limit", () => {
	test.use({ ...iphone, viewport: { width: 390, height: 780 } });

	test("the draft grows to five full lines, then scrolls inside without moving the conversation", async ({ page }) => {
		await isolateChat(page, {
			items: Array.from({ length: 24 }, (_, index) =>
				message(`message-${String(index + 10)}`, `历史消息 ${index + 1}`, index % 2 === 0),
			),
		});
		await page.goto("/messages/main");
		const input = page.locator("textarea.composer-text");
		const expand = page.getByRole("button", { name: "展开输入框" });
		const draft = (count: number) => Array.from({ length: count }, (_, i) => `第 ${i + 1} 行`).join("\n");
		const geometry = () =>
			input.evaluate((node) => {
				const style = getComputedStyle(node);
				return {
					height: node.getBoundingClientRect().height,
					lineHeight: Number.parseFloat(style.lineHeight),
					scrollRange: node.scrollHeight - node.clientHeight,
				};
			});
		const scroller = page.locator("[data-conversation-scroll]");
		const distanceFromLatest = () =>
			scroller.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);

		await expect.poll(distanceFromLatest).toBeLessThanOrEqual(1);
		await input.fill(draft(1));
		const one = await geometry();
		await input.fill(draft(5));
		const five = await geometry();
		expect(five.height - one.height).toBeCloseTo(4 * one.lineHeight, 1);
		expect(five.scrollRange).toBe(0);
		await expect(expand).toHaveCount(0);
		await expect.poll(distanceFromLatest).toBeLessThanOrEqual(1);

		await input.fill(draft(6));
		const six = await geometry();
		expect(six.height).toBe(five.height);
		expect(six.scrollRange).toBeGreaterThan(0);
		await expect(expand).toBeVisible();
		await expect.poll(distanceFromLatest).toBeLessThanOrEqual(1);

		const share = await page.evaluate(() => {
			const dock = document.querySelector("[data-mobile-dock]");
			const panel = dock?.parentElement;
			if (!dock || !panel) throw new Error("Missing mobile dock");
			const header = panel.querySelector("[data-conversation-header]");
			const chat = panel.getBoundingClientRect().height - (header?.getBoundingClientRect().height ?? 0);
			return dock.getBoundingClientRect().height / chat;
		});
		expect(share).toBeLessThanOrEqual(0.46);
	});
});

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
		const draft = Array.from({ length: 6 }, (_, i) => `第 ${i + 1} 行`).join("\n");
		await input.fill(draft);
		await page.getByRole("button", { name: "展开输入框" }).tap();
		const modal = page.getByRole("dialog", { name: "文字输入" });
		await expect(modal).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(modal).toBeHidden();
		await expect(page).toHaveURL(/\/messages\/chat-route-check$/);
		await expect(input).toHaveValue(draft);
	});
});

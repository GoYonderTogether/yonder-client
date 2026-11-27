import { expect, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

test("desktop composer grows upward, then scrolls at the line or panel limit", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await isolateChat(page, {
		items: Array.from({ length: 32 }, (_, index) =>
			message(`message-${String(index + 10)}`, `历史消息 ${index + 1}`, index % 2 === 0),
		),
	});
	await page.goto("/messages/main");

	const input = page.locator("[data-native-composer] textarea.composer-text");
	await expect(input).toBeEditable();
	const geometry = () =>
		input.evaluate((node) => {
			const dock = node.closest("[data-native-composer]");
			if (!dock?.parentElement) throw new Error("Missing desktop composer dock");
			const style = getComputedStyle(node);
			const { bottom, height, left, width } = node.getBoundingClientRect();
			return {
				bottom,
				left,
				width,
				height,
				lineHeight: Number.parseFloat(style.lineHeight),
				scrollRange: node.scrollHeight - node.clientHeight,
				dockShare: dock.getBoundingClientRect().height / dock.parentElement.getBoundingClientRect().height,
			};
		});
	const draft = (count: number) => Array.from({ length: count }, (_, i) => `第 ${i + 1} 行`).join("\n");

	const scroller = page.locator("main [data-conversation-scroll]");
	const distanceFromLatest = () => scroller.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
	await expect.poll(distanceFromLatest).toBeLessThanOrEqual(1);
	await input.fill(draft(1));
	const one = await geometry();
	await input.fill(draft(2));
	const two = await geometry();
	expect(two.height - one.height).toBeCloseTo(one.lineHeight, 1);
	expect(two.bottom).toBe(one.bottom);
	expect(two.left).toBe(one.left);
	expect(two.width).toBe(one.width);
	expect(two.scrollRange).toBe(0);
	await input.fill("自然折行".repeat(15));
	expect((await geometry()).height).toBeGreaterThan(one.height);
	expect((await geometry()).scrollRange).toBe(0);

	await input.fill(draft(11));
	const eleven = await geometry();
	expect(eleven.height - one.height).toBeCloseTo(10 * one.lineHeight, 1);
	expect(eleven.scrollRange).toBe(0);
	await expect.poll(distanceFromLatest).toBeLessThanOrEqual(1);
	await input.fill(draft(12));
	expect((await geometry()).height).toBe(eleven.height);
	expect((await geometry()).scrollRange).toBeGreaterThan(0);
	await input.hover();
	await page.mouse.wheel(0, 300);
	await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
	await page.mouse.wheel(0, -300);
	await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBe(0);

	await scroller.evaluate((node) => {
		node.scrollTop -= 300;
	});
	await expect.poll(distanceFromLatest).toBeGreaterThan(200);
	const readerPosition = () => scroller.evaluate((node) => node.scrollTop);
	const before = await readerPosition();
	await input.fill(draft(8));
	await expect.poll(readerPosition).toBe(before);
	await input.fill(draft(12));

	await page.setViewportSize({ width: 1280, height: 400 });
	await expect.poll(async () => (await geometry()).dockShare).toBeLessThanOrEqual(0.4);
	expect((await geometry()).height).toBeLessThan(eleven.height);
	await input.fill(draft(1));
	expect((await geometry()).height).toBe(one.height);
	expect((await geometry()).scrollRange).toBe(0);

	await page.setViewportSize({ width: 1280, height: 520 });
	await page.getByLabel("上传文件", { exact: true }).setInputFiles({
		name: "notes.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("附件"),
	});
	await expect(page.locator(".composer-file")).toHaveCount(1);
	await expect.poll(async () => (await geometry()).dockShare).toBeLessThanOrEqual(0.4);
	expect((await geometry()).height).toBe(one.height);
});

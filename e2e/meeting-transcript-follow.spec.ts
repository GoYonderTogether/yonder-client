import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
test.use({
	reducedMotion: "reduce",
	launchOptions: {
		args: [
			"--disable-gpu",
			"--disable-software-rasterizer",
			"--no-zygote",
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
		],
	},
});

const time = (ms: number) => new Date(ms).toISOString().slice(11, 23);
const history = Array.from({ length: 24 }, (_, index) => {
	const start = index * 125;
	const speaker = (index % 2) + 1;
	return `${time(start)}–${time(start + 100)} 第1段说话人${speaker}：第${index + 1}句，验证阅读位置不会被后续转写或照片挤走。`;
});
const firstNew = "底部跟随时到达的转写。";
const readerNew = "回看旧段落期间到达的转写。";
const resumedNew = "回到底部之后继续跟随的转写。";

for (const mobile of [false, true]) {
	test.describe(mobile ? "iPhone-sized" : "desktop", () => {
		test.use(mobile ? iphone : { viewport: { width: 1180, height: 820 } });

		test("follows the live transcript unless the reader scrolls up, then offers one jump", async ({ page }, info) => {
			await isolateChat(page, { items: [] });
			let recorded = 0;
			let transcript = history.join("\n");
			await page.route("**/v1/meetings/**", (route) => {
				const path = new URL(route.request().url()).pathname;
				const segment = /\/segments\/(\d+)$/.exec(path);
				if (segment) recorded = Math.max(recorded, Number(segment[1]) + 1);
				return route.fulfill({
					json: {
						meetingId: "scrolling-recording",
						nextSegmentIndex: recorded,
						committedThroughSegmentIndex: recorded - 1,
						transcript: recorded ? transcript : "",
						captureState: "recording",
						lastClientSeenAt: Date.now(),
						errorCode: null,
						recording: true,
					},
				});
			});

			await page.goto("/messages/main");
			await page.getByRole("button", { name: "添加附件" }).click();
			await page.getByRole("button", { name: "录音笔记", exact: true }).click();
			const dialog = page.getByRole("dialog", { name: "实时转写" });
			const scroll = dialog.locator(".meeting-transcript");
			const log = dialog.getByRole("log");
			const jump = dialog.getByRole("button", { name: "跳至最新" });
			const distance = () => scroll.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);

			await expect(log.locator("p")).toHaveCount(24, { timeout: 12_000 });
			await expect.poll(distance).toBeLessThanOrEqual(2);
			await expect(jump).toHaveCount(0);
			await scroll.evaluate((node) => {
				node.scrollTop = node.scrollHeight - node.clientHeight - 24;
			});
			await expect.poll(distance).toBe(24);
			await expect(jump).toHaveCount(0);
			transcript += `\n00:00:03.300–00:00:03.700 第2段说话人1：${firstNew}`;
			await expect(log.getByText(firstNew, { exact: true })).toBeVisible();
			await expect.poll(distance).toBeLessThanOrEqual(2);
			await expect(log.locator("[data-current]")).toHaveCount(1);
			await expect(log.locator("[data-current]")).toContainText(firstNew);
			await expect(jump).toHaveCount(0);

			await scroll.evaluate((node) => {
				node.scrollTop = 170;
			});
			await expect(jump).toBeVisible();
			const readingTop = await scroll.evaluate((node) => node.scrollTop);
			transcript += `\n00:00:03.800–00:00:03.990 第3段说话人2：${readerNew}`;
			await expect(log.getByText(readerNew, { exact: true })).toBeAttached();
			expect(await scroll.evaluate((node) => node.scrollTop)).toBe(readingTop);

			await dialog.getByRole("button", { name: "拍照", exact: true }).click();
			const shutter = dialog.getByRole("button", { name: "拍摄照片" });
			await expect(shutter).toBeEnabled();
			await shutter.click();
			await expect(shutter).toBeEnabled();
			await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			await expect(log.getByRole("img", { name: /录音照片/ })).toBeAttached();
			await expect(jump).toBeVisible();
			expect(await scroll.evaluate((node) => node.scrollTop)).toBe(readingTop);
			await page.screenshot({
				path: info.outputPath("reading-position-kept.png"),
				animations: "disabled",
				scale: "css",
			});

			await jump.click();
			await expect.poll(distance).toBeLessThanOrEqual(2);
			await expect(scroll).toBeFocused();
			await expect(jump).toHaveCount(0);

			await expect.poll(() => recorded, { timeout: 12_000 }).toBeGreaterThan(1);
			transcript += `\n00:00:07.200–00:00:07.700 第4段说话人1：${resumedNew}`;
			await expect(log.getByText(resumedNew, { exact: true })).toBeVisible();
			await expect.poll(distance).toBeLessThanOrEqual(2);
			await expect(jump).toHaveCount(0);
			await expect(log.locator("[data-current]")).toContainText(resumedNew);
			await page.screenshot({ path: info.outputPath("following-latest.png"), animations: "disabled", scale: "css" });
		});
	});
}

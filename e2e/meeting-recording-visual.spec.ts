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

for (const mobile of [false, true]) {
	test.describe(mobile ? "iPhone-sized recording" : "desktop recording", () => {
		test.use(mobile ? iphone : { viewport: { width: 1180, height: 820 } });

		test("advances audio samples and adds a compact photo without introducing control labels", async ({
			page,
		}, info) => {
			await isolateChat(page, { items: [] });
			await page.addInitScript(() => {
				// Fixture input to the real recorder's level reader, not a UI mock that supplies bars.
				const readings = [0, 0.035, 0.14, 0.46, 0.28, 0.64, 0.33, 0.19, 0.045, 0, 0.07, 0.31, 0.16, 0.08, 0.02];
				let index = 0;
				AnalyserNode.prototype.getFloatTimeDomainData = (buffer) => {
					buffer.fill(0);
					buffer[0] = readings[index++ % readings.length] ?? 0;
				};
			});
			let audioCount = 0;
			await page.route("**/v1/meetings/**", (route) => {
				const path = new URL(route.request().url()).pathname;
				const segment = /\/segments\/(\d+)$/.exec(path);
				if (segment) audioCount = Math.max(audioCount, Number(segment[1]) + 1);
				return route.fulfill({
					json: path.endsWith("/finalize")
						? { id: "visual-recording", status: "summarizing" }
						: {
								meetingId: "visual-recording",
								nextSegmentIndex: audioCount,
								committedThroughSegmentIndex: audioCount - 1,
								transcript: audioCount ? "拍一张照片，留在这段录音里。" : "",
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
			await expect(dialog).toBeVisible();
			await expect(dialog.getByText("正在录音", { exact: true })).toHaveCount(0);
			await expect(dialog.locator(".meeting-recording-dot")).toHaveCount(0);
			const samples = dialog.locator(".meeting-level-bars > span");
			await expect.poll(() => samples.count(), { timeout: 8_000 }).toBeGreaterThan(5);
			const earlySamples = await samples.count();
			await expect.poll(() => samples.count(), { timeout: 10_000 }).toBeGreaterThan(Math.max(45, earlySamples));
			expect(
				await samples.evaluateAll((bars) => new Set(bars.map((bar) => getComputedStyle(bar).height)).size),
			).toBeGreaterThan(4);
			const camera = dialog.getByRole("button", { name: "拍照", exact: true });
			const stop = dialog.getByRole("button", { name: "结束录音", exact: true });
			await expect(camera).toHaveText("");
			await expect(stop).toHaveText("");
			await expect(stop).toHaveCSS("border-radius", "9999px");
			await expect(dialog.getByText("拍一张照片，留在这段录音里。")).toBeVisible();
			await page.screenshot({ path: info.outputPath("before-photo.png"), animations: "disabled", scale: "css" });

			await camera.click();
			const shutter = dialog.getByRole("button", { name: "拍摄照片" });
			await expect(shutter).toBeEnabled();
			await shutter.click();
			const photo = dialog.getByRole("img", { name: /录音照片/ });
			await expect(photo).toBeVisible();
			const bounds = await photo.boundingBox();
			expect(bounds?.width).toBeGreaterThan(80);
			expect(bounds?.width).toBeLessThanOrEqual(200);
			expect(bounds?.height).toBeLessThanOrEqual(180);
			await page.screenshot({ path: info.outputPath("after-photo.png"), animations: "disabled", scale: "css" });

			await stop.click();
			await expect(dialog).toHaveCount(0);
		});
	});
}

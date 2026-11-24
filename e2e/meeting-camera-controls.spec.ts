import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];

test.use({
	reducedMotion: "reduce",
	launchOptions: {
		args: ["--no-zygote", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
	},
});

for (const mobile of [false, true]) {
	test.describe(mobile ? "iPhone-sized camera" : "desktop camera", () => {
		test.use(mobile ? iphone : { viewport: { width: 1180, height: 820 } });

		test("supports repeated captures and scoped photo review without closing the recording", async ({ page }, info) => {
			await isolateChat(page, { items: [] });
			let next = 0;
			await page.route("**/v1/meetings/**", (route) => {
				const segment = /\/segments\/(\d+)$/.exec(new URL(route.request().url()).pathname);
				if (segment) next = Math.max(next, Number(segment[1]) + 1);
				return route.fulfill({
					json: {
						meetingId: "camera-fixture",
						nextSegmentIndex: next,
						committedThroughSegmentIndex: next - 1,
						transcript: "",
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
			const recording = page.getByRole("dialog", { name: "实时转写" });
			await recording.getByRole("button", { name: "拍照", exact: true }).click();
			const shutter = recording.getByRole("button", { name: "拍摄照片" });
			await expect(shutter).toBeEnabled();
			const thumbnail = recording.locator(".meeting-camera-thumbnail");
			expect(await thumbnail.count()).toBe(0);
			await shutter.click();
			await expect(thumbnail.locator("img")).toBeVisible();
			await expect(shutter).toBeEnabled();
			await shutter.click();
			await expect(shutter).toBeEnabled();
			await expect(recording.locator(".meeting-camera-recording")).toBeVisible();
			await page.screenshot({ path: info.outputPath("camera-thumbnail.png"), animations: "disabled", scale: "css" });

			await thumbnail.click();
			const gallery = page.locator(".meeting-photo-gallery");
			await expect(gallery).toBeVisible();
			if (mobile) expect((await gallery.boundingBox())?.width).toBe(page.viewportSize()?.width);
			await expect(gallery.locator("output").first()).toHaveText("2 / 2");
			const image = gallery.locator(".attachment-image-area img");
			await expect(image).toBeVisible();
			const bounds = await image.boundingBox();
			if (!bounds) throw new Error("Expected preview image bounds");
			const startX = bounds.x + bounds.width * 0.3;
			const y = bounds.y + bounds.height * 0.5;
			await page.mouse.move(startX, y);
			await page.mouse.down();
			await page.mouse.move(startX + bounds.width * 0.4, y, { steps: 5 });
			await page.mouse.up();
			await expect(gallery.locator("output").first()).toHaveText("1 / 2");
			await page.screenshot({
				path: info.outputPath("camera-session-gallery.png"),
				animations: "disabled",
				scale: "css",
			});
			await gallery.getByRole("button", { name: "关闭", exact: true }).first().click();
			await expect(shutter).toBeEnabled();
			await recording.getByRole("button", { name: "关闭", exact: true }).click();
			await expect(recording.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
			await expect(recording.locator(".meeting-transcript-entry img")).toHaveCount(2);
		});
	});
}

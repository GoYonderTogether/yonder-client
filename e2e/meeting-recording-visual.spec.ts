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
			let photoElapsed = 0;
			let late = false;
			const lateSpeech = "稍后补上的一句，应该排在照片后面。";
			const elapsed = (ms: number) => new Date(ms).toISOString().slice(11, 23);
			const speech = [
				"这周先把手机端的录音流程走一遍。 现场记下容易卡住的地方。",
				"拍一张照片，留在这段录音里。",
				"我说的「归属待确认」是另一个议题。",
			];
			const transcript = [
				"00:00:00.500–00:00:01.300 第1段说话人1：这周先把手机端的录音流程走一遍。",
				"00:00:01.600–00:00:03.500 第1段说话人1：现场记下容易卡住的地方。",
				`00:00:03.900–00:00:05.100 归属待确认：${speech[1]}`,
				"第2段 · 说话人归属待确认",
				speech[2],
			].join("\n");
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
								transcript: audioCount
									? late && photoElapsed && audioCount * 4_000 >= photoElapsed + 2_000
										? `${transcript}\n${elapsed(photoElapsed + 1000)}–${elapsed(photoElapsed + 2000)} 第3段说话人1：${lateSpeech}`
										: transcript
									: "",
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
			const log = dialog.getByRole("log");
			await expect(log.locator("p")).toHaveText(speech);
			await expect(log.locator("time")).toHaveText(["[00:00]", "[00:03]"]);
			await expect(log.getByText("说话人 1", { exact: true })).toHaveCount(1);
			await expect(log).not.toContainText(/说话人归属待确认|归属待确认：/);
			await page.screenshot({ path: info.outputPath("before-photo.png"), animations: "disabled", scale: "css" });

			await camera.click();
			const shutter = dialog.getByRole("button", { name: "拍摄照片" });
			await expect(shutter).toBeEnabled();
			await shutter.click();
			await expect(shutter).toBeEnabled();
			await dialog.getByRole("button", { name: "关闭", exact: true }).click();
			const photo = dialog.getByRole("img", { name: /录音照片/ });
			await expect(photo).toBeVisible();
			photoElapsed = await page.evaluate(
				() =>
					new Promise<number>((resolve, reject) => {
						const open = indexedDB.open("yonder-meeting-photos", 1);
						open.onerror = () => reject(open.error);
						open.onsuccess = () => {
							const db = open.result;
							const read = db.transaction("photos").objectStore("photos").getAll();
							read.onerror = () => reject(read.error);
							read.onsuccess = () => {
								db.close();
								resolve(read.result[0]?.elapsedMs ?? 0);
							};
						};
					}),
			);
			expect(photoElapsed).toBeGreaterThan(5_100);
			late = true;
			await expect(log.getByText(lateSpeech)).toBeVisible({ timeout: 12_000 });
			const photoSeconds = Math.floor(photoElapsed / 1000);
			const photoTime = `[${String(Math.floor(photoSeconds / 60)).padStart(2, "0")}:${String(photoSeconds % 60).padStart(2, "0")}]`;
			await expect(log.locator(":scope > figure").first().locator("time")).toHaveText(photoTime);
			await expect(log.locator(":scope > div, :scope > figure").nth(4)).toContainText(lateSpeech);
			const bounds = await photo.boundingBox();
			expect(bounds?.width).toBeGreaterThan(80);
			expect(bounds?.width).toBeLessThanOrEqual(200);
			expect(bounds?.height).toBeLessThanOrEqual(180);
			await dialog.locator(".meeting-transcript").evaluate((scroll) => {
				scroll.scrollTop = 0;
			});
			await page.screenshot({ path: info.outputPath("after-photo.png"), animations: "disabled", scale: "css" });

			const photoButton = log.getByRole("button", { name: /录音照片/ });
			await photoButton.click();
			const gallery = page.getByRole("dialog", { name: "本机照片" });
			await expect(gallery.getByRole("img")).toBeVisible();
			await gallery.getByRole("button", { name: "关闭", exact: true }).click();
			await expect(gallery).toHaveCount(0);
			await expect(photoButton).toBeFocused();
			await stop.click();
			await expect(dialog).toHaveCount(0);
		});
	});
}

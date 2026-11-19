import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const audioFile = resolve("e2e/fixtures/attachment-preview/audio.wav");
test.use({
	launchOptions: {
		args: [
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
			`--use-file-for-fake-audio-capture=${audioFile}`,
		],
	},
});

for (const mobile of [false, true])
	test.describe(mobile ? "mobile" : "desktop", () => {
		if (mobile)
			test.use({
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
				userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
			});
		else test.use({ viewport: { width: 1180, height: 820 } });
		test("file audio drives the recording meter", async ({ page }, testInfo) => {
			await isolateChat(page, { items: [] });
			await page.route("**/v1/meetings**", (route) => route.fulfill({ json: { items: [] } }));
			await page.goto("/messages/main");
			await page.getByRole("button", { name: "添加附件" }).click();
			await page.getByRole("button", { name: "录音笔记", exact: true }).click();
			const meter = page.getByRole("meter", { name: "麦克风音量" });
			await expect.poll(async () => Number(await meter.getAttribute("value")), { timeout: 15000 }).toBeGreaterThan(0);
			await expect
				.poll(() => page.locator(".meeting-level-bars span[data-peak]").count(), { timeout: 15000 })
				.toBeGreaterThan(0);
			await expect(page.locator(".meeting-level-bars span")).toHaveCount(6);
			await expect(page.getByRole("region", { name: "正在录音", exact: true })).toBeVisible();
			const stop = page.getByRole("button", { name: "结束录音", exact: true });
			const pause = page.getByRole("button", { name: "暂停录音", exact: true });
			await page.mouse.move(0, 0);
			const color = await pause.evaluate((button) => getComputedStyle(button).backgroundColor);
			expect(color).toBe(await stop.evaluate((button) => getComputedStyle(button).backgroundColor));
			const capsule = page.getByRole("region", { name: "正在录音", exact: true });
			const box = await capsule.boundingBox();
			const composer = await page.locator(".composer-box").boundingBox();
			if (!box || !composer) throw new Error("Recording controls and composer must be visible");
			expect(box.width).toBe(248);
			expect(box.height).toBe(40);
			expect(box.x + box.width / 2).toBeCloseTo(composer.x + composer.width / 2, 0);
			expect(composer.y - box.y - box.height).toBeCloseTo(8, 0);
			await expect(page.getByRole("status", { name: "录制时长" })).toHaveText("00:00:01");
			await page.screenshot({ path: testInfo.outputPath("recording.png") });
			await pause.click();
			await expect(page.getByRole("region", { name: "录音已暂停", exact: true })).toBeVisible();
			const recording = () =>
				page.evaluate(
					() =>
						new Promise<{ id: string; savedDurationMs: number; count: number }>((resolve, reject) => {
							const open = indexedDB.open("yonder-meeting-recorder", 1);
							open.onerror = () => reject(open.error);
							open.onsuccess = () => {
								const request = open.result.transaction("records").objectStore("records").getAll();
								request.onsuccess = () => {
									const item = request.result.find((value) => value.state === "recording");
									resolve({ id: item.id, savedDurationMs: item.savedDurationMs, count: item.segments.length });
									open.result.close();
								};
							};
						}),
				);
			const paused = await recording();
			expect(paused.savedDurationMs).toBeGreaterThan(0);
			const duration = page.getByRole("status", { name: "录制时长" });
			const before = await duration.textContent();
			await page.waitForTimeout(1500);
			await expect(duration).toHaveText(before ?? "");
			expect(await recording()).toEqual(paused);
			await expect(meter).toHaveCount(0);
			await page.screenshot({ path: testInfo.outputPath("paused.png") });
			await page.getByRole("button", { name: "继续录音", exact: true }).click();
			await expect.poll(async () => Number(await meter.getAttribute("value")), { timeout: 15000 }).toBeGreaterThan(0);
			await expect
				.poll(async () => (await recording()).savedDurationMs, { timeout: 15000 })
				.toBeGreaterThan(paused.savedDurationMs);
			const resumed = await recording();
			expect(resumed.id).toBe(paused.id);
			expect(resumed.count).toBeGreaterThan(paused.count);
			await stop.click();
			await expect(meter).toHaveCount(0);
			const ended = await page.evaluate(async (id) => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const request = indexedDB.open("yonder-meeting-recorder", 1);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				const tx = db.transaction(["records", "audio"]);
				const read = <T>(request: IDBRequest<T>) =>
					new Promise<T>((resolve, reject) => {
						request.onsuccess = () => resolve(request.result);
						request.onerror = () => reject(request.error);
					});
				const record = await read(tx.objectStore("records").get(["chat-person", id]));
				const parts = await Promise.all(
					record.segments.map((segment: { index: number }) =>
						read<Uint8Array>(tx.objectStore("audio").get(["chat-person", id, segment.index])),
					),
				);
				return {
					record,
					parts: parts.map((bytes) => ({
						length: bytes.length,
						header: String.fromCharCode(...bytes.slice(0, 4)),
						format: String.fromCharCode(...bytes.slice(8, 12)),
						nonzero: bytes.slice(44).some((value) => value !== 0),
					})),
				};
			}, paused.id);
			expect(ended.record.state, ended.record.error ?? "Normal stop saves an ended recording").toBe("ended");
			expect(ended.record.id).toBe(paused.id);
			expect(ended.record.savedDurationMs).toBe(
				ended.record.segments.reduce((sum: number, part: { durationMs: number }) => sum + part.durationMs, 0),
			);
			expect(ended.parts.length).toBeGreaterThan(paused.count);
			expect(ended.parts.slice(0, paused.count).some((part) => part.nonzero)).toBe(true);
			expect(ended.parts.slice(paused.count).some((part) => part.nonzero)).toBe(true);
			for (const [index, part] of ended.parts.entries()) {
				expect(part.header).toBe("RIFF");
				expect(part.format).toBe("WAVE");
				expect(part.length).toBe(ended.record.segments[index].byteLength);
				expect(Math.floor((part.length - 44) / 32)).toBe(ended.record.segments[index].durationMs);
			}
		});
	});

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
			const waveform = page.locator(".meeting-level-bars > span");
			await expect
				.poll(
					() =>
						waveform.evaluateAll(
							(bars) => bars.filter((bar) => Number((bar as HTMLElement).style.getPropertyValue("--level")) > 0).length,
						),
					{ timeout: 15000 },
				)
				.toBeGreaterThan(5);
			const dialog = page.getByRole("dialog", { name: "实时转写", exact: true });
			await expect(dialog).toBeVisible();
			await expect(dialog.getByRole("button", { name: "暂停录音", exact: true })).toHaveCount(0);
			await page.screenshot({ path: testInfo.outputPath("recording.png") });
			await dialog.getByRole("button", { name: "收起录音", exact: true }).click();
			const capsule = page.getByRole("region", { name: "正在录音", exact: true });
			await expect(capsule).toBeVisible();
			await expect(meter).toHaveCount(0);
			await expect
				.poll(async () => {
					const box = await capsule.boundingBox();
					const composer = await page.locator(".composer-box").boundingBox();
					return !box || !composer
						? Number.POSITIVE_INFINITY
						: Math.abs(box.x + box.width / 2 - (composer.x + composer.width / 2));
				})
				.toBeLessThan(3);
			await page.screenshot({ path: testInfo.outputPath("collapsed.png") });
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
			await expect.poll(async () => (await recording()).savedDurationMs, { timeout: 15000 }).toBeGreaterThan(0);
			const collapsed = await recording();
			await capsule.getByRole("button", { name: "展开录音", exact: true }).click();
			await expect.poll(async () => Number(await meter.getAttribute("value")), { timeout: 15000 }).toBeGreaterThan(0);
			await expect
				.poll(async () => (await recording()).savedDurationMs, { timeout: 15000 })
				.toBeGreaterThan(collapsed.savedDurationMs);
			const expanded = await recording();
			expect(expanded.id).toBe(collapsed.id);
			expect(expanded.count).toBeGreaterThan(collapsed.count);
			await dialog.getByRole("button", { name: "结束录音", exact: true }).click();
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
			}, collapsed.id);
			expect(ended.record.state, ended.record.error ?? "Normal stop saves an ended recording").toBe("ended");
			expect(ended.record.id).toBe(collapsed.id);
			expect(ended.record.savedDurationMs).toBe(
				ended.record.segments.reduce((sum: number, part: { durationMs: number }) => sum + part.durationMs, 0),
			);
			expect(ended.parts.length).toBeGreaterThan(collapsed.count);
			expect(ended.parts.slice(0, collapsed.count).some((part) => part.nonzero)).toBe(true);
			expect(ended.parts.slice(collapsed.count).some((part) => part.nonzero)).toBe(true);
			for (const [index, part] of ended.parts.entries()) {
				expect(part.header).toBe("RIFF");
				expect(part.format).toBe("WAVE");
				expect(part.length).toBe(ended.record.segments[index].byteLength);
				expect(Math.floor((part.length - 44) / 32)).toBe(ended.record.segments[index].durationMs);
			}
		});
	});

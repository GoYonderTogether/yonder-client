import { expect, test } from "@playwright/test";
import type { CreateMeetingRequest } from "@yonder/protocol";
import { conversation, isolateChat } from "./chat-fixture.ts";

test.use({
	launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("browser recording persists WAV, submits it for processing, and recovers after reload", async ({ page }) => {
	await isolateChat(page, { items: [] });
	let manifest: CreateMeetingRequest | undefined;
	let submitted = false;
	let expectedSpeakers: true | undefined = true;
	const uploaded = new Set<number>();
	await page.route("**/v1/meetings**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path === "/v1/meetings" && request.method() === "POST") {
			manifest = request.postDataJSON();
			expect(manifest?.conversationId).toBe(conversation.id);
			expect(manifest?.state).toBe("ended");
			expect(manifest?.separateSpeakers).toBe(expectedSpeakers);
		}
		const index = /\/segments\/(\d+)$/.exec(path);
		if (index) {
			const bytes = request.postDataBuffer();
			const segment = manifest?.segments[Number(index[1])];
			expect(bytes?.toString("ascii", 0, 4)).toBe("RIFF");
			expect(bytes?.toString("ascii", 8, 12)).toBe("WAVE");
			expect(bytes?.readUInt32LE(24)).toBe(16000);
			expect(bytes?.length).toBe(segment?.byteLength);
			expect(Math.floor(((bytes?.length ?? 0) - 44) / 32)).toBe(segment?.durationMs);
			if (Number(index[1]) === 0 && bytes) {
				let peak = 0;
				for (let offset = 44; offset < bytes.length; offset += 2) {
					peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
				}
				expect(peak).toBeGreaterThan(100);
			}
			uploaded.add(Number(index[1]));
		}
		if (path.endsWith("/process")) {
			expect(uploaded.size).toBe(manifest?.segments.length);
			submitted = true;
		}
		const record = manifest && {
			...manifest,
			id: "browser-meeting-qa",
			status: submitted ? "queued" : "uploading",
			segments: manifest.segments.map((segment) => ({ ...segment, uploaded: uploaded.has(segment.index) })),
			batches: [],
			transcript: "",
		};
		await route.fulfill({
			json: path === "/v1/meetings" && request.method() === "GET" ? { items: record ? [record] : [] } : record,
		});
	});
	await page.goto("/messages/main");
	const open = async () => {
		await page.getByRole("button", { name: "发起聊天" }).click();
		await page.getByRole("menuitem", { name: "会议录音" }).click();
	};
	const start = async (title: string, separateSpeakers = false) => {
		await open();
		await page.getByRole("textbox", { name: "录音标题" }).fill(title);
		await page.getByRole("button", { name: separateSpeakers ? "录音并区分发言人" : "开始录音", exact: true }).click();
		await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
	};
	const savedDuration = () =>
		page.evaluate(
			() =>
				new Promise<number>((resolve) => {
					const opening = indexedDB.open("yonder-meeting-recorder", 1);
					opening.onsuccess = () => {
						const request = opening.result.transaction("records").objectStore("records").getAll();
						request.onsuccess = () => {
							resolve(request.result.find((record) => record.state === "recording")?.savedDurationMs ?? 0);
							opening.result.close();
						};
					};
				}),
		);
	await start("Browser QA", true);
	await page.getByRole("button", { name: "任务", exact: true }).click();
	await expect.poll(savedDuration, { timeout: 10_000 }).toBeGreaterThan(3000);
	await page.getByRole("button", { name: "结束录音", exact: true }).click();
	await expect.poll(() => submitted).toBe(true);
	expect(manifest?.segments.length).toBeGreaterThanOrEqual(1);
	await page.getByRole("button", { name: "消息", exact: true }).click();
	// A second recording uses the default mode even after opting in on the first one.
	expectedSpeakers = undefined;
	submitted = false;
	uploaded.clear();
	await start("Default browser QA");
	await expect.poll(savedDuration, { timeout: 10_000 }).toBeGreaterThan(3000);
	await page.getByRole("button", { name: "结束录音", exact: true }).click();
	await expect.poll(() => submitted).toBe(true);
	await start("Interrupted browser QA");
	await expect.poll(savedDuration, { timeout: 10_000 }).toBeGreaterThan(3000);
	await page.reload();
	await open();
	await expect(page.getByRole("heading", { name: "Interrupted browser QA" })).toBeVisible();
	await expect(page.getByRole("button", { name: "播放已保存音频" })).toBeVisible();
	await expect(page.getByRole("button", { name: "结束录音", exact: true })).toHaveCount(0);
});

test.describe("mobile visibility", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
	});
	test("hiding alone keeps capture, freezing saves and interrupts", async ({ page }) => {
		await isolateChat(page, { items: [] });
		await page.route("**/v1/meetings**", (route) => route.fulfill({ json: { items: [] } }));
		await page.goto("/messages/main");
		await page.getByRole("button", { name: "添加附件" }).click();
		await page.getByRole("button", { name: "会议录音" }).click();
		await page.getByRole("button", { name: "开始录音", exact: true }).click();
		await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
		await page.evaluate(() => {
			Object.defineProperty(document, "hidden", { configurable: true, value: true });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		const current = () =>
			page.evaluate(
				() =>
					new Promise<{ state: string; savedDurationMs: number; segments: unknown[]; error: string | null }>(
						(resolve, reject) => {
							const opening = indexedDB.open("yonder-meeting-recorder", 1);
							opening.onerror = () => reject(opening.error);
							opening.onsuccess = () => {
								const request = opening.result.transaction("records").objectStore("records").getAll();
								request.onsuccess = () => {
									resolve(request.result[0]);
									opening.result.close();
								};
								request.onerror = () => reject(request.error);
							};
						},
					),
			);
		await expect.poll(async () => (await current()).savedDurationMs, { timeout: 15000 }).toBeGreaterThan(3000);
		expect((await current()).state).toBe("recording");
		await page.evaluate(() => document.dispatchEvent(new Event("freeze")));
		await expect.poll(async () => (await current()).state).toBe("interrupted");
		const interrupted = await current();
		expect(interrupted.error).toBe("page_suspended");
		expect(interrupted.segments.length).toBeGreaterThan(0);
	});
});

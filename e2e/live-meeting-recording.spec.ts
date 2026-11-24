import { devices, expect, test } from "@playwright/test";
import type { MeetingRecord, Message } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use({
	...phone,
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

test("live recording keeps audio and consecutive photos through reconnect and ends with one task", async ({
	page,
}, info) => {
	await page.addInitScript(() => {
		let locationRequests = 0;
		const blocked = () => {
			locationRequests++;
			throw new Error("Unexpected coordinate collection");
		};
		Object.defineProperties(navigator.geolocation, {
			getCurrentPosition: { value: blocked },
			watchPosition: { value: blocked },
		});
		Object.defineProperty(window, "locationRequests", { get: () => locationRequests });
	});
	const notices: Message[] = [];
	const api = await isolateChat(page, { items: notices });
	const id = "mtg-live-check";
	const recorded = new Set<number>();
	const acceptedPhotoIds = new Set<string>();
	const photoTimes = new Map<string, number>();
	let clientId = "";
	let startedAt = 0;
	let offline = false;
	let acceptedButLost = false;
	let firstRequestRejected = false;
	let releaseTranscript = false;
	let finalizations = 0;
	let finalResponse: MeetingRecord | null = null;
	const caption = "先验证断网恢复，再检查手机端的录音体验。";
	const notice = {
		...message("meeting-live-notice-08", ""),
		meeting: { id, title: "录音笔记" },
	};

	function progress() {
		return {
			meetingId: id,
			nextSegmentIndex: recorded.size,
			committedThroughSegmentIndex: releaseTranscript && recorded.size >= 2 ? recorded.size - 1 : -1,
			transcript: releaseTranscript && recorded.size >= 2 ? caption : "",
			errorCode: null,
			captureState: "recording",
			lastClientSeenAt: Date.now(),
			recording: finalResponse === null,
		};
	}
	await page.route("**/v1/meetings/**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (offline) return route.abort("internetdisconnected");
		if (url.pathname === "/v1/meetings/live") {
			const input = request.postDataJSON();
			expect(input).toMatchObject({ conversationId: conversation.id, transportMode: "live" });
			if (clientId) expect(input.clientRecordingId).toBe(clientId);
			clientId = input.clientRecordingId;
			startedAt = input.startedAt;
		}
		const segment = /\/segments\/(\d+)$/.exec(url.pathname);
		if (segment) {
			const index = Number(segment[1]);
			const audio = request.postDataBuffer();
			expect(audio?.toString("ascii", 0, 4)).toBe("RIFF");
			expect(audio?.toString("ascii", 8, 12)).toBe("WAVE");
			expect(index).toBeLessThanOrEqual(recorded.size);
			if (index === 0 && !firstRequestRejected) {
				firstRequestRejected = true;
				return route.fulfill({ status: 503, json: { error: { code: "upstream_unavailable" } } });
			}
			recorded.add(index);
			if (!acceptedButLost && index === 1) {
				acceptedButLost = true;
				return route.abort("connectionreset");
			}
		}
		const photo = /\/photos\/([^/]+)$/.exec(url.pathname);
		if (photo) {
			expect(request.headers()["content-type"]).toContain("image/jpeg");
			const elapsedMs = Number(url.searchParams.get("elapsedMs"));
			expect(elapsedMs).toBeGreaterThan(0);
			const clientPhotoId = photo[1] ?? "";
			photoTimes.set(clientPhotoId, elapsedMs);
			acceptedPhotoIds.add(clientPhotoId);
			return route.fulfill({
				json: {
					clientPhotoId,
					elapsedMs: Number(url.searchParams.get("elapsedMs")),
					byteLength: request.postDataBuffer()?.length,
				},
			});
		}
		if (url.pathname.endsWith("/finalize")) {
			const input = request.postDataJSON();
			for (const field of ["locality", "latitude", "longitude", "coordinates"]) expect(input).not.toHaveProperty(field);
			expect(input).toMatchObject({ segmentCount: recorded.size, photoCount: acceptedPhotoIds.size, state: "ended" });
			finalizations++;
			finalResponse = {
				id,
				clientRecordingId: clientId,
				conversationId: conversation.id,
				title: "录音笔记",
				sourceState: "ended",
				startedAt,
				endedAt: input.endedAt,
				durationMs: input.endedAt - startedAt,
				uploadedDurationMs: input.endedAt - startedAt,
				status: "summarizing",
				segments: [],
				batches: [],
				transcript: caption,
				summary: null,
				summaryRunId: null,
				resultMessageId: null,
				failedStage: null,
				errorCode: null,
			};
			notices.push(notice);
			const result = await route.fulfill({ json: finalResponse });
			api.create(notice);
			return result;
		}
		await route.fulfill({ json: progress() });
	});

	await page.goto("/messages/main");
	await page.getByRole("button", { name: "添加附件" }).click();
	await page.getByRole("button", { name: "录音笔记", exact: true }).click();

	const recorder = page.getByRole("dialog", { name: "实时转写" });
	await expect(recorder).toBeVisible();
	await expect(recorder.getByText("等待上传第一段录音…")).toBeVisible();
	await page.screenshot({ path: info.outputPath("00-waiting-upload.png"), animations: "disabled", scale: "css" });
	await expect(recorder.getByText("暂时无法实时转写，录音仍在继续。")).toBeVisible({ timeout: 15000 });
	await expect(recorder.getByText("音频已送达，等待转写…")).toBeVisible({ timeout: 15000 });
	await page.screenshot({
		path: info.outputPath("00-waiting-transcription.png"),
		animations: "disabled",
		scale: "css",
	});
	releaseTranscript = true;
	await expect(recorder.getByRole("button", { name: "暂停录音" })).toHaveCount(0);
	await expect(recorder.getByText(caption)).toBeVisible({ timeout: 20_000 });
	await page.screenshot({ path: info.outputPath("01-live.png"), animations: "disabled", scale: "css" });

	offline = true;
	await page.evaluate(() => {
		Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
		window.dispatchEvent(new Event("offline"));
	});
	await expect(recorder.getByText("录音继续，转写暂缓。")).toBeVisible();
	await page.screenshot({ path: info.outputPath("02-offline.png"), animations: "disabled", scale: "css" });
	await recorder.getByRole("button", { name: "拍照", exact: true }).click();
	const shutter = recorder.getByRole("button", { name: "拍摄照片" });
	await expect(shutter).toBeEnabled();
	await page.screenshot({ path: info.outputPath("03-camera.png"), animations: "disabled", scale: "css" });
	const track = await recorder.locator("video").evaluateHandle((video: HTMLVideoElement) => {
		const stream = video.srcObject as MediaStream;
		if (stream.getAudioTracks().length) throw new Error("The camera must not capture audio");
		return stream.getVideoTracks()[0];
	});
	await shutter.click();
	await expect(shutter).toBeEnabled();
	await expect(shutter).toBeVisible();
	expect(
		await recorder.locator("video").evaluate((video: HTMLVideoElement, expected) => {
			return (video.srcObject as MediaStream).getVideoTracks()[0] === expected && expected.readyState === "live";
		}, track),
	).toBe(true);
	await shutter.click();
	await expect(shutter).toBeEnabled();
	await recorder.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(recorder.getByRole("img", { name: /录音照片/ })).toHaveCount(2);
	await expect.poll(() => track.evaluate((part) => part.readyState)).toBe("ended");
	await page.screenshot({ path: info.outputPath("04-photo.png"), animations: "disabled", scale: "css" });

	await page.evaluate(() => {
		const media = navigator.mediaDevices;
		const request = media.getUserMedia.bind(media);
		media.getUserMedia = (constraints) =>
			constraints?.video
				? Promise.reject(new DOMException("Denied by fixture", "NotAllowedError"))
				: request(constraints);
	});
	await recorder.getByRole("button", { name: "拍照", exact: true }).click();
	await expect(recorder.getByText("未获得相机权限，录音仍在继续。")).toBeVisible();
	await expect(recorder.getByRole("button", { name: "拍摄照片" })).toBeDisabled();
	await page.screenshot({ path: info.outputPath("06-camera-denied.png"), animations: "disabled", scale: "css" });
	await recorder.getByRole("button", { name: "关闭", exact: true }).click();

	offline = false;
	await page.evaluate(() => {
		Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
		window.dispatchEvent(new Event("online"));
	});
	await expect.poll(() => recorded.size, { timeout: 20_000 }).toBeGreaterThan(1);
	await expect(recorder.getByText("录音继续，转写暂缓。")).toHaveCount(0, { timeout: 15_000 });
	await recorder.getByRole("button", { name: "收起录音" }).click();
	const compact = page.locator(".meeting-capsule");
	await expect(compact.getByText(caption)).toBeVisible();
	await expect(compact.getByRole("status", { name: "录制时长" })).toHaveCSS("white-space", "nowrap");
	await expect
		.poll(async () => {
			const [box, composer] = await Promise.all([compact.boundingBox(), page.locator(".composer-box").boundingBox()]);
			return box && composer ? Math.abs(box.x + box.width / 2 - (composer.x + composer.width / 2)) : Infinity;
		})
		.toBeLessThan(3);
	await page.screenshot({ path: info.outputPath("05-collapsed.png"), animations: "disabled", scale: "css" });
	await page.getByRole("button", { name: "展开录音" }).click();
	await recorder.getByRole("button", { name: "结束录音" }).click();
	await expect(page.getByRole("button", { name: "查看录音笔记 · 录音笔记" })).toHaveCount(1, { timeout: 20_000 });
	expect(finalizations).toBe(1);
	expect(await page.evaluate(() => (window as unknown as { locationRequests: number }).locationRequests)).toBe(0);
	expect(acceptedPhotoIds.size).toBe(2);
	const offsets = [...photoTimes.values()];
	expect(offsets).toHaveLength(2);
	expect(offsets[1]).toBeGreaterThanOrEqual(offsets[0]);
	expect(api.sent).toEqual([]);
});

import { expect, test, type WebSocketRoute } from "@playwright/test";
import type { StartLiveMeetingRequest } from "@yonder/protocol";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test.use({
	launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("browser recording starts live immediately, resumes a saved upload and skips submitted audio after reload", async ({
	page,
}, info) => {
	await page.addInitScript(() => {
		const request = navigator.locks.request;
		Object.defineProperty(navigator.locks, "request", {
			value: (name: string, ...args: unknown[]) => {
				if (name === "yonder-meeting-microphone") sessionStorage.setItem("meeting-lock-requested", "1");
				return Reflect.apply(request, navigator.locks, [name, ...args]);
			},
		});
	});
	await isolateChat(page, { items: [] });
	let manifest: StartLiveMeetingRequest | undefined;
	let submitted = false;
	let processingAttempts = 0;
	const uploadedByteLengths = new Map<number, number>();
	let creates = 0;
	let itemReads = 0;
	let realtime: WebSocketRoute | undefined;
	await page.route("**/v1/items**", (route) => {
		itemReads++;
		return route.fulfill({ json: { items: [] } });
	});
	await page.routeWebSocket("**/v1/realtime*", (socket) => {
		realtime = socket;
		socket.onMessage(() => undefined);
	});
	let finalizedSegments = 0;
	await page.route("**/v1/meetings/**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path === "/v1/meetings/live" && request.method() === "POST") {
			creates++;
			const next = request.postDataJSON() as StartLiveMeetingRequest;
			expect(next).toMatchObject({ conversationId: conversation.id, transportMode: "live", title: "录音笔记" });
			if (manifest) expect(next.clientRecordingId).toBe(manifest.clientRecordingId);
			manifest = next;
		}
		const index = /\/segments\/(\d+)$/.exec(path);
		if (index) {
			const part = Number(index[1]);
			const bytes = request.postDataBuffer();
			expect(bytes?.toString("ascii", 0, 4)).toBe("RIFF");
			expect(bytes?.toString("ascii", 8, 12)).toBe("WAVE");
			expect(bytes?.readUInt32LE(24)).toBe(16000);
			if (part === 0 && bytes) {
				let peak = 0;
				for (let offset = 44; offset < bytes.length; offset += 2)
					peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
				expect(peak).toBeGreaterThan(100);
			}
			uploadedByteLengths.set(part, bytes?.length ?? 0);
		}
		if (path.endsWith("/finalize")) {
			const input = request.postDataJSON();
			expect(input).toMatchObject({ segmentCount: uploadedByteLengths.size, photoCount: 0, state: "ended" });
			finalizedSegments = input.segmentCount;
			processingAttempts++;
			if (processingAttempts === 1) return await route.abort("internetdisconnected");
			submitted = true;
			return route.fulfill({ json: { id: "browser-meeting-qa", status: "queued" } });
		}
		await route.fulfill({
			json: {
				meetingId: "browser-meeting-qa",
				nextSegmentIndex: uploadedByteLengths.size,
				committedThroughSegmentIndex: -1,
				transcript: "",
				errorCode: null,
				captureState: "recording",
				lastClientSeenAt: Date.now(),
				recording: !submitted,
			},
		});
	});
	await page.goto("/messages/main");
	const start = async () => {
		await page.getByRole("button", { name: "发起聊天" }).click();
		expect(await page.evaluate(() => sessionStorage.getItem("meeting-lock-requested"))).toBeNull();
		await expect(page.getByRole("menuitem", { name: /录音/ })).toHaveCount(1);
		await page.getByRole("menuitem", { name: "录音笔记", exact: true }).click();

		await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "录音标题" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "开始录音", exact: true })).toHaveCount(0);
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
	await start();
	await expect(page.getByRole("dialog", { name: "实时转写" })).toBeVisible();
	await page.screenshot({ path: info.outputPath("default-live-recording.png"), animations: "disabled", scale: "css" });
	await page.getByRole("button", { name: "收起录音", exact: true }).click();
	await expect(page.getByRole("button", { name: "展开录音", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "任务", exact: true }).click();
	await expect(page.getByRole("button", { name: "展开录音", exact: true })).toHaveCount(0);
	await expect.poll(savedDuration, { timeout: 10_000 }).toBeGreaterThan(3000);
	await expect.poll(() => uploadedByteLengths.size).toBeGreaterThan(0);
	expect(creates).toBe(1);
	await page.getByRole("button", { name: "结束录音", exact: true }).click();
	await expect(page.locator(".meeting-capsule")).toHaveCount(0);
	await expect.poll(() => processingAttempts).toBe(1);
	await page.reload();
	await expect.poll(() => submitted).toBe(true);
	expect(finalizedSegments).toBeGreaterThanOrEqual(1);
	expect(uploadedByteLengths.size).toBe(finalizedSegments);
	const uploadKey = `yonder.meeting-live-submitted.${person.id}.${manifest?.clientRecordingId}`;
	await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), uploadKey)).toBe("1");
	const attempted = creates;
	realtime = undefined;
	await page.reload();
	await expect(page.getByRole("button", { name: "消息", exact: true })).toBeVisible();
	await expect.poll(() => Boolean(realtime)).toBe(true);
	const readsBeforeResult = itemReads;
	realtime?.send(
		JSON.stringify({
			type: "run.updated",
			eventId: "meeting-run-completed",
			at: new Date().toISOString(),
			run: { id: "task-run", conversationId: conversation.id, messageId: "", userMessageId: "", status: "completed" },
		}),
	);
	await expect.poll(() => itemReads).toBeGreaterThan(readsBeforeResult);
	await expect(page.locator(".meeting-capsule")).toHaveCount(0);
	expect(creates).toBe(attempted);
});

test.describe("mobile visibility", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
	});
	test("recording in another owned Bot chat keeps its target through suspension", async ({ page }, info) => {
		await isolateChat(page, { items: [] });
		const otherBot = { ...bot, id: "other-bot", displayName: "负责会议的 Bot", ownerId: person.id };
		const otherConversation = {
			...conversation,
			id: "other-bot-chat",
			isPrimary: false,
			members: [conversation.members[0], { ...conversation.members[1], memberId: otherBot.id }],
		};
		await page.route("**/v1/conversations", (route) =>
			route.fulfill({ json: { items: [conversation, otherConversation] } }),
		);
		await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [otherBot] } }));
		await page.goto(`/messages/${otherConversation.id}`);
		await page.getByRole("button", { name: "添加附件" }).click();
		await expect(page.getByRole("button", { name: /录音/ })).toHaveCount(1);
		await page.getByRole("button", { name: "录音笔记", exact: true }).click();

		await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
		await page.evaluate(() => {
			Object.defineProperty(document, "hidden", { configurable: true, value: true });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		const current = () =>
			page.evaluate(
				() =>
					new Promise<{
						conversationId: string;
						state: string;
						savedDurationMs: number;
						segments: unknown[];
						error: string | null;
					}>((resolve, reject) => {
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
					}),
			);
		await expect.poll(async () => (await current()).savedDurationMs, { timeout: 15000 }).toBeGreaterThan(3000);
		expect((await current()).state).toBe("recording");
		await page.evaluate(() => document.dispatchEvent(new Event("freeze")));
		await expect.poll(async () => (await current()).state).toBe("interrupted");
		const interrupted = await current();
		expect(interrupted.error).toBe("page_suspended");
		expect(interrupted.conversationId).toBe(otherConversation.id);
		await expect(page.locator(".meeting-capsule")).toHaveCount(0);
		await expect(page.getByRole("region", { name: "已中断" })).toContainText("中断期间未录音");
		await expect(page.getByRole("meter")).toHaveCount(0);
		await page.screenshot({ path: info.outputPath("interrupted-recording.png"), animations: "disabled", scale: "css" });
		expect(interrupted.segments.length).toBeGreaterThan(0);
	});
});

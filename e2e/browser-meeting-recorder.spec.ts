import { expect, test, type WebSocketRoute } from "@playwright/test";
import type { CreateMeetingRequest } from "@yonder/protocol";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test.use({
	launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("browser recording starts directly, resumes a saved upload and skips submitted audio after reload", async ({
	page,
}) => {
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
	let manifest: CreateMeetingRequest | undefined;
	let submitted = false;
	let processingAttempts = 0;
	let uploads = 0;
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
	const uploaded = new Set<number>();
	await page.route("**/v1/meetings**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path === "/v1/meetings" && request.method() === "POST") {
			creates++;
			manifest = request.postDataJSON();
			expect(manifest?.conversationId).toBe(conversation.id);
			expect(manifest?.state).toBe("ended");
			expect(manifest?.title).toBe("录音笔记");
			expect(manifest?.separateSpeakers).toBe(true);
		}
		const index = /\/segments\/(\d+)$/.exec(path);
		if (index) {
			uploads++;
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
			processingAttempts++;
			if (processingAttempts === 1) return await route.abort("internetdisconnected");
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
	await page.getByRole("button", { name: "任务", exact: true }).click();
	await expect.poll(savedDuration, { timeout: 10_000 }).toBeGreaterThan(3000);
	expect(creates).toBe(0);
	await page.getByRole("button", { name: "结束录音", exact: true }).click();
	await expect(page.locator(".meeting-capsule")).toHaveCount(0);
	await expect.poll(() => processingAttempts).toBe(1);
	await page.reload();
	await expect.poll(() => submitted).toBe(true);
	expect(manifest?.segments.length).toBeGreaterThanOrEqual(1);
	expect(uploads).toBe(uploaded.size);
	const uploadKey = `yonder.meeting-upload.${person.id}.${manifest?.clientRecordingId}`;
	await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), uploadKey)).toBe("submitted");
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
	test("recording in another owned Bot chat keeps its target through suspension", async ({ page }) => {
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
		expect(interrupted.segments.length).toBeGreaterThan(0);
	});
});

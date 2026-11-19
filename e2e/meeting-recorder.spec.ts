import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { MeetingRecording } from "@yonder/feature-meetings";
import type { CreateMeetingRequest } from "@yonder/protocol";
import { conversation, isolateChat } from "./chat-fixture.ts";

const audio = readFileSync("e2e/fixtures/attachment-preview/audio.wav");

// Mock-native validates app-to-plugin wiring without opening a physical microphone.
for (const mobile of [false, true]) {
	test.describe(mobile ? "mock-native mobile recorder" : "mock-native desktop recorder", () => {
		test.use({
			viewport: { width: mobile ? 390 : 1180, height: mobile ? 844 : 820 },
			...(mobile
				? {
						isMobile: true,
						hasTouch: true,
						userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
					}
				: {}),
		});
		test("starts from the chat menu and stays available across app navigation", async ({ page }) => {
			await isolateChat(page, { items: [] });
			let manifest: CreateMeetingRequest | undefined;
			let submitted = false;
			await page.route("**/v1/meetings**", async (route) => {
				const request = route.request();
				const path = new URL(request.url()).pathname;
				if (path === "/v1/meetings" && request.method() === "POST") manifest = request.postDataJSON();
				if (path.endsWith("/segments/0")) expect(request.postDataBuffer()).toEqual(audio);
				if (path.endsWith("/process")) submitted = true;
				await route.fulfill({
					json: {
						id: "native-meeting",
						status: submitted ? "queued" : "uploading",
						segments: manifest?.segments ?? [],
					},
				});
			});
			await page.goto("/messages/main");
			await expect(page.getByRole("button", { name: "语音输入", exact: true })).toBeVisible();
			await page.evaluate(
				(audio) => {
					const owner = "chat-person";
					let activeId: string | null = null;
					let paused = false;
					const interrupted: MeetingRecording = {
						id: "recovered-recording",
						ownerId: owner,
						title: "中断后保留的会议录音",
						conversationId: "chat-route-check",
						state: "interrupted",
						startedAt: Date.now() - 600_000,
						endedAt: Date.now() - 500_000,
						durationMs: 96_000,
						savedDurationMs: 96_000,
						sampleRate: 16000,
						channels: 1,
						segments: [{ index: 0, durationMs: 4000, byteLength: audio.length }],
						error: null,
					};
					const recordings = [interrupted];
					const calls: string[] = [];
					const state = () => ({
						supported: true,
						activeId,
						pauseSupported: true,
						paused,
						recordings: structuredClone(recordings),
					});
					Object.assign(window, {
						__meetingRecorderCalls: calls,
						__TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
						__TAURI_INTERNALS__: {
							metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
							transformCallback: () => 1,
							unregisterCallback() {},
							invoke: async (command: string, args: Record<string, unknown>) => {
								if (!command.startsWith("plugin:meeting-recorder|")) return null;
								const action = command.split("|")[1] ?? "";
								calls.push(action);
								if (action === "get_upload_jobs") return [];
								if (action === "configure_upload") return null;
								if (action === "read_audio") return audio;
								if (action === "pause") paused = true;
								if (action === "resume") paused = false;
								if (action === "start") {
									activeId = "new-recording";
									recordings.unshift({
										...interrupted,
										id: activeId,
										title: String(args.title),
										conversationId: String(args.conversationId),
										separateSpeakers: args.separateSpeakers === true,
										state: "recording",
										startedAt: Date.now(),
										endedAt: 0,
										durationMs: 12_000,
										savedDurationMs: 8_000,
									});
								}
								if (action === "stop") {
									const item = recordings.find((item) => item.id === activeId);
									if (item) {
										item.state = "ended";
										item.endedAt = Date.now();
									}
									activeId = null;
								}
								return state();
							},
						},
					});
				},
				[...audio],
			);
			const openRecorder = async () => {
				await page.getByRole("button", { name: "发起聊天" }).click();
				await page.getByRole("menuitem", { name: "录音笔记", exact: true }).click();
			};
			if (mobile) await page.getByRole("button", { name: "消息", exact: true }).click();
			await openRecorder();
			const stop = page.getByRole("button", { name: "结束录音", exact: true });
			await expect(stop).toBeVisible();
			await expect(page.getByRole("status", { name: "录制时长" })).toHaveText("00:00:12");
			await expect(page.getByRole("dialog")).toHaveCount(0);
			await expect(page.getByRole("textbox", { name: "录音标题" })).toHaveCount(0);
			await openRecorder();
			await expect(stop).toBeVisible();
			if (mobile)
				await page
					.getByRole("navigation", { name: "主导航" })
					.getByRole("button", { name: "界面验收 BOT", exact: true })
					.click();
			await expect(page.getByRole("button", { name: "语音输入", exact: true })).toBeDisabled();
			await page.getByRole("button", { name: "任务", exact: true }).click();
			await expect(page).toHaveURL(/\/tasks$/);
			await expect(stop).toBeVisible();
			const meButton = mobile
				? page.getByRole("complementary").getByRole("button", { name: "我", exact: true })
				: page.getByRole("button", { name: "我", exact: true });
			await meButton.click();
			await expect(page).toHaveURL(/\/me(?:\/|$)/);
			await expect(stop).toBeVisible();
			await page.getByRole("button", { name: "暂停录音", exact: true }).click();
			await page.getByRole("button", { name: "继续录音", exact: true }).click();
			expect(manifest).toBeUndefined();
			expect(
				await page.evaluate(() =>
					(window as unknown as { __meetingRecorderCalls: string[] }).__meetingRecorderCalls.filter(
						(command) => command === "start" || command === "stop",
					),
				),
			).toEqual(["start"]);
			await stop.click();
			await expect(page.locator(".meeting-capsule")).toHaveCount(0);
			if (mobile) {
				await expect.poll(() => submitted).toBe(true);
				expect(manifest).toMatchObject({
					clientRecordingId: "new-recording",
					conversationId: conversation.id,
					title: "录音笔记",
					separateSpeakers: true,
					state: "ended",
				});
			}
		});
	});
}

import { expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

// Mock-native validates UI/lifecycle wiring only. It never opens a physical microphone.
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
		test("recording is independent of short voice input and survives collapsing its capsule", async ({
			page,
		}, info) => {
			await isolateChat(page, { items: [] });
			await page.route("**/v1/meetings**", (route) => route.fulfill({ json: { items: [] } }));
			await page.goto("/messages/main");
			await expect(page.getByRole("button", { name: "语音输入", exact: true })).toBeVisible();
			await page.evaluate(() => {
				const owner = "chat-person";
				let activeId: string | null = null;
				const recordings = [
					{
						id: "recovered-recording",
						ownerId: owner,
						title: "中断后保留的会议录音",
						state: "interrupted",
						startedAt: Date.now() - 600_000,
						endedAt: Date.now() - 500_000,
						durationMs: 96_000,
						savedDurationMs: 96_000,
						sampleRate: 16000,
						channels: 1,
						segments: [{ index: 0, durationMs: 4000, byteLength: 128044 }],
						error: null,
					},
				];
				const calls: string[] = [];
				const state = () => ({ supported: true, activeId, recordings: structuredClone(recordings) });
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
							if (action === "start") {
								activeId = "new-recording";
								recordings.unshift({
									...recordings[0],
									id: activeId,
									title: String(args.title),
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
			});
			async function openRecorder() {
				if (mobile) await page.getByRole("button", { name: "返回", exact: true }).click();
				await page.getByRole("button", { name: "发起聊天" }).click();
				await page.getByRole("menuitem", { name: "会议录音" }).click();
			}
			await openRecorder();
			await expect(page.getByRole("heading", { name: "中断后保留的会议录音", exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "播放已保存音频" })).toBeVisible();
			await page.getByRole("textbox", { name: "录音标题" }).fill("产品讨论会议");
			await page.getByRole("button", { name: "开始录音", exact: true }).click();
			await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
			await expect(page.getByRole("status", { name: "录制时长" })).toHaveText("00:00:12");
			await page.screenshot({
				path: info.outputPath(mobile ? "mock-native-mobile-expanded.png" : "mock-native-desktop-expanded.png"),
			});
			await expect(page.getByRole("dialog")).toHaveCount(0);
			await page.locator(".meeting-capsule-toggle:visible").click();
			await expect(page.getByRole("button", { name: "结束录音", exact: true })).toBeVisible();
			await expect(page.locator(".meeting-capsule:visible")).toContainText("正在录音");
			await page.screenshot({
				path: info.outputPath(mobile ? "mock-native-mobile-collapsed.png" : "mock-native-desktop-collapsed.png"),
			});
			if (mobile) await expect(page).toHaveURL(/\/messages\/main$/);
			await expect(page.getByRole("button", { name: "语音输入", exact: true })).toBeDisabled();
			if (mobile) await page.getByRole("button", { name: "返回", exact: true }).click();
			await page.getByRole("button", { name: "任务", exact: true }).click();
			await expect(page.locator(".meeting-capsule:visible")).toHaveCount(1);
			await expect(page.locator(".meeting-capsule:visible")).toContainText("正在录音");
			expect(
				await page.evaluate(() =>
					(window as unknown as { __meetingRecorderCalls: string[] }).__meetingRecorderCalls.filter(
						(command) => command === "stop",
					),
				),
			).toEqual([]);
			await page.locator(".meeting-capsule-toggle:visible").click();
			await page.getByRole("button", { name: "结束录音", exact: true }).click();
			await expect(page.getByText("已保存", { exact: true })).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		});
	});
}

import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { conversation, isolateChat } from "./chat-fixture.ts";

test("dictation retains the selection and shows a stop control", async ({ page }, testInfo) => {
	const api = await isolateChat(page);
	await page.routeWebSocket("**/v1/audio/transcriptions/realtime*", (socket) => {
		let sessionId: string;
		let hasAudio = false;
		socket.onMessage((data) => {
			if (typeof data !== "string") {
				if (!hasAudio && data.byteLength > 0) {
					hasAudio = true;
					socket.send(JSON.stringify({ type: "transcript", sessionId, sentenceId: 1, text: "你好" }));
				}
				return;
			}
			const value = JSON.parse(data);
			if (value.type === "start") {
				sessionId = value.sessionId;
				socket.send(JSON.stringify({ type: "ready", sessionId }));
			}
			if (value.type === "finish") {
				socket.send(JSON.stringify({ type: "transcript", sessionId, sentenceId: 1, text: "你好，世界", final: true }));
				socket.send(JSON.stringify({ type: "done", sessionId }));
			}
		});
	});
	await page.addInitScript(() => {
		Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
			value: async () => {
				const context = new AudioContext();
				const source = context.createOscillator();
				const destination = context.createMediaStreamDestination();
				source.connect(destination);
				source.start();
				return destination.stream;
			},
		});
	});
	await page.goto(`/messages/${conversation.id}`);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.fill("前旧后");
	await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(1, 2));
	await mkdir(testInfo.outputPath("previews"), { recursive: true });
	await page.screenshot({ path: testInfo.outputPath("previews/voice-before.png"), animations: "disabled" });
	await page.getByRole("button", { name: "语音输入" }).click();
	await expect(page.getByRole("button", { name: "停止录音" })).toBeVisible();
	await expect(input).toHaveValue("前你好后");
	await expect(input).toHaveJSProperty("selectionStart", 3);
	await expect(input).toHaveJSProperty("selectionEnd", 3);
	await expect(page.locator(".composer-voice-status")).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("previews/voice-listening.png"), animations: "disabled" });
	await page.getByRole("button", { name: "停止录音" }).click();
	await expect(page.getByRole("button", { name: "语音输入" })).toBeVisible();
	await expect(input).toHaveValue("前你好，世界后");
	expect(api.sent).toEqual([]);
});

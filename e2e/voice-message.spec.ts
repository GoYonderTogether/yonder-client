import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Attachment } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const sample = readFileSync(new URL("./fixtures/attachment-preview/audio.wav", import.meta.url));
const audio: Attachment = {
	id: "voice-received",
	kind: "audio",
	name: "voice.wav",
	mimeType: "audio/wav",
	size: sample.length,
};
const friend = {
	...conversation,
	id: "voice-friend",
	isPrimary: false,
	members: [
		conversation.members[0],
		{ ...conversation.members[1], memberId: "voice-friend-member", kind: "person" as const, displayName: "验收好友" },
	],
};

test("desktop history shows inline audio for both senders and can retry a failed download", async ({ page }, info) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const items = [
		{
			...message("message-01", "我到了，你听一下这段。"),
			senderId: "voice-friend-member",
			senderKind: "person" as const,
		},
		{
			...message("message-02", ""),
			senderId: "voice-friend-member",
			senderKind: "person" as const,
			attachments: [audio],
			voice: { durationMs: 1000 },
		},
		{
			...message("message-03", "", true),
			attachments: [{ ...audio, id: "voice-sent" }],
			voice: { durationMs: 1000 },
		},
		{
			...message("message-04", "", true),
			attachments: [{ ...audio, id: "manual-audio", name: "手动上传.wav" }],
		},
	].map((entry) => ({ ...entry, conversationId: friend.id }));
	await isolateChat(page, { items });
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, friend] } }));

	const requests: string[] = [];
	await page.route("**/v1/attachments/*/content", async (route) => {
		const [, id] = new URL(route.request().url()).pathname.match(/([^/]+)\/content$/) ?? [];
		expect(route.request().headers().authorization).toBe("Bearer isolated-chat-ui");
		requests.push(id);
		if (requests.length === 1) await route.fulfill({ status: 503, json: { error: "temporary failure" } });
		else await route.fulfill({ body: sample, contentType: audio.mimeType });
	});
	await page.goto(`/messages/${friend.id}`);
	const receive = page.locator('[data-message-id="message-02"]');
	const send = page.locator('[data-message-id="message-03"]');
	const receivedVoice = receive.getByRole("button", { name: /^播放语音/ });
	const sentVoice = send.getByRole("button", { name: /^播放语音/ });
	await expect(receivedVoice).toHaveClass(/message-bubble-incoming/);
	await expect(sentVoice).toHaveClass(/message-bubble-outgoing/);
	await expect(page.getByRole("button", { name: "打开 手动上传.wav" })).toBeVisible();
	await expect(page.getByRole("button", { name: "打开 voice.wav" })).toHaveCount(0);
	expect(requests).toEqual([]);
	await page.screenshot({ path: info.outputPath("desktop-friend-voice.png"), scale: "css" });

	await receivedVoice.click();
	const retry = receive.getByRole("button", { name: /^语音播放失败，点击重试/ });
	await expect(retry).toBeVisible();
	await retry.click();
	await expect(receive.getByRole("button", { name: /^暂停语音/ })).toBeVisible();
	await sentVoice.click();
	await expect(receive.getByRole("button", { name: /^播放语音/ })).toHaveAttribute("data-voice-state", "idle");
	await expect(send.getByRole("button", { name: /^暂停语音/ })).toBeVisible();
	expect(requests).toEqual(["voice-received", "voice-received", "voice-sent"]);
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

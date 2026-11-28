import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, type Page, test } from "@playwright/test";
import type { Attachment, MeetingRecord } from "@yonder/protocol";
import { pcm16WavHeader } from "../apps/web/src/lib/browser-meeting-wav.ts";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

function wav(durationMs: number) {
	const samples = Buffer.alloc(durationMs * 32);
	return Buffer.concat([pcm16WavHeader(samples.length), samples]);
}

const clip = wav(350);
const partDuration = 8_000;
const meetingPart = wav(partDuration);
const text = "这是可以离线再次打开的附件。";
const report = Buffer.from(text);
const file: Attachment = {
	id: "file",
	kind: "file",
	name: "缓存报告.txt",
	mimeType: "text/plain",
	size: report.length,
};
const voice: Attachment[] = [0, 1].map((index) => ({
	id: `voice-${index}`,
	kind: "audio",
	name: `语音-${index}.wav`,
	mimeType: "audio/wav",
	size: clip.length,
}));
const recording: MeetingRecord = {
	id: "media-recording",
	clientRecordingId: "remote-only-recording",
	conversationId: conversation.id,
	title: "分段缓存验收",
	sourceState: "ended",
	startedAt: Date.parse("2026-11-15T00:00:00Z"),
	endedAt: Date.parse("2026-11-15T00:00:24Z"),
	durationMs: 24_000,
	uploadedDurationMs: 24_000,
	status: "completed",
	audioRetained: true,
	segments: [0, 1, 2].map((index) => ({
		index,
		durationMs: partDuration,
		byteLength: meetingPart.length,
		uploaded: true,
	})),
	batches: [],
	transcript: "",
	progress: { completedBatches: 0, totalBatches: 0, recognizedDurationMs: 0, percent: 0 },
	summary: null,
	summaryRunId: null,
	resultMessageId: null,
	failedStage: null,
	errorCode: null,
};

test("files, both voice clips and only needed meeting chunks survive refresh and a browser restart", async ({
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL) throw new Error("The client server URL is missing");
	const wordBytes = await readFile(new URL("./fixtures/attachment-preview.doc", import.meta.url));
	const word: Attachment = {
		id: "word",
		kind: "file",
		name: "旧版报告.doc",
		mimeType: "application/msword",
		size: wordBytes.length,
	};
	const profile = await mkdtemp(join(tmpdir(), "yonder-binary-cache-"));
	const origin = "https://private-media-fixture.test";
	const requests: string[] = [];
	const boot = async () => {
		const context = await chromium.launchPersistentContext(profile, {
			baseURL,
			channel: "chromium",
			serviceWorkers: "block",
			viewport: { width: 1440, height: 1000 },
		});
		try {
			const page = context.pages()[0] ?? (await context.newPage());
			await isolateChat(page, {
				items: [
					{ ...message("binary-file-01", ""), attachments: [file, word] },
					{ ...message("binary-voice-02", ""), attachments: voice, voice: { durationMs: 700 } },
					{ ...message("binary-recording-03", null), meeting: { id: recording.id, title: recording.title } },
				],
			});
			await page.route(`**/v1/meetings/${recording.id}`, (route) => route.fulfill({ json: recording }));
			await page.route(/\/v1\/(?:attachments\/[^/]+|meetings\/[^/]+\/segments\/\d+)\/download(?:\?|$)/, (route) => {
				const url = new URL(route.request().url());
				const id = url.pathname.split("/").at(-2);
				const resource = url.pathname.includes("/segments/") ? `segment-${id}` : id;
				if (!resource) throw new Error("Missing resource");
				if (!url.pathname.includes("/segments/")) expect(url.searchParams.get("variant")).toBe("original");
				expect(route.request().headers().authorization).toBeTruthy();
				requests.push(`sign:${resource}`);
				return route.fulfill({ json: { url: `${origin}/${resource}` } });
			});
			await page.route(/\/v1\/(?:attachments\/[^/]+|meetings\/[^/]+\/segments\/\d+)\/(?:content|preview)$/, (route) => {
				requests.push("business-content");
				return route.abort();
			});
			await page.route(`${origin}/*`, (route) => {
				const name = new URL(route.request().url()).pathname.slice(1);
				requests.push(`object:${name}`);
				expect(route.request().headers().authorization).toBeUndefined();
				return route.fulfill({
					headers: { "Access-Control-Allow-Origin": new URL(baseURL).origin, "Cache-Control": "no-store" },
					contentType: name === "file" ? "text/plain" : name === "word" ? word.mimeType : "audio/vnd.wave",
					body:
						name === "file" ? report : name === "word" ? wordBytes : name.startsWith("segment-") ? meetingPart : clip,
				});
			});
			return { context, page };
		} catch (error) {
			await context.close();
			throw error;
		}
	};
	const reopen = async (page: Page, cold: boolean) => {
		await page.locator('[data-attachment-id="file"] button').click();
		await expect(page.getByText(text, { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "关闭全部", exact: true }).click();
		await page.locator('[data-attachment-id="word"] button').click();
		await expect(page.locator(".attachment-text-content")).toContainText("真实 Word 二进制解析");
		await expect(page.locator(".attachment-text-content")).toContainText("Hello DOC preview.");
		await page.getByRole("button", { name: "关闭全部", exact: true }).click();
		const shortVoice = page.locator("[data-voice-state]");
		await shortVoice.click();
		await expect(shortVoice).toHaveAttribute("data-voice-state", "playing");
		await expect(shortVoice).toHaveAttribute("data-voice-state", "idle");

		await page.getByRole("button", { name: `查看录音笔记 · ${recording.title}` }).click();
		const meetingAudio = page.locator(".recording-audio");
		await meetingAudio.locator("button").click();
		const seek = meetingAudio.locator("input[type=range]");
		await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(500);
		await meetingAudio.locator("button").click();
		await page.getByRole("button", { name: "关闭全部", exact: true }).click();

		const used = ["file", "word", "voice-0", "voice-1", "segment-0", "segment-1"];
		expect(requests).toEqual(cold ? used.flatMap((name) => [`sign:${name}`, `object:${name}`]) : []);
		requests.length = 0;
	};
	try {
		const first = await boot();
		try {
			await first.page.goto("/messages/main");
			await reopen(first.page, true);
			await first.page.reload();
			await reopen(first.page, false);
			await first.page.goto("/memory/timeline");
			await first.page.goto("/messages/main");
			await reopen(first.page, false);
		} finally {
			await first.context.close();
		}
		const restarted = await boot();
		try {
			await restarted.page.goto("/messages/main");
			await reopen(restarted.page, false);
		} finally {
			await restarted.context.close();
		}
	} finally {
		await rm(profile, { recursive: true, force: true });
	}
});

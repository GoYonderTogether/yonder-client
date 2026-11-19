import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devices, expect, type Page, test } from "@playwright/test";
import type { Attachment } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const fixtures = fileURLToPath(new URL("./fixtures/attachment-preview/", import.meta.url));
const evidence = process.env.YONDER_E2E_EVIDENCE_DIR ?? "test-results/evidence/attachment-cards-20261116";
const files = new Map([
	["note.txt", { mime: "text/plain", bytes: Buffer.from("这是发送前的文档缩略内容。\n".repeat(30)) }],
	["chinese.pdf", { mime: "application/pdf", bytes: readFileSync(`${fixtures}/chinese.pdf`) }],
	[
		"document.docx",
		{
			mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			bytes: readFileSync(`${fixtures}/document.docx`),
		},
	],
	["video.mp4", { mime: "video/mp4", bytes: readFileSync(`${fixtures}/video.mp4`) }],
]);

function attachment(name: string): Attachment {
	const file = files.get(name);
	if (!file) throw new Error(name);
	return { id: name, name, mimeType: file.mime, size: file.bytes.length, kind: "file" };
}

async function setup(page: Page) {
	const items = [
		message("message-01", "把这两份文件放在同一组消息里。", true),
		{ ...message("message-02", "", true), attachments: [attachment("note.txt"), attachment("chinese.pdf")] },
		message("message-04", "收到，文档与视频也沿用相同的对齐。"),
		{ ...message("message-05", ""), attachments: [attachment("document.docx")] },
		{ ...message("message-06", ""), attachments: [attachment("video.mp4")] },
	];
	await isolateChat(page, { items });
	const contentRequests: string[] = [];
	await page.route("**/v1/attachments/*/content", async (route) => {
		const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
		const file = files.get(id);
		if (!file) throw new Error(id);
		contentRequests.push(id);
		await route.fulfill({ status: 200, contentType: file.mime, body: file.bytes });
	});
	return contentRequests;
}

async function warmVideo(page: Page, requests: string[]) {
	expect(requests).not.toContain("video.mp4");
	expect(requests).not.toContain("note.txt");
	await page.getByRole("button", { name: "打开 video.mp4", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "预览 video.mp4" })).toBeVisible();
	await expect
		.poll(() => page.locator(".attachment-media-reader video").evaluate((video: HTMLVideoElement) => video.readyState))
		.toBeGreaterThanOrEqual(2);
	await page.locator(".attachment-reader-header").getByRole("button", { name: "关闭预览", exact: true }).click();
	await expect(page.locator(".attachment-preview-layer")).toHaveCount(0);
	expect(requests.filter((name) => name === "video.mp4")).toHaveLength(1);
}

async function assertCards(page: Page) {
	const log = page.getByRole("log");
	await expect(log).toBeVisible();
	await expect(log.locator("[data-message-run]")).toHaveCount(2);
	await expect(log.locator("[data-message-sender-avatar]")).toHaveCount(0);
	await expect(log.locator("[data-message-sender-header]")).toHaveCount(0);
	await expect(log.locator(".message-attachment pre")).toHaveCount(0);
	await expect(log.getByRole("button", { name: /^下载 / })).toHaveCount(0);
	for (const name of ["note.txt", "chinese.pdf", "document.docx"]) {
		const card = log.getByRole("button", { name: `打开 ${name}`, exact: true });
		await expect(card).toBeVisible();
		const size = await card.boundingBox();
		expect(size?.height).toBeLessThanOrEqual(100);
	}
	const batch = page.locator('[data-message-id="message-02"] .message-attachment-open');
	await expect(batch).toHaveCount(2);
	const first = await batch.nth(0).boundingBox();
	const second = await batch.nth(1).boundingBox();
	if (!first || !second) throw new Error("Missing batch file geometry");
	expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
	// The list pane enters on a spring, and a pointer read during it lands in the pane's moving frame.
	// Both edges are therefore viewport coordinates; read them again until the pane has settled.
	await expect
		.poll(
			async () => {
				const [a, b] = await Promise.all([batch.nth(0).boundingBox(), batch.nth(1).boundingBox()]);
				return Math.abs((b?.x ?? 0) + (b?.width ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0)));
			},
			{ timeout: 3000 },
		)
		.toBeLessThan(0.5);
	const alignment = await log.evaluate((element) => {
		const self = [...element.querySelectorAll('[data-message-run][data-run-sender="self"] article')];
		const other = [...element.querySelectorAll('[data-message-run][data-run-sender="other"] article')];
		const edges = (entries: Element[], side: "left" | "right") =>
			entries.map((entry) => entry.firstElementChild?.getBoundingClientRect()[side] ?? 0);
		return { self: edges(self, "right"), other: edges(other, "left") };
	});
	for (const values of [alignment.self, alignment.other])
		expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
}

async function assertVideoFrame(page: Page, selector: string) {
	const image = page.locator(selector);
	await expect(image).toBeVisible();
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
	const pixel = await image.evaluate((el: HTMLImageElement) => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("No canvas");
		context.drawImage(el, 0, 0, 1, 1);
		return [...context.getImageData(0, 0, 1, 1).data];
	});
	// The real fixture contains a blue frame. A generic film icon or blank tile cannot pass.
	expect(pixel[2]).toBeGreaterThan(150);
	expect(pixel[0]).toBeLessThan(100);
}

async function draft(page: Page, device: string) {
	await page
		.getByLabel("上传文件", { exact: true })
		.setInputFiles([...files].map(([name, file]) => ({ name, mimeType: file.mime, buffer: file.bytes })));
	await expect(page.locator(".composer-file")).toHaveCount(4);
	const text = page.locator('[data-attachment-name="note.txt"] .composer-file-preview');
	await expect(text).toContainText("文档缩略内容");
	const docx = page.locator('[data-attachment-name="document.docx"] pre');
	await expect(docx).toContainText("中文");
	await expect(docx).toHaveCSS("position", "absolute");
	await expect(docx).toHaveCSS("border-width", "0px");
	expect(await docx.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe("none");
	const pdf = page.locator('[data-attachment-name="chinese.pdf"] img');
	await expect.poll(() => pdf.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
	expect(await pdf.evaluate((element) => getComputedStyle(element).maskImage)).not.toBe("none");
	expect(
		await pdf.evaluate((element: HTMLImageElement) => {
			const canvas = document.createElement("canvas");
			canvas.width = element.naturalWidth;
			canvas.height = element.naturalHeight;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("No PDF thumbnail canvas");
			context.drawImage(element, 0, 0);
			const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
			return data.some((value, index) => index % 4 !== 3 && value < 180);
		}),
	).toBe(true);
	for (const name of files.keys())
		await expect(page.getByRole("button", { name: `移除 ${name}`, exact: true })).toBeEnabled();
	const mask = await text.evaluate((element) => {
		const entries = [element, ...element.querySelectorAll("*")];
		return entries.some((entry) => getComputedStyle(entry).maskImage !== "none");
	});
	expect(mask).toBe(true);
	await assertVideoFrame(page, '[data-attachment-name="video.mp4"] .composer-file-preview img');
	await page.screenshot({ scale: "css", path: `${evidence}/${device}-draft-cards.png` });
	if (device === "mobile") {
		await page.locator(".composer-files").evaluate((element) => {
			element.scrollLeft = element.scrollWidth;
		});
		// The main Bot page floats its header (avatar, status line, settings) instead of a top bar.
		const header = await page.locator('[data-page-layer="detail"] [data-frame-header]').boundingBox();
		expect(header).not.toBeNull();
		expect(header?.x).toBeGreaterThanOrEqual(0);
		await page.screenshot({ scale: "css", path: `${evidence}/mobile-draft-video.png` });
	}
	await page.getByRole("button", { name: "预览 note.txt", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "预览 note.txt" })).toBeVisible();
	await expect(page.locator(".attachment-text-content")).toContainText("文档缩略内容");
	await page.locator(".attachment-reader-header").getByRole("button", { name: "关闭预览", exact: true }).click();
	await expect(page.locator(".composer-file")).toHaveCount(4);
}

test("desktop continuous cards share message alignment; drafts are masked and video has a real first frame", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const requests = await setup(page);
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.locator('[data-layout-mode="wide"]')).toBeVisible();
	await assertCards(page);
	await warmVideo(page, requests);
	await assertVideoFrame(page, '[data-message-id="message-06"] .message-attachment img');
	await page.screenshot({ scale: "css", path: `${evidence}/desktop-sent-cards.png` });
	await draft(page, "desktop");
});

test("real phone context has bottom tabs, functional navigation and the existing detail back flow", async ({
	browser,
	baseURL,
}) => {
	const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, baseURL });
	const page = await context.newPage();
	try {
		const requests = await setup(page);
		await page.goto("/messages");
		await expect(page.locator('[data-layout-mode="mobile"]')).toBeVisible();
		expect(await page.evaluate(() => navigator.userAgent)).toMatch(/iPhone/);
		expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
		mkdirSync(evidence, { recursive: true });
		writeFileSync(
			`${evidence}/mobile-context.json`,
			JSON.stringify(
				await page.evaluate(() => ({
					userAgent: navigator.userAgent,
					maxTouchPoints: navigator.maxTouchPoints,
					width: innerWidth,
					height: innerHeight,
					devicePixelRatio,
					layout: document.querySelector("[data-layout-mode]")?.getAttribute("data-layout-mode"),
				})),
				null,
				2,
			),
		);
		const dock = page.locator("[data-mobile-dock]");
		await expect(dock.getByRole("navigation")).toBeVisible();
		await expect(page.getByRole("navigation")).toHaveCount(1);
		const bounds = await dock.getByRole("navigation").boundingBox();
		const height = await page.evaluate(() => innerHeight);
		if (!bounds) throw new Error("Missing phone tabs");
		expect(bounds.y).toBeGreaterThanOrEqual(height - 100);
		expect(bounds.y + bounds.height).toBeCloseTo(height, 0);
		for (const [label, path] of [
			["任务", "/tasks"],
			["记忆", "/memory"],
			["消息", "/messages"],
		]) {
			await dock.getByRole("button", { name: label, exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(dock.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
		}
		await page.screenshot({ scale: "css", path: `${evidence}/mobile-list-bottom-tabs.png` });
		await dock.getByRole("button", { name: "界面验收 BOT", exact: true }).click();
		await expect(page).toHaveURL(/\/messages\/main$/);
		await expect(dock.getByRole("navigation")).toBeVisible();
		await assertCards(page);
		await warmVideo(page, requests);
		await assertVideoFrame(page, '[data-message-id="message-06"] .message-attachment img');
		await page.screenshot({ scale: "css", path: `${evidence}/mobile-sent-cards.png` });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await draft(page, "mobile");
		await dock.getByRole("button", { name: "消息", exact: true }).click();
		await expect(page).toHaveURL(/\/messages$/);
		await expect(dock.getByRole("navigation")).toBeVisible();
	} finally {
		await context.close();
	}
});

test("compact sent cards still open real DOCX and PDF readers and video playback", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await setup(page);
	await page.goto(`/messages/${conversation.id}`);
	for (const name of ["document.docx", "chinese.pdf", "video.mp4"]) {
		await page.getByRole("button", { name: `打开 ${name}`, exact: true }).click();
		await expect(page.getByRole("dialog", { name: `预览 ${name}` })).toBeVisible();
		if (name.endsWith("docx")) await expect(page.locator(".attachment-document-content table")).toBeVisible();
		else if (name.endsWith("pdf"))
			await expect(page.locator('[data-pdf-page="1"] .textLayer')).toContainText("附件阅读验收");
		else {
			const video = page.locator(".attachment-media-reader video");
			await expect
				.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
				.toBeGreaterThanOrEqual(2);
			await video.evaluate(async (element: HTMLVideoElement) => {
				element.loop = true;
				element.currentTime = 0;
				(window as unknown as { cardVideo: HTMLVideoElement }).cardVideo = element;
				await element.play();
			});
			await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
		}
		await page.locator(".attachment-reader-header").getByRole("button", { name: "关闭预览", exact: true }).click();
		await expect(page.locator(".attachment-preview-layer")).toHaveCount(0);
		if (name.endsWith("mp4"))
			expect(await page.evaluate(() => (window as unknown as { cardVideo: HTMLVideoElement }).cardVideo.paused)).toBe(
				true,
			);
	}
});

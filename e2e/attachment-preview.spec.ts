import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { Attachment } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const fixtures = fileURLToPath(new URL("./fixtures/attachment-preview/", import.meta.url));
const evidence = process.env.YONDER_E2E_EVIDENCE_DIR ?? "test-results/evidence/attachment-preview-20261115";
const samples = [
	["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
	["chinese.pdf", "application/pdf"],
	["photo.heic", "image/heic"],
	["audio.wav", "audio/wav"],
	["video.mp4", "video/mp4"],
] as const;
async function setup(page: Page) {
	const files = new Map(samples.map(([name, mime]) => [name, { mime, bytes: readFileSync(`${fixtures}/${name}`) }]));
	files.set("note.txt", { mime: "text/plain", bytes: Buffer.from("文档开头的中文内容。\n".repeat(800)) });
	files.set("发布安排.md", {
		mime: "text/markdown",
		bytes: Buffer.from(
			"# 发布安排\n\n周四前完成登录页验收，周五整理手机端回归结果。\n\n## 交付清单\n\n- 更新登录页动效。\n- 核对 iOS 和 Android 的返回路径。\n- 整理验收截图，附到任务记录。",
		),
	});
	files.set("notes.md", {
		mime: "text/markdown",
		bytes: Buffer.from(
			"# 阅读标题\n\n**中文加粗**\n\n| 名称 | 内容 |\n| --- | --- |\n| 文件 | 正文 |\n\n<script>alert(1)</script>\n![blocked](https://external.invalid/track)",
		),
	});
	files.set("diagram.svg", {
		mime: "image/svg+xml",
		bytes: Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="teal"/><text x="20" y="80" fill="white">SVG Image</text><script>parent.svgExecuted=true</script></svg>',
		),
	});
	files.set("broken.mp4", { mime: "video/mp4", bytes: Buffer.from("not a media container") });
	const attachments: Attachment[] = [...files].map(([name, { mime, bytes }]) => ({
		id: name,
		name,
		mimeType: mime,
		size: bytes.length,
		kind: mime.startsWith("image/") ? "image" : "file",
	}));
	const saved = { ...message("message-05", "真实格式阅读验收", true), attachments };
	await isolateChat(page, { items: [saved] });
	await page.route("**/v1/attachments/*/content", async (route) => {
		const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
		const file = files.get(id);
		if (!file) throw new Error(id);
		await route.fulfill({
			status: route.request().headers().range ? 206 : 200,
			contentType: file.mime,
			body: route.request().headers().range ? file.bytes.subarray(0, 4096) : file.bytes,
		});
	});
	await page.goto(`/messages/${conversation.id}`);
	return files;
}
async function open(page: Page, name: string) {
	await page.getByRole("button", { name: `打开 ${name}`, exact: true }).click();
	await expect(page.locator("[data-attachment-pane-reader]:visible")).toBeVisible();
	if ((await page.locator("[data-layout-mode]").getAttribute("data-layout-mode")) === "mobile") {
		const dialog = page.getByRole("dialog", { name, exact: true });
		await expect
			.poll(() =>
				dialog.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					return Math.abs(bounds.left) < 1 && Math.abs(bounds.width - window.innerWidth) < 1;
				}),
			)
			.toBe(true);
	}
}
async function close(page: Page) {
	const overlay = page.locator(".attachment-preview-layer");
	if (await overlay.count()) {
		await overlay.getByRole("button", { name: "关闭预览", exact: true }).click();
		await expect(overlay).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => history.state?.attachmentPreview ?? null)).toBeNull();
	} else {
		const desktop = page.locator("[data-detail-pane]");
		if (await desktop.isVisible()) await desktop.getByRole("button", { name: "关闭全部", exact: true }).click();
		else await page.getByRole("dialog").getByRole("button", { name: "返回", exact: true }).click();
		await expect(page.locator("[data-attachment-pane-reader]")).toHaveCount(0);
	}
}

test("real image gestures and SVG isolation preserve the desktop conversation", async ({ page }) => {
	await setup(page);
	const before = await page.evaluate(() => history.length);
	await open(page, "diagram.svg");
	const image = page.locator(".attachment-image-area img");
	await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);
	await image.click();
	await expect(image).toBeVisible();
	await image.dblclick();
	await expect(page.locator(".attachment-reader-toolbar output")).toHaveText("200%");
	const box = await image.boundingBox();
	if (!box) throw new Error("No image");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	for (let n = 1; n <= 12; n++) await page.mouse.move(box.x + box.width / 2 + n, box.y + box.height / 2);
	await page.mouse.up();
	await expect(image).toBeVisible();
	expect(await page.evaluate(() => "svgExecuted" in window)).toBe(false);
	await page.getByRole("button", { name: "适应窗口" }).click();
	await page.locator(".attachment-image-area").click({ position: { x: 10, y: 10 } });
	await expect(page.locator("[data-attachment-pane-reader]")).toBeVisible();
	await open(page, "diagram.svg");
	await expect.poll(() => page.evaluate(() => history.length)).toBe(before);
	await close(page);
	await expect(page).toHaveURL(new RegExp(`/messages/${conversation.id}$`));
});

test("desktop attachment tabs keep the chat usable and reuse a zoomed document", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 850 });
	await setup(page);
	await open(page, "chinese.pdf");
	const pane = page.locator("[data-detail-pane]");
	const download = pane.locator("[data-side-title-actions]").getByRole("button", { name: "下载原文件" });
	await expect(download).toBeVisible();
	await expect(download).toHaveAttribute("title", "下载原文件");
	await expect(pane.locator("[data-side-actions]")).toBeHidden();
	const pdfPage = pane.locator('[data-pdf-page="1"]:visible');
	const width = () => pdfPage.evaluate((element: HTMLElement) => Number.parseFloat(element.style.width));
	const fit = await width();
	await pane.getByRole("button", { name: "放大", exact: true }).click();
	await expect.poll(width).toBeGreaterThan(fit);
	const zoom = await width();
	await open(page, "发布安排.md");
	await expect(pane.getByRole("heading", { name: "发布安排" })).toBeVisible();
	await page.getByRole("textbox", { name: /^对 / }).fill("一边看文档，一边继续对话。");
	await expect(pane.getByRole("tab")).toHaveCount(2);
	await page.screenshot({ path: `${evidence}/desktop-attachment-tabs.png`, animations: "disabled" });
	await open(page, "chinese.pdf");
	await expect(pane.getByRole("tab")).toHaveCount(2);
	await expect(pane.getByRole("tab", { name: "chinese.pdf" })).toHaveAttribute("aria-selected", "true");
	await expect.poll(width).toBeCloseTo(zoom);
	await close(page);
});

test("a sent image group retains navigation and independent desktop tabs", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 850 });
	await setup(page);
	await open(page, "diagram.svg");
	const pane = page.locator("[data-detail-pane]");
	const reader = pane.locator("[data-attachment-pane-reader]:visible");
	await expect(pane.getByText("第 2 张 / 共 2 张")).toBeVisible();
	await reader.locator(".attachment-image-area").press("ArrowLeft");
	await expect(pane.getByRole("tab", { name: "photo.heic" })).toHaveAttribute("aria-selected", "true");
	await expect(pane.getByText("第 1 张 / 共 2 张")).toBeVisible();
	await expect(reader.getByRole("img", { name: "photo.heic" })).toBeVisible();
	await expect(pane.getByRole("tab")).toHaveCount(2);
	await page.screenshot({ path: `${evidence}/release-chat-image-gallery-desktop.png`, animations: "disabled" });
	await close(page);
});

test("real three-page Chinese PDF paints text and canvas; manual scrolling updates real page number", async ({
	page,
}) => {
	await setup(page);
	await open(page, "chinese.pdf");
	await expect(page.locator('[data-pdf-page="1"] .textLayer')).toContainText("附件阅读验收");
	await expect
		.poll(() =>
			page.locator('[data-pdf-page="1"] canvas').evaluate((canvas: HTMLCanvasElement) => {
				const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
				if (!data) return false;
				for (let index = 0; index < data.length; index += 4) if ((data[index] ?? 255) < 180) return true;
				return false;
			}),
		)
		.toBe(true);
	await page.locator('[data-pdf-page="2"]').scrollIntoViewIfNeeded();
	await expect(page.getByRole("spinbutton", { name: "页码" })).toHaveValue("2");
	await expect(page.locator('[data-pdf-page="2"] .textLayer')).toContainText("第2页");
	await page.screenshot({ path: `${evidence}/desktop-pdf.png` });
	await page.getByRole("button", { name: "放大", exact: true }).click();
	await page.locator(".attachment-pdf-scroll").evaluate((element) => {
		element.scrollLeft = 0;
	});
	const leftReachable = await page.locator(".attachment-pdf-scroll").evaluate((element) => {
		const first = element.querySelector("[data-pdf-page]");
		return !!first && first.getBoundingClientRect().left >= element.getBoundingClientRect().left;
	});
	expect(leftReachable).toBe(true);
	const pdfWorkers = page.workers().filter((worker) => worker.url().includes("pdf.worker"));
	console.log(
		"Workers before PDF close:",
		page.workers().map((worker) => worker.url()),
	);
	expect(pdfWorkers).toHaveLength(1);
	await close(page);
	await expect(page.locator("canvas")).toHaveCount(0);
	await expect.poll(() => pdfWorkers.every((worker) => !page.workers().includes(worker))).toBe(true);
	console.log(
		"Workers after PDF close:",
		page.workers().map((worker) => worker.url()),
	);
});

test("real DOCX renders Chinese paragraphs, table and embedded image in continuous reading", async ({ page }) => {
	await setup(page);
	await open(page, "document.docx");
	const content = page.locator(".attachment-document-content");
	await expect(content).toContainText("中文");
	await expect(content.locator("table")).toBeVisible();
	await expect(content.locator("img")).toHaveCount(1);
	await expect
		.poll(() => content.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
		.toBeGreaterThan(0);
	await expect(page.getByText("连续阅读", { exact: true })).toBeVisible();
	await page.screenshot({ path: `${evidence}/desktop-docx.png` });
	await close(page);
});

test("genuine HEIC is decoded on demand and original download remains byte-identical", async ({ page }) => {
	test.setTimeout(120000);
	const files = await setup(page);
	await open(page, "photo.heic");
	const image = page.locator(".attachment-image-area img");
	await expect(image).toBeVisible({ timeout: 90000 });
	await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "下载原文件" }).click();
	const item = await download;
	const path = await item.path();
	if (!path) throw new Error("No downloaded file");
	expect(readFileSync(path).equals(files.get("photo.heic")?.bytes ?? Buffer.alloc(0))).toBe(true);
	await page.screenshot({ path: `${evidence}/desktop-heic.png` });
	await close(page);
});

test("real PCM audio and H264 video play; closing pauses media and invalid codec shows download guidance", async ({
	page,
}) => {
	await setup(page);
	for (const [name, tag] of [
		["audio.wav", "audio"],
		["video.mp4", "video"],
	] as const) {
		await open(page, name);
		const media = page.locator(`.attachment-media-reader ${tag}`);
		await expect.poll(() => media.evaluate((el: HTMLMediaElement) => el.readyState)).toBeGreaterThanOrEqual(1);
		await media.evaluate(async (el: HTMLMediaElement) => {
			(window as unknown as { lastMedia: HTMLMediaElement }).lastMedia = el;
			await el.play();
		});
		await expect.poll(() => media.evaluate((el: HTMLMediaElement) => el.currentTime)).toBeGreaterThan(0);
		if (tag === "audio") {
			await open(page, "发布安排.md");
			await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.paused)).toBe(true);
		}
		if (tag === "video") await page.screenshot({ path: `${evidence}/desktop-video.png` });
		await close(page);
		expect(await page.evaluate(() => (window as unknown as { lastMedia: HTMLMediaElement }).lastMedia.paused)).toBe(
			true,
		);
	}
	await open(page, "broken.mp4");
	// The Bot chat header keeps its own status line; the codec notice belongs to the reader.
	await expect(page.locator("[data-attachment-pane-reader]:visible").getByRole("status")).toContainText(
		"当前设备无法播放",
	);
	await expect(page.getByRole("button", { name: "下载原文件" })).toBeVisible();
});

test.describe("phone attachment readers", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});

	test("compact sent cards and safe Markdown share the mobile reader with drafts", async ({ page }) => {
		await setup(page);
		await page.goto("/messages");
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		await expect(page.locator("[data-mobile-dock] nav")).toBeVisible();
		await expect(page.getByRole("navigation")).toHaveCount(1);
		await page.screenshot({ path: `${evidence}/mobile-message-list.png` });
		await page.goto(`/messages/${conversation.id}`);
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		// The main Bot conversation is the first phone tab: one dock holds the composer and the tabs.
		await expect(page.getByRole("navigation")).toHaveCount(1);
		await expect(page.locator("[data-mobile-dock] nav")).toBeVisible();
		await expect(page.locator("[data-mobile-dock]").getByRole("textbox")).toBeVisible();
		const text = page.getByRole("button", { name: "打开 note.txt", exact: true });
		await expect(text).toBeVisible();
		await expect(text.locator("pre")).toHaveCount(0);
		await expect(text.locator("..").getByRole("button")).toHaveCount(1);
		await page.screenshot({ path: `${evidence}/mobile-sent-cards.png` });
		await open(page, "notes.md");
		await expect(page.getByRole("heading", { name: "阅读标题" })).toBeVisible();
		await expect(page.locator(".attachment-document-scroll script,.attachment-document-scroll img")).toHaveCount(0);
		await close(page);
		await open(page, "发布安排.md");
		await expect(page.getByRole("heading", { name: "交付清单" })).toBeVisible();
		const header = page.getByRole("dialog", { name: "发布安排.md" }).locator("[data-frame-header]");
		await expect(header.getByRole("button")).toHaveCount(1);
		const reader = page.locator("[data-attachment-pane-reader]");
		const inlineDownload = reader.getByRole("button", { name: "下载原文件" });
		await expect(inlineDownload).toBeVisible();
		const [downloadBounds, headingBounds] = await Promise.all([
			inlineDownload.boundingBox(),
			reader.getByRole("heading", { name: "发布安排" }).boundingBox(),
		]);
		if (!downloadBounds || !headingBounds) throw new Error("The reader heading and download action must be visible");
		expect(downloadBounds.y).toBeLessThan(headingBounds.y + headingBounds.height);
		expect(headingBounds.y).toBeLessThan(downloadBounds.y + downloadBounds.height);
		await expect(page.getByRole("tablist")).toHaveCount(0);
		await page.screenshot({ path: `${evidence}/phone-attachment-detail.png`, animations: "disabled" });
		await close(page);
		await page
			.getByLabel("上传文件", { exact: true })
			.setInputFiles({ name: "draft.txt", mimeType: "text/plain", buffer: Buffer.from("草稿预览正文\n第二行") });
		await page.getByRole("button", { name: "预览 draft.txt", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "预览 draft.txt" })).toBeVisible();
		await expect(page.locator(".attachment-text-content")).toContainText("草稿预览正文");
		await page.screenshot({ path: `${evidence}/mobile-draft-reader.png` });
		await close(page);
	});

	test("mobile touch pinch zoom and Back close the image reader before the conversation", async ({
		browser,
		baseURL,
	}) => {
		const context = await browser.newContext({
			baseURL,
			viewport: { width: 390, height: 844 },
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
			isMobile: true,
			hasTouch: true,
		});
		const page = await context.newPage();
		try {
			await setup(page);
			await open(page, "diagram.svg");
			const image = page.locator(".attachment-image-area img");
			await expect(image).toBeVisible();
			const box = await image.boundingBox();
			if (!box) throw new Error("No image");
			const x = box.x + box.width / 2,
				y = box.y + box.height / 2;
			const cdp = await context.newCDPSession(page);
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [
					{ x: x - 20, y, id: 1 },
					{ x: x + 20, y, id: 2 },
				],
			});
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [
					{ x: x - 50, y, id: 1 },
					{ x: x + 50, y, id: 2 },
				],
			});
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await expect
				.poll(async () =>
					Number(((await page.locator(".attachment-reader-toolbar output").textContent()) ?? "").replace("%", "")),
				)
				.toBeGreaterThan(100);
			await page.screenshot({ path: `${evidence}/mobile-touch-image.png` });
			await page.goBack();
			await expect(page.locator("[data-attachment-pane-reader]")).toHaveCount(0);
			await expect(page).toHaveURL(new RegExp(`/messages/${conversation.id}$`));
		} finally {
			await context.close();
		}
	});
});

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { devices, expect, test } from "@playwright/test";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const path = `/messages/${conversation.id}`;
const image = resolve("brand/assets/png/yonder-tile-ink-1024.png");

test("a reloaded attachment draft enters the conversation before upload and preserves later typing", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	await isolateChat(page);
	await page.goto(path);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await expect(input).toBeVisible();
	await input.fill("这是还没有发送的多行提示词。\n刷新后图片和文件也要留在这里。");
	await page.getByLabel("上传文件", { exact: true }).setInputFiles([image]);
	await expect(page.locator(".composer-file")).toHaveCount(1);
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve) => {
					const request = indexedDB.open("yonder-chat", 1);
					request.onsuccess = () => resolve(request.result);
				});
				return new Promise<number>((resolve) => {
					const request = db.transaction("records").objectStore("records").getAll();
					request.onsuccess = () => resolve(request.result.filter((value) => value?.files?.length).length);
				});
			}),
		)
		.toBe(1);
	await page.reload();
	await expect(input).toHaveValue("这是还没有发送的多行提示词。\n刷新后图片和文件也要留在这里。");
	await expect(page.locator(".composer-file img")).toBeVisible();
	await mkdir(testInfo.outputPath("previews"), { recursive: true });
	await page.screenshot({ path: testInfo.outputPath("previews/desktop-draft.png"), animations: "disabled" });

	const attachment = {
		id: "att_isolated",
		kind: "image",
		name: "yonder-tile-ink-1024.png",
		mimeType: "image/png",
		size: 100,
	};
	const attachmentReads: string[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (path.startsWith(`/v1/attachments/${attachment.id}/`)) attachmentReads.push(path);
	});
	const uploadStarted = Promise.withResolvers<void>();
	const uploadResponse = Promise.withResolvers<void>();
	await page.route("**/v1/attachments", async (route) => {
		uploadStarted.resolve();
		await uploadResponse.promise;
		return route.fulfill({ json: attachment });
	});
	const messageResponse = Promise.withResolvers<void>();
	let sentNonce = "";
	await page.route("**/v1/conversations/*/messages", async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		const sent = route.request().postDataJSON();
		sentNonce = sent.clientNonce;
		await messageResponse.promise;
		await route.fulfill({
			json: {
				message: { ...message("saved-17", sent.body, true), clientNonce: sent.clientNonce, attachments: [attachment] },
				clientNonce: sent.clientNonce,
			},
		});
	});
	try {
		await page.getByRole("button", { name: "发送", exact: true }).click();
		await uploadStarted.promise;
		await expect(input).toHaveValue("");
		await expect(page.locator(".composer-file")).toHaveCount(0);
		await expect(page.getByRole("log").getByText("这是还没有发送的多行提示词。", { exact: false })).toBeVisible();
		const photo = page.getByRole("log").locator("img.message-attachment-image");
		await expect(photo).toBeVisible();
		await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
		await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath("previews/desktop-attachment-before-upload.png"),
			animations: "disabled",
		});
		expect(sentNonce).toBe("");
		await input.fill("后写的新提示词不能被清除");
		uploadResponse.resolve();
		await expect.poll(() => sentNonce).not.toBe("");
		await expect(input).toHaveValue("后写的新提示词不能被清除");
	} finally {
		uploadResponse.resolve();
		messageResponse.resolve();
	}
	await expect(page.locator('[data-message-id="saved-17"]')).toBeVisible();
	await expect(input).toHaveValue("后写的新提示词不能被清除");
	const savedPhoto = page.locator('[data-message-id="saved-17"] img.message-attachment-image');
	await expect(savedPhoto).toBeVisible();
	await expect.poll(() => savedPhoto.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
	expect(attachmentReads).toEqual([]);
	await expect(page.locator(".composer-file")).toHaveCount(0);
	await page.reload();
	await expect(input).toHaveValue("后写的新提示词不能被清除");
});

test("a file drag shows feedback over both the message list and composer, while text drags do not", async ({
	page,
}, testInfo) => {
	await isolateChat(page, { dark: true });
	await page.goto(path);
	await expect(page.getByRole("log")).toBeVisible();
	const data = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		data.items.add(new File(["meeting notes"], "会议纪要.txt", { type: "text/plain" }));
		return data;
	});
	const log = page.getByRole("log");
	await log.dispatchEvent("dragenter", { dataTransfer: data });
	await expect(page.locator(".file-drop-overlay")).toBeVisible();
	await mkdir(testInfo.outputPath("previews"), { recursive: true });
	await page.screenshot({ path: testInfo.outputPath("previews/desktop-dark-drop.png"), animations: "disabled" });
	await log.dispatchEvent("drop", { dataTransfer: data });
	await expect(page.locator(".file-drop-overlay")).toHaveCount(0);
	await expect(page.locator(".composer-file")).toHaveCount(1);
	const composer = page.locator(".composer-box");
	await composer.dispatchEvent("dragenter", { dataTransfer: data });
	await expect(page.locator(".composer-drop-hint")).toBeVisible();
	await composer.dispatchEvent("dragleave", { dataTransfer: data });
	await expect(page.locator(".composer-drop-hint")).toHaveCount(0);
	const text = await page.evaluateHandle(() => {
		const data = new DataTransfer();
		data.setData("text/plain", "dragged text");
		return data;
	});
	await log.dispatchEvent("dragenter", { dataTransfer: text });
	await expect(page.locator(".file-drop-overlay")).toHaveCount(0);
});

test("the mobile photo picker puts the photo in the conversation before upload completes", async ({
	browser,
	baseURL,
}, testInfo) => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	const context = await browser.newContext({ ...phone, baseURL });
	const uploadResponse = Promise.withResolvers<void>();
	try {
		const page = await context.newPage();
		const api = await isolateChat(page, { items: [] });
		const attachment = {
			id: "att_mobile_photo",
			kind: "image",
			name: "yonder-tile-ink-1024.png",
			mimeType: "image/png",
			size: 100,
		};
		let uploading = false;
		await page.route("**/v1/attachments", async (route) => {
			uploading = true;
			await uploadResponse.promise;
			return route.fulfill({ json: attachment });
		});
		await page.goto(path);
		await page.getByRole("button", { name: "添加附件", exact: true }).click();
		const chooser = page.waitForEvent("filechooser");
		await page.locator(".composer-mobile-attachment-grid").getByRole("button", { name: "相册", exact: true }).click();
		await (await chooser).setFiles(image);
		await expect.poll(() => uploading).toBe(true);
		const photo = page.getByRole("log").locator("img.message-attachment-image");
		await expect(photo).toBeVisible();
		await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
		const caption = "这是刚选好的图片。";
		const input = page.getByRole("textbox", { name: /^对 界面验收/ });
		await input.fill(caption);
		await page.getByRole("button", { name: "发送", exact: true }).click();
		await expect(page.getByRole("log").getByText(caption, { exact: true })).toBeVisible();
		await expect(input).toHaveValue("");
		await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath("mobile-attachment-before-upload.png"),
			animations: "disabled",
			scale: "css",
		});
		expect(api.sent).toEqual([]);
		uploadResponse.resolve();
		await expect.poll(() => api.sent).toMatchObject([{ attachmentIds: [attachment.id] }, { body: caption }]);
	} finally {
		uploadResponse.resolve();
		await context.close();
	}
});

test("mobile separates image and file pickers and naturally wrapped text puts controls beneath it", async ({
	browser,
}, testInfo) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
	});
	const page = await context.newPage();
	await isolateChat(page);
	await page.goto(path);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.fill("这是一段没有手动换行但会在手机上自然折行的中文提示词，需要完整保留并让按钮留在底部。");
	await expect(page.locator(".composer-layout")).toHaveClass(/composer-expanded/);
	await page.getByRole("button", { name: "添加附件", exact: true }).click();
	const grid = page.locator(".composer-mobile-attachment-grid");
	await expect(grid.getByRole("button", { name: "相册", exact: true })).toBeVisible();
	await expect(grid.getByRole("button", { name: "拍照", exact: true })).toBeVisible();
	await expect(grid.getByRole("button", { name: "发送文件", exact: true })).toBeVisible();
	const menuBounds = await grid.boundingBox();
	const composerBounds = await page.locator(".composer-box").boundingBox();
	expect(menuBounds && composerBounds && menuBounds.y >= composerBounds.y + composerBounds.height).toBe(true);
	await mkdir(testInfo.outputPath("previews"), { recursive: true });
	await page.screenshot({ path: testInfo.outputPath("previews/mobile-picker.png"), animations: "disabled" });
	await context.close();
});

test("three draft attachments scroll within the iPhone composer and leave Send fully visible", async ({ browser }) => {
	const width = 390;
	const context = await browser.newContext({
		viewport: { width, height: 844 },
		isMobile: true,
		hasTouch: true,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
	});
	try {
		const page = await context.newPage();
		await isolateChat(page);
		await page.addInitScript(() => {
			localStorage.setItem("dev.yonder.desktop.refresh-token", "isolated-attachment-draft");
			Object.defineProperty(window, "__TAURI_INTERNALS__", {
				value: {
					invoke: async () => null,
					transformCallback: () => 1,
					unregisterCallback: () => undefined,
					metadata: { currentWindow: { label: "main" } },
				},
			});
		});
		await page.goto("/messages/main");
		await expect(page.locator("html")).toHaveAttribute("data-native-mobile", "true");
		await page.getByRole("textbox", { name: /^对 界面验收/ }).fill("未发送的草稿");
		const png = await readFile(image);
		await page.getByLabel("上传文件", { exact: true }).setInputFiles([
			{ name: "one.png", mimeType: "image/png", buffer: png },
			{ name: "two.png", mimeType: "image/png", buffer: png },
			{ name: "资料.txt", mimeType: "text/plain", buffer: Buffer.from("附件") },
		]);
		await expect(page.locator(".composer-file")).toHaveCount(3);
		const send = page.getByRole("button", { name: "发送", exact: true });
		await expect(send).toBeVisible();
		const geometry = await send.evaluate((button) => {
			const composer = button.closest(".composer-box");
			const files = composer?.querySelector(".composer-files");
			if (!composer || !files) throw new Error("Expected draft attachment geometry");
			files.scrollLeft = files.scrollWidth;
			return {
				sendRight: button.getBoundingClientRect().right,
				frameRight: composer.getBoundingClientRect().right,
				scroll: files.scrollLeft,
			};
		});
		expect(geometry.sendRight).toBeLessThan(width);
		expect(geometry.frameRight).toBeLessThan(width);
		expect(geometry.scroll).toBeGreaterThan(0);
	} finally {
		await context.close();
	}
});

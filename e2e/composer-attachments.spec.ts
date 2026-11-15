import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const path = `/messages/${conversation.id}`;
const image = resolve("brand/assets/png/yonder-tile-ink-1024.png");

test("text, attachment bytes and failed messages persist; confirmation never erases later typing", async ({
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
	await page.route("**/v1/attachments", (route) => route.fulfill({ json: attachment }));
	let confirm!: () => void;
	const response = new Promise<void>((resolve) => {
		confirm = resolve;
	});
	let sentNonce = "";
	await page.route("**/v1/conversations/*/messages", async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		const sent = route.request().postDataJSON();
		sentNonce = sent.clientNonce;
		await response;
		await route.fulfill({
			json: {
				message: { ...message("saved-17", sent.body, true), clientNonce: sent.clientNonce, attachments: [attachment] },
				clientNonce: sent.clientNonce,
			},
		});
	});
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => sentNonce).not.toBe("");
	await input.fill("后写的新提示词不能被清除");
	confirm();
	await expect(input).toHaveValue("后写的新提示词不能被清除");
	await expect(page.locator(".message-attachment-image")).toBeVisible();
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
	await expect(page.getByRole("button", { name: "上传图片", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "上传文件", exact: true })).toBeVisible();
	await mkdir(testInfo.outputPath("previews"), { recursive: true });
	await page.screenshot({ path: testInfo.outputPath("previews/mobile-picker.png"), animations: "disabled" });
	await context.close();
});

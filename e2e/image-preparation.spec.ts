import { expect, type Page, test } from "@playwright/test";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

interface Upload {
	bytes: Buffer;
	nonce: string;
	name: string;
	mime: string;
}
async function generatedImage(page: Page, type: "image/jpeg" | "image/png", width: number, height: number) {
	return page.evaluate(
		async ({ type, width, height }) => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("No canvas");
			if (type === "image/png") {
				context.fillStyle = "#d93a31";
				context.fillRect(width / 4, height / 4, width / 2, height / 2);
			} else {
				const gradient = context.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, "#285cd8");
				gradient.addColorStop(1, "#f9d86b");
				context.fillStyle = gradient;
				context.fillRect(0, 0, width, height);
				for (let x = 0; x < width; x += 24) {
					context.fillStyle = x % 48 ? "#ffffff" : "#285cd8";
					context.fillRect(x, height / 3, 10, height / 3);
				}
			}
			const blob = await new Promise<Blob>((resolve) =>
				canvas.toBlob(
					(blob) => {
						if (blob) resolve(blob);
					},
					type,
					1,
				),
			);
			return new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
				reader.readAsDataURL(blob);
			});
		},
		{ type, width, height },
	);
}

async function captureUploads(page: Page, rejectFirstUpload = false) {
	const uploads: Upload[] = [];
	await page.route("**/v1/attachments", async (route) => {
		const request = route.request();
		const data = await new Request("http://upload.test/", {
			method: "POST",
			headers: { "content-type": request.headers()["content-type"] ?? "" },
			body: new Uint8Array(request.postDataBuffer() ?? []),
		}).formData();
		const file = data.get("file") as File;
		const upload = {
			bytes: Buffer.from(await file.arrayBuffer()),
			nonce: String(data.get("clientNonce")),
			name: file.name,
			mime: file.type,
		};
		uploads.push(upload);
		if (rejectFirstUpload && uploads.length === 1)
			return route.fulfill({ status: 400, json: { error: { code: "invalid_request" } } });
		await route.fulfill({
			json: {
				id: `att_preview_${uploads.length}`,
				kind: file.type.startsWith("image/") ? "image" : "file",
				name: file.name,
				mimeType: file.type,
				size: file.size,
			},
		});
	});
	return uploads;
}

test("default image compression, original choice and text thumbnails survive refresh with stable byte identities", async ({
	page,
}, testInfo) => {
	const api = await isolateChat(page);
	await page.goto(`/messages/${conversation.id}`);
	const uploads = await captureUploads(page, true);
	const original = Buffer.from(await generatedImage(page, "image/jpeg", 4000, 2400), "base64");
	const photo = { name: "photo.jpg", mimeType: "image/jpeg", buffer: original };
	const picker = page.getByLabel("上传文件", { exact: true });
	await picker.setInputFiles([
		photo,
		{
			name: "会议纪要.txt",
			mimeType: "text/plain",
			buffer: Buffer.concat([
				Buffer.from([255, 254]),
				Buffer.from("这是文档开头的中文内容。\n".repeat(100), "utf16le"),
			]),
		},
	]);
	const composer = page.locator(".composer-box");
	const image = composer.locator('[data-attachment-name="photo.jpg"]');
	const text = composer.locator('[data-attachment-name="会议纪要.txt"]');
	await expect(image.getByText("已压缩", { exact: true })).toBeVisible();
	await expect(text.locator("pre")).toContainText("这是文档开头的中文内容。");
	expect(await text.locator("pre").evaluate((element) => getComputedStyle(element).maskImage)).not.toBe("none");
	await image.getByRole("checkbox", { name: /原图/ }).check();
	// The draft is written to IndexedDB asynchronously; a reload before that write commits loses it.
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const open = indexedDB.open("yonder-chat", 1);
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					open.onsuccess = () => resolve(open.result);
					open.onerror = () => reject(open.error);
				});
				const value = await new Promise<unknown>((resolve) => {
					const request = db.transaction("records").objectStore("records").get("draft:chat-person:chat-route-check");
					request.onsuccess = () => resolve(request.result);
				});
				const files = (value as { files?: { name: string; sendOriginal?: boolean }[] } | undefined)?.files ?? [];
				return files.find((file) => file.name === "photo.jpg")?.sendOriginal ?? false;
			}),
		)
		.toBe(true);
	await page.reload();
	await expect(image.getByRole("checkbox", { name: /原图/ })).toBeChecked();
	await expect(text.locator("pre")).toContainText("这是文档开头的中文内容。");
	await composer.screenshot({ path: testInfo.outputPath("original-and-text-thumbnail.png"), animations: "disabled" });
	const send = page.getByRole("button", { name: "发送", exact: true });
	await send.click();
	const failed = page.getByRole("log").getByRole("alert");
	await expect(failed).toContainText("消息没有发出");
	await expect(composer.locator(".composer-file")).toHaveCount(0);
	expect(uploads[0]?.bytes.equals(original)).toBe(true);
	await failed.getByRole("button", { name: "重试", exact: true }).click();
	await expect.poll(() => api.sent.length).toBe(1);
	const [initialUpload, retriedUpload] = uploads.filter((upload) => upload.name === photo.name);
	expect(retriedUpload?.bytes.equals(original)).toBe(true);
	expect(retriedUpload?.nonce).toBe(initialUpload?.nonce);
	await expect(failed).toHaveCount(0);
	await picker.setInputFiles(photo);
	await expect(image.getByText("已压缩", { exact: true })).toBeVisible();
	await send.click();
	await expect.poll(() => api.sent.length).toBe(2);
	const optimized = uploads.at(-1);
	expect(optimized?.name).toBe(photo.name);
	expect(optimized?.bytes.length).toBeLessThan(original.length);
	expect(optimized?.nonce).not.toBe(initialUpload?.nonce);
});

test("transparent pixels and EXIF rotation survive browser-native preparation", async ({ page }) => {
	await isolateChat(page);
	await page.goto(`/messages/${conversation.id}`);
	const uploads = await captureUploads(page);
	const png = Buffer.from(await generatedImage(page, "image/png", 1200, 600), "base64");
	const jpeg = Buffer.from(await generatedImage(page, "image/jpeg", 400, 200), "base64");
	const exif = Buffer.alloc(36);
	exif.set([255, 225]);
	exif.writeUInt16BE(34, 2);
	exif.write("Exif\0\0", 4);
	exif.write("II", 10);
	exif.writeUInt16LE(42, 12);
	exif.writeUInt32LE(8, 14);
	exif.writeUInt16LE(1, 18);
	exif.writeUInt16LE(0x112, 20);
	exif.writeUInt16LE(3, 22);
	exif.writeUInt32LE(1, 24);
	exif.writeUInt16LE(6, 28);
	const rotated = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
	await page.getByLabel("上传文件", { exact: true }).setInputFiles([
		{ name: "alpha.png", mimeType: "image/png", buffer: png },
		{ name: "rotated.jpg", mimeType: "image/jpeg", buffer: rotated },
	]);
	await expect(page.locator('[data-attachment-name="rotated.jpg"]').getByText("已压缩", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => uploads.length).toBe(2);
	const decoded = await page.evaluate(
		async (files) => {
			const results = [];
			for (const file of files) {
				const blob = await (await fetch(`data:${file.mime};base64,${file.base64}`)).blob();
				const bitmap = await createImageBitmap(blob);
				const canvas = document.createElement("canvas");
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("No canvas");
				context.drawImage(bitmap, 0, 0);
				results.push({ width: bitmap.width, height: bitmap.height, alpha: context.getImageData(0, 0, 1, 1).data[3] });
				bitmap.close();
			}
			return results;
		},
		uploads.map((file) => ({ mime: file.mime, base64: file.bytes.toString("base64") })),
	);
	expect(decoded[0]?.alpha).toBe(0);
	expect(decoded[1]).toMatchObject({ width: 200, height: 400 });
});

test("oversized still photos are compressed before actual avatar and chat upload requests", async ({
	page,
}, testInfo) => {
	await isolateChat(page);
	await page.goto("/me/profile");
	const prepared = Buffer.from(await generatedImage(page, "image/jpeg", 2600, 1600), "base64");
	const avatar = Buffer.concat([prepared, Buffer.alloc(2 * 1024 * 1024)]);
	const avatarUploads: number[] = [];
	await page.route("**/v1/me/avatar", async (route) => {
		expect(route.request().headers()["content-type"]).toBe("image/jpeg");
		avatarUploads.push(route.request().postDataBuffer()?.length ?? 0);
		await route.fulfill({
			json: {
				member: { ...person, avatarUrl: "data:image/png;base64,iVBORw0KGgo=", version: 2 },
				bot,
				hasPassword: true,
				signInMethods: [],
				handleChange: { canChange: true, nextChangeAt: null },
				settings: { locale: "zh-CN", theme: "light" },
			},
		});
	});
	await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles({
		name: "avatar.jpg",
		mimeType: "image/jpeg",
		buffer: avatar,
	});
	await expect.poll(() => avatarUploads.length).toBe(1);
	expect(avatarUploads[0]).toBeGreaterThan(0);
	expect(avatarUploads[0]).toBeLessThanOrEqual(2 * 1024 * 1024);
	await expect(page.getByText("已保存", { exact: true })).toBeVisible();

	await page.goto(`/messages/${conversation.id}`);
	const uploads = await captureUploads(page);
	const photo = Buffer.concat([prepared, Buffer.alloc(20 * 1024 * 1024)]);
	await page
		.getByLabel("上传文件", { exact: true })
		.setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: photo });
	const tile = page.locator('[data-attachment-name="large.jpg"]');
	await expect(tile.getByText("已压缩", { exact: true })).toBeVisible();
	await expect(tile.getByRole("checkbox", { name: /原图/ })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("oversized-photo-ready.png"), animations: "disabled" });
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => uploads.length).toBe(1);
	expect(uploads[0]?.bytes.length).toBeGreaterThan(0);
	expect(uploads[0]?.bytes.length).toBeLessThanOrEqual(20 * 1024 * 1024);
});

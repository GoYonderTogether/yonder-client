import { expect, type Page, test } from "@playwright/test";
import { conversation, isolateChat } from "./chat-fixture.ts";

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

async function captureUploads(page: Page) {
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
	await page.route("**/v1/conversations/*/messages", (route) =>
		route.request().method() === "POST" ? route.abort("failed") : route.fallback(),
	);
	return uploads;
}

test("default image compression, original choice and text thumbnails survive refresh with stable byte identities", async ({
	page,
}, testInfo) => {
	await isolateChat(page);
	await page.goto(`/messages/${conversation.id}`);
	const uploads = await captureUploads(page);
	const original = Buffer.from(await generatedImage(page, "image/jpeg", 4000, 2400), "base64");
	await page.getByLabel("上传文件", { exact: true }).setInputFiles([
		{ name: "photo.jpg", mimeType: "image/jpeg", buffer: original },
		{
			name: "会议纪要.txt",
			mimeType: "text/plain",
			buffer: Buffer.concat([
				Buffer.from([255, 254]),
				Buffer.from("这是文档开头的中文内容。\n".repeat(100), "utf16le"),
			]),
		},
	]);
	const image = page.locator('[data-attachment-name="photo.jpg"]');
	const text = page.locator('[data-attachment-name="会议纪要.txt"]');
	await expect(image.getByText("已压缩", { exact: true })).toBeVisible();
	await expect(text.locator("pre")).toContainText("这是文档开头的中文内容。");
	expect(await text.locator("pre").evaluate((element) => getComputedStyle(element).maskImage)).not.toBe("none");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => uploads.length).toBe(2);
	await expect(page.getByText(/尚未确认发送/)).toBeVisible();
	expect(uploads[0]?.bytes.length).toBeLessThan(original.length);
	const optimized = uploads[0];
	await image.getByRole("checkbox", { name: /原图/ }).check();
	await page.reload();
	await expect(image.getByRole("checkbox", { name: /原图/ })).toBeChecked();
	await expect(text.locator("pre")).toContainText("这是文档开头的中文内容。");
	await page
		.locator(".composer-box")
		.screenshot({ path: testInfo.outputPath("original-and-text-thumbnail.png"), animations: "disabled" });
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => uploads.length).toBe(4);
	await expect(page.getByText(/尚未确认发送/)).toBeVisible();
	expect(uploads[2]?.bytes.equals(original)).toBe(true);
	expect(uploads[2]?.nonce).not.toBe(optimized?.nonce);
	await image.getByRole("checkbox", { name: /原图/ }).uncheck();
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => uploads.length).toBe(6);
	expect(uploads[4]?.bytes.equals(optimized?.bytes ?? Buffer.alloc(0))).toBe(true);
	expect(uploads[4]?.nonce).toBe(optimized?.nonce);
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

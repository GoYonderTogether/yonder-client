import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devices, expect, type Locator, test } from "@playwright/test";
import type { Attachment } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const evidence = process.env.YONDER_E2E_EVIDENCE_DIR ?? "test-results/evidence/file-icons-20261116";
const fixtures = fileURLToPath(new URL("./fixtures/attachment-preview/", import.meta.url));
const samples = [
	{ name: "chinese.pdf", mime: "application/pdf", type: "pdf", buffer: readFileSync(`${fixtures}/chinese.pdf`) },
	{
		name: "document.docx",
		mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		type: "word",
		buffer: readFileSync(`${fixtures}/document.docx`),
	},
	{ name: "unknown.bin", mime: "application/octet-stream", type: "generic", buffer: Buffer.from([0, 1, 2, 3]) },
];

async function color(icon: Locator) {
	return icon.evaluate((element) => {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("No canvas color parser");
		context.fillStyle = getComputedStyle(element).color;
		context.fillRect(0, 0, 1, 1);
		return [...context.getImageData(0, 0, 1, 1).data];
	});
}

test("PDF red, Word blue and unknown blank gray icons stay consistent in sent cards and draft filenames", async ({
	browser,
	baseURL,
}) => {
	for (const mobile of [false, true]) {
		const context = await browser.newContext({
			baseURL,
			...(mobile
				? { ...devices["iPhone 14 Pro Max"], viewport: { width: 430, height: 932 } }
				: { viewport: { width: 1280, height: 900 } }),
		});
		const page = await context.newPage();
		try {
			const attachments: Attachment[] = samples.map((file) => ({
				id: file.name,
				kind: "file",
				name: file.name,
				mimeType: file.mime,
				size: file.buffer.length,
			}));
			await isolateChat(page, {
				items: [
					message("message-01", "PDF、Word 和未知文件使用各自的文件图标。", true),
					{
						...message("message-02", "", true),
						attachments,
					},
				],
			});
			let originalRequests = 0;
			page.on("request", (request) => {
				if (/\/attachments\/[^/]+\/content/.test(request.url())) originalRequests++;
			});
			await page.goto(`/messages/${conversation.id}`);
			await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", mobile ? "mobile" : "wide");
			if (mobile) {
				expect(await page.evaluate(() => navigator.userAgent)).toMatch(/iPhone/);
				expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
				await expect(page.getByRole("navigation")).toHaveCount(0);
				await expect
					.poll(() =>
						page
							.locator('[data-page-layer="detail"]')
							.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41),
					)
					.toBeCloseTo(0, 1);
			}
			for (const sample of samples) {
				const icon = page.locator(`[data-attachment-id="${sample.name}"] .message-attachment-icon > .file-type-icon`);
				await expect(icon).toHaveAttribute("data-file-type", sample.type);
				const channels = await color(icon);
				const [red = 0, green = 0, blue = 0] = channels;
				if (sample.type === "pdf") expect(red - Math.max(green, blue)).toBeGreaterThan(40);
				else if (sample.type === "word") expect(blue - red).toBeGreaterThan(40);
				else {
					expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(15);
					await expect(icon).toHaveText("");
				}
			}
			expect(originalRequests).toBe(0);
			await page
				.getByLabel("上传文件", { exact: true })
				.setInputFiles(samples.map((file) => ({ name: file.name, mimeType: file.mime, buffer: file.buffer })));
			for (const sample of samples) {
				const tile = page.locator(`[data-attachment-name="${sample.name}"]`);
				const nameIcon = tile.locator(".composer-file-name > .file-type-icon");
				await expect(nameIcon).toHaveAttribute("data-file-type", sample.type);
				await expect(nameIcon).toBeVisible();
				await expect(tile.locator(".composer-file-name")).toContainText(sample.name);
			}
			await page.screenshot({ scale: "css", path: `${evidence}/${mobile ? "mobile" : "desktop"}-file-icons.png` });
		} finally {
			await context.close();
		}
	}
});

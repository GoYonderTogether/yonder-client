import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, type Page, test } from "@playwright/test";
import type { Attachment, MemoryDayPage } from "@yonder/protocol";
import { isolateChat, message } from "./chat-fixture.ts";

const attachment: Attachment = {
	id: "shared-picture",
	kind: "image",
	name: "shared.jpg",
	mimeType: "image/jpeg",
	size: 900_000,
};
const at = new Date().toISOString();
const timeline: MemoryDayPage = {
	nextCursor: null,
	items: [
		{
			date: at.slice(0, 10),
			state: "ready",
			failure: null,
			digest: { steps: null, photos: 1, places: 0 },
			digestPath: null,
			blocks: [
				{
					type: "entry",
					entry: {
						id: "shared-photo-memory",
						visibility: "private",
						weight: 2,
						size: "media",
						kind: "photo",
						activity: null,
						at,
						endsAt: null,
						title: "同一张缓存图片",
						text: null,
						body: null,
						place: null,
						media: [{ attachment, durationMs: null }],
						mediaCount: 1,
						materials: [],
						tags: [],
						people: [],
						quote: null,
						links: [],
						sources: [],
						deletable: false,
					},
				},
			],
		},
	],
};

test("one authorized thumbnail survives refresh, a timeline visit and a full browser restart", async ({ baseURL }) => {
	if (!baseURL) throw new Error("The client server URL is missing");
	const profile = await mkdtemp(join(tmpdir(), "yonder-media-cache-"));
	const image = await readFile(new URL("./fixtures/meeting-check-photo.jpg", import.meta.url));
	const pictureOrigin = "https://media-cache-fixture.test";
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
			await isolateChat(page, { items: [{ ...message("shared-photo-01", "同一张照片"), attachments: [attachment] }] });
			await page.route("**/v1/memory/days?*", (route) => route.fulfill({ json: timeline }));
			await page.route("**/v1/attachments/shared-picture/download?*", async (route) => {
				const variant = new URL(route.request().url()).searchParams.get("variant");
				requests.push(`sign:${variant}`);
				await route.fulfill({ json: { url: `${pictureOrigin}/photo/${variant}` } });
			});
			await page.route("**/v1/attachments/shared-picture/content", async (route) => {
				requests.push("legacy-content");
				await route.abort();
			});
			await page.route(`${pictureOrigin}/photo/*`, async (route) => {
				requests.push(`object:${new URL(route.request().url()).pathname.split("/").at(-1)}`);
				expect(route.request().headers().authorization).toBeUndefined();
				await route.fulfill({
					headers: { "Access-Control-Allow-Origin": new URL(baseURL).origin, "Cache-Control": "no-store" },
					contentType: "image/jpeg",
					body: image,
				});
			});
			return { context, page };
		} catch (error) {
			await context.close();
			throw error;
		}
	};
	const assertDecoded = async (page: Page, selector: string) => {
		const shown = page.locator(selector).first();
		await expect(shown).toBeVisible();
		await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
	};
	try {
		const first = await boot();
		try {
			await first.page.goto("/messages/main");
			await assertDecoded(first.page, ".message-attachment-image:is(img)");
			expect(requests).toEqual(["sign:thumb", "object:thumb"]);
			requests.length = 0;
			await first.page.reload();
			await assertDecoded(first.page, ".message-attachment-image:is(img)");
			expect(requests).toEqual([]);
			await first.page.getByRole("button", { name: "记忆", exact: true }).click();
			await assertDecoded(first.page, ".memory-thumb img");
			expect(requests).toEqual([]);
		} finally {
			await first.context.close();
		}
		const restarted = await boot();
		try {
			await restarted.page.goto("/memory/timeline");
			await assertDecoded(restarted.page, ".memory-thumb img");
			expect(requests).toEqual([]);
			await restarted.page.getByRole("button", { name: attachment.name, exact: true }).click();
			await expect(restarted.page.locator("[data-attachment-pane-reader]")).toBeVisible();
			expect(requests).toEqual(["sign:original", "object:original"]);
		} finally {
			await restarted.context.close();
		}
	} finally {
		await rm(profile, { recursive: true, force: true });
	}
});

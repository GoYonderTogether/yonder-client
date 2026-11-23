import { expect, test } from "@playwright/test";
import type { Attachment } from "@yonder/protocol";
import { isolateChat, message } from "./chat-fixture.ts";

const riverside: Attachment = {
	id: "riverside",
	kind: "image",
	name: "老城河畔.heic",
	mimeType: "image/heic",
	size: 1,
};

for (const width of [390, 1180]) {
	test.describe(`${width}px`, () => {
		const mobile = width === 390;
		test.use({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile });
		test("the Bot's question uses full-width choices and sends one reply", async ({ page }, info) => {
			const legacy = { ...message("options-01", "计划做成哪种格式？"), options: ["PDF", "Word"] };
			const card = {
				...message("options-03", "周末行程想先安排哪一站？"),
				options: ["老城河畔散步", "逛市集，找家咖啡店", "看展览，下午自由活动"],
				optionImageIds: [riverside.id, null, null],
				attachments: [riverside],
			};
			const { sent } = await isolateChat(page, {
				items: [legacy, message("prompt-02", "想规划一个轻松的周末，先帮我定个方向。", true), card],
			});
			await page.route("**/v1/attachments/riverside/content", (route) =>
				route.fulfill({ path: "e2e/fixtures/attachment-preview/photo.heic", contentType: riverside.mimeType }),
			);
			await page.goto("/messages/main");
			const question = page.getByRole("region", { name: card.body ?? "" });
			const photo = question.getByRole("button", { name: card.options[0], exact: true });
			const textOnly = question.getByRole("button", { name: card.options[1], exact: true });
			await expect(photo).toBeEnabled();
			await expect(textOnly).toBeEnabled();
			await expect(
				page.getByRole("region", { name: legacy.body ?? "" }).getByRole("button", { name: "PDF" }),
			).toBeDisabled();
			await expect(photo.locator("img")).toBeVisible();
			await expect
				.poll(() => photo.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth))
				.toBeGreaterThan(0);
			await expect(textOnly.locator("img")).toHaveCount(0);
			await expect(page.locator('[data-attachment-id="riverside"]')).toHaveCount(0);
			const photoRow = await photo.boundingBox();
			const textRow = await textOnly.boundingBox();
			expect(photoRow?.x).toEqual(textRow?.x);
			expect(photoRow?.width).toEqual(textRow?.width);
			expect(textRow?.y ?? 0).toBeGreaterThanOrEqual((photoRow?.y ?? 0) + (photoRow?.height ?? 0));
			await page.screenshot({ path: info.outputPath("options.png"), animations: "disabled" });
			if (mobile) await photo.tap();
			else await photo.press("Enter");
			await expect(photo).toBeDisabled();
			await expect(textOnly).toHaveCount(0);
			await expect(photo).toHaveAttribute("aria-current", "true");
			await expect
				.poll(() => sent)
				.toEqual([{ type: "text", body: card.options[0], clientNonce: `option:${card.id}` }]);
			await page.reload();
			await expect(photo).toHaveAttribute("aria-current", "true");
			await expect(photo.locator("img")).toBeVisible();
			await page.screenshot({ path: info.outputPath("options-selected.png"), animations: "disabled" });
		});
	});
}

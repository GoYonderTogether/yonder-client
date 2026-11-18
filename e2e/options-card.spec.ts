import { expect, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

for (const width of [390, 1180]) {
	test(`the Bot's answer choices send one ordinary reply at ${width}px`, async ({ page }, info) => {
		await page.setViewportSize({ width, height: 844 });
		const card = { ...message("options-02", "用哪种格式导出？"), options: ["PDF", "Word"] };
		const { sent } = await isolateChat(page, { items: [message("prompt-01", "问我导出格式", true), card] });
		await page.goto("/messages/main");
		const pdf = page.getByRole("button", { name: "PDF", exact: true });
		const word = page.getByRole("button", { name: "Word", exact: true });
		await expect(pdf).toBeEnabled();
		await expect(word).toBeEnabled();
		await page.screenshot({ path: info.outputPath("options.png") });
		await pdf.click();
		await expect(pdf).toBeDisabled();
		await expect(word).toBeDisabled();
		await expect.poll(() => sent).toEqual([{ type: "text", body: "PDF", clientNonce: "option:options-02" }]);
	});
}

import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

for (const mobile of [false, true]) {
	test(`own Bot menu ${mobile ? "mobile" : "desktop"}`, async ({ page }) => {
		await page.setViewportSize({ width: mobile ? 390 : 1180, height: mobile ? 844 : 820 });
		await isolateChat(page, { items: [] });
		await page.goto("/messages/main");
		await page.getByRole("button", { name: "添加附件" }).click();
		await expect(page.getByRole("button", { name: "录音笔记", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "上传文件" })).toBeVisible();
		await mkdir("../reviews/20261118-bot-closure", { recursive: true });
		await page.screenshot({ path: `../reviews/20261118-bot-closure/menu-${mobile ? "narrow" : "wide"}.png` });
	});
}

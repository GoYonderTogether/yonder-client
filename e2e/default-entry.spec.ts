import { expect, test } from "@playwright/test";
import { bodies, conversation, isolateChat } from "./chat-fixture.ts";

test("signed-in entry opens the main Bot without overriding direct conversation routes", async ({ page }) => {
	await isolateChat(page);
	await page.goto("/");
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	const direct = `/messages/${conversation.id}?source=fixture#latest`;
	await page.goto(direct);
	await page.reload();
	await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === direct);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
});

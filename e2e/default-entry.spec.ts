import { expect, test } from "@playwright/test";
import { bodies, conversation, isolateChat } from "./chat-fixture.ts";

test("signed-in entry keeps the landing page and does not override direct conversation routes", async ({ page }) => {
	await isolateChat(page);
	await page.goto("/");
	// A signed-in web visitor still gets the public page; "open the app" is a link, not a redirect.
	await expect(page.getByRole("link", { name: "打开应用", exact: true }).first()).toHaveAttribute(
		"href",
		"/messages/main",
	);
	await expect(page).toHaveURL(/\/$/);
	const direct = `/messages/${conversation.id}?source=fixture#latest`;
	await page.goto(direct);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === direct);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
});

test("the main Bot opens at its own address", async ({ page }) => {
	await isolateChat(page);
	await page.goto("/messages/main");
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
});

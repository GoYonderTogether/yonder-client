import { expect, test } from "@playwright/test";
import { bodies, conversation, isolateChat } from "./chat-fixture.ts";

test("signed-in web entry opens the main Bot on request without overriding direct conversation routes", async ({
	page,
}) => {
	await isolateChat(page);
	await page.goto("/");
	const open = page.locator(".lp-hero").getByRole("link", { name: "打开应用", exact: true });
	await expect(open).toBeVisible();
	await expect(page).toHaveURL((url) => url.pathname === "/");
	await open.click();
	await expect(page).toHaveURL(/\/messages\/main$/);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
	const direct = `/messages/${conversation.id}?source=fixture#latest`;
	await page.goto(direct);
	await page.reload();
	await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === direct);
	await expect(page.getByText(bodies.question, { exact: true })).toBeVisible();
});

test("guest web entry keeps the original sign-in path", async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "zh-CN"));
	await page.route("**/v1/auth/refresh", (route) =>
		route.fulfill({ status: 401, json: { error: { code: "unauthorized" } } }),
	);
	await page.goto("/");
	const web = page.locator(".lp-hero").getByRole("link", { name: "用网页版", exact: true });
	await expect(web).toBeVisible();
	await expect(page).toHaveURL((url) => url.pathname === "/");
	await web.click();
	await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/messages");
});

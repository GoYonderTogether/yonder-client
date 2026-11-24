import { expect, test } from "@playwright/test";
import { bodies, isolateChat } from "./chat-fixture.ts";

const signIn = "/sign-in?next=%2Fdownload";
const refresh = "**/v1/auth/refresh";

test.use({ locale: "zh-CN" });

test("a temporary startup failure keeps the existing cookie for the next load", async ({ context, page, baseURL }) => {
	let attempts = 0;
	if (!baseURL) throw new Error("missing browser test origin");
	await context.addCookies([
		{ name: "yonder_rt", value: "stored", domain: new URL(baseURL).hostname, path: "/v1/auth", httpOnly: true },
	]);
	// Keep the socket healthy so only startup owns refresh in this test.
	await context.routeWebSocket("**/v1/realtime*", () => {});
	await page.route(refresh, async (route) => {
		expect((await route.request().allHeaders()).cookie).toBe("yonder_rt=stored");
		attempts += 1;
		return attempts === 1
			? route.fulfill({ status: 502, body: "Service restarting" })
			: route.fulfill({ json: { accessToken: "restored" } });
	});

	const refreshing = page.waitForResponse(refresh);
	await page.goto(signIn);
	expect((await refreshing).status()).toBe(502);
	await expect(page.getByRole("status", { name: "loading" })).toBeVisible();
	await expect(page.locator("#sign-in-phone")).toHaveCount(0);
	await page.reload();
	await expect(page).toHaveURL(/\/download$/, { timeout: 10000 });
	expect(attempts).toBe(2);
});

test("a returning web user enters the app and reads existing cached messages while offline", async ({ page }) => {
	await isolateChat(page);
	await page.goto("/messages/main");
	await expect(page.getByText(bodies.question)).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate((body) => localStorage.getItem("yonder.yonder.query-cache")?.includes(body), bodies.question),
		)
		.toBe(true);

	await page.route("**/v1/**", (route) => route.abort("internetdisconnected"));
	await page.reload();
	await expect(page.getByText(bodies.question)).toBeVisible();
	await expect(page).toHaveURL(/\/messages\/main$/);
});

test("two web tabs refresh the shared cookie in order", async ({ context, page, baseURL }) => {
	let releaseFirst = () => {};
	const pending = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const cookies: Array<string | undefined> = [];
	if (!baseURL) throw new Error("missing browser test origin");
	await context.addCookies([
		{ name: "yonder_rt", value: "start", domain: new URL(baseURL).hostname, path: "/v1/auth", httpOnly: true },
	]);
	await context.routeWebSocket("**/v1/realtime*", () => {});
	await context.route(refresh, async (route) => {
		const attempt = cookies.push((await route.request().allHeaders()).cookie);
		if (attempt === 1) await pending;
		await route.fulfill({
			headers: { "set-cookie": `yonder_rt=next-${attempt}; Path=/v1/auth; HttpOnly; SameSite=Lax` },
			json: { accessToken: `access-${attempt}` },
		});
	});

	const second = await context.newPage();
	try {
		await page.goto(signIn);
		await expect.poll(() => cookies).toEqual(["yonder_rt=start"]);
		await second.goto(signIn);
		await second.waitForFunction(async () =>
			(await navigator.locks.query()).pending?.some((lock) => lock.name === "yonder-auth-refresh"),
		);
		expect(cookies).toEqual(["yonder_rt=start"]);
	} finally {
		releaseFirst();
	}
	await expect(page).toHaveURL(/\/download$/);
	await expect(second).toHaveURL(/\/download$/);
	expect(cookies).toEqual(["yonder_rt=start", "yonder_rt=next-1"]);
});

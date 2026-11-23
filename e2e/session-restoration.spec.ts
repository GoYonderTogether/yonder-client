import { expect, test } from "@playwright/test";

const signIn = "/sign-in?next=%2Fdownload";
const refresh = "**/v1/auth/refresh";

test.use({ locale: "zh-CN" });

test("a backend restart during startup resumes the stored session and its destination", async ({ page }, info) => {
	let attempts = 0;
	await page.route(refresh, (route) => {
		attempts += 1;
		return attempts === 1
			? route.fulfill({ status: 502, body: "Service restarting" })
			: route.fulfill({ json: { accessToken: "restored" } });
	});

	await page.goto(signIn);
	await expect(page.getByText("连接已断开，正在重连。")).toBeVisible();
	await expect(page.locator("#sign-in-phone")).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("session-reconnecting.png") });
	await expect(page).toHaveURL(/\/download$/, { timeout: 10000 });
	expect(attempts).toBe(2);
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

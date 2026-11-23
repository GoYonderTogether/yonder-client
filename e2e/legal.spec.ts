import { expect, test } from "@playwright/test";

const phone = "+8613800138000";

const legalPages = [
	["Terms of service", "terms"],
	["Privacy policy", "privacy"],
] as const;

test("legal pages open from sign-in and About and return to the original screen", async ({ page, baseURL }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
	if (!baseURL) throw new Error("Expected an e2e base URL");
	await page.goto("/privacy");
	await page.getByRole("button", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	await page.route("http://example.test/", (route) =>
		route.fulfill({ contentType: "text/html", body: `<a href="${baseURL}/terms">Open terms</a>` }),
	);
	await page.goto("http://example.test/");
	await page.getByRole("link", { name: "Open terms" }).click();
	await expect(page).toHaveURL(/\/terms$/);
	await page.getByRole("button", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL("http://example.test/");
	await page.unroute("http://example.test/");

	await page.route("**/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: {} }));
	await page.goto("/sign-in");

	const phoneInput = page.locator("#sign-in-phone");
	await phoneInput.fill(phone.replace("+86", ""));
	const typedPhone = await phoneInput.inputValue();
	expect(typedPhone.replace(/\s/g, "")).toBe(phone.replace("+86", ""));

	for (const [name, path] of legalPages) {
		await page.getByRole("link", { name, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/${path}$`));
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await page.getByRole("button", { name: "Back", exact: true }).click();
		await expect(page).toHaveURL(/\/sign-in$/);
		await expect(phoneInput).toHaveValue(typedPhone);
		await expect(page.getByRole("checkbox")).not.toBeChecked();
	}
	await page.route("**/v1/auth/refresh", (route) =>
		route.fulfill({ json: { accessToken: "public-ui-test", refreshToken: "public-ui-test" } }),
	);
	const member = {
		id: "legal-person",
		kind: "person",
		handle: "legaltest",
		displayName: "Legal Test",
		avatarUrl: null,
		bio: null,
		createdAt: "2026-11-15T00:00:00Z",
		version: 1,
	};
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member,
				bot: { ...member, id: "legal-bot", kind: "bot", handle: "legalbot", displayName: "Legal Bot" },
				hasPassword: false,
				signInMethods: [],
				settings: { locale: "en", theme: "light" },
			},
		}),
	);
	await page.route("**/v1/health", (route) => route.fulfill({ json: { ok: true, version: "public-ui-test" } }));
	await page.goto("/me/about");
	await expect(page.getByRole("button", { name: "Terms of service", exact: true })).toBeVisible();

	for (const [name, path] of legalPages) {
		await page.getByRole("button", { name, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/${path}$`));
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await page.getByRole("button", { name: "Back", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/about$/);
	}
});

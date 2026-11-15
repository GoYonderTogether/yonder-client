import { expect, type Page, test } from "@playwright/test";

async function isolate(page: Page, signedIn: boolean) {
	const member = {
		id: "person",
		kind: "person",
		handle: "test",
		displayName: "Test",
		avatarUrl: null,
		bio: null,
		createdAt: "2026-11-15T00:00:00Z",
		version: 1,
	};
	const bot = { ...member, id: "bot", kind: "bot", displayName: "Test Bot" };
	const conversation = {
		id: "conversation",
		kind: "direct",
		isPrimary: true,
		title: null,
		members: [member, bot].map(({ id, ...rest }) => ({ ...rest, memberId: id })),
		lastMessageAt: null,
		unreadCount: 0,
		pinned: true,
		version: 1,
	};
	await page.addInitScript(() => localStorage.setItem("yonder.locale", "en"));
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.hostname !== "127.0.0.1") return route.abort();
		if (url.pathname.startsWith("/v1/")) {
			if (!signedIn) return route.fulfill({ status: 401, json: {} });
			const json =
				url.pathname === "/v1/auth/refresh"
					? { accessToken: "isolated" }
					: url.pathname === "/v1/me"
						? { member, bot, hasPassword: true, signInMethods: [], settings: { locale: "en", theme: "light" } }
						: url.pathname === "/v1/conversations"
							? { items: [conversation] }
							: url.pathname === "/v1/health"
								? { ok: true, version: "isolated" }
								: { items: [], hasMore: false, nextCursor: null };
			return route.fulfill({ json });
		}
		if (/^\/(api|files)(\/|$)/.test(url.pathname)) return route.abort();
		return route.continue();
	});
	await page.routeWebSocket("**/*", (socket) => socket.onMessage(() => undefined));
}

function observe(page: Page) {
	const requested: string[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (path.endsWith(".js")) requested.push(path);
	});
	return (chunk: string) => requested.some((path) => path.includes(`/assets/${chunk}-`));
}

test("public routes defer protected chunks", async ({ page }) => {
	await isolate(page, false);
	const loaded = observe(page);
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Use web version" })).toBeVisible();
	for (const chunk of ["app-frame", "models-section", "memory-page"]) expect(loaded(chunk)).toBe(false);
	await page.getByRole("link", { name: "Use web version" }).click();
	await expect(page.locator("#sign-in-phone")).toBeVisible();
	await page.locator("#sign-in-phone").fill("13800138000");
	await page.getByRole("link", { name: "Terms of service", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
	await page.getByRole("button", { name: "Back", exact: true }).click();
	await expect(page.locator("#sign-in-phone")).toHaveValue(/138\s*0013\s*8000/);
	await page.goto("/messages/main");
	await expect(page).toHaveURL(/\/sign-in\?next=/);
	expect(loaded("app-frame")).toBe(false);
});

test("models and memory load on demand and retain the chat draft", async ({ page }) => {
	await isolate(page, true);
	const loaded = observe(page);
	await page.setViewportSize({ width: 1280, height: 850 });
	await page.goto("/messages/main");
	const draft = page.getByRole("textbox", { name: "Message Test Bot" });
	await draft.fill("Keep this draft");
	expect(loaded("app-frame")).toBe(true);
	expect(loaded("models-section")).toBe(false);
	expect(loaded("memory-page")).toBe(false);
	const nav = page.getByRole("navigation", { name: "Main navigation" });
	await nav.getByRole("button", { name: "Me", exact: true }).click();
	await page.getByRole("button", { name: "Models", exact: true }).click();
	await expect.poll(() => loaded("models-section")).toBe(true);
	await nav.getByRole("button", { name: "Messages", exact: true }).click();
	await expect(draft).toHaveValue("Keep this draft");
	await nav.getByRole("button", { name: "Memory", exact: true }).click();
	await expect.poll(() => loaded("memory-page")).toBe(true);
	await nav.getByRole("button", { name: "Messages", exact: true }).click();
	await expect(draft).toHaveValue("Keep this draft");
});

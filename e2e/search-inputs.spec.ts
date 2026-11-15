import { expect, test } from "@playwright/test";

// API fixtures stay inside this browser; searching and creating a group never touch a real account.
for (const locale of ["zh-CN", "en"] as const) {
	test(`contact and group search share the left-icon input in ${locale}`, async ({ page }, testInfo) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize(locale === "zh-CN" ? { width: 1280, height: 900 } : { width: 390, height: 844 });
		await page.addInitScript((language) => localStorage.setItem("yonder.locale", language), locale);
		const member = {
			id: "search-person",
			kind: "person",
			handle: "searchtest",
			displayName: "Search test",
			avatarUrl: null,
			bio: null,
			createdAt: "2026-11-15T00:00:00Z",
			version: 1,
		};
		const bot = { ...member, id: "search-bot", kind: "bot", handle: "searchbot", displayName: "Bot" };
		const contacts = [
			{ ...member, id: "contact-ada", handle: "ada", displayName: "Ada" },
			{ ...member, id: "contact-lin", handle: "lin", displayName: "Lin" },
		];
		const searches: string[] = [];
		const groups: unknown[] = [];
		await page.route("**/v1/**", async (route) => {
			const url = new URL(route.request().url());
			if (url.pathname === "/v1/contacts/search") searches.push(url.searchParams.get("q") ?? "");
			if (url.pathname === "/v1/conversations/groups") groups.push(route.request().postDataJSON());
			const json =
				url.pathname === "/v1/auth/refresh"
					? { accessToken: "isolated-search-test" }
					: url.pathname === "/v1/me"
						? { member, bot, hasPassword: true, signInMethods: [], settings: { locale, theme: "light" } }
						: url.pathname === "/v1/contacts"
							? { items: contacts }
							: url.pathname === "/v1/contacts/search"
								? { items: contacts.slice(0, 1) }
								: url.pathname === "/v1/conversations/groups"
									? { id: "created-group", kind: "group", members: [], version: 1 }
									: url.pathname === "/v1/health"
										? { ok: true, version: "isolated-search-test" }
										: { items: [], hasMore: false, nextCursor: null };
			await route.fulfill({ json });
		});
		await page.routeWebSocket("**/v1/realtime*", (socket) => socket.onMessage(() => undefined));
		await page.goto("/contacts/add");
		const contactLabel = locale === "zh-CN" ? "搜索 ID 或手机号" : "Search ID or phone";
		const contactSearch = page.getByRole("searchbox", { name: contactLabel });
		await expect(contactSearch).toHaveAttribute("placeholder", contactLabel);
		await expect(contactSearch.locator("xpath=preceding-sibling::*[1]")).toHaveClass(/lucide-search/);
		await page.screenshot({ path: testInfo.outputPath(`contact-search-${locale}.png`), fullPage: true });
		await contactSearch.fill("@ada");
		expect(searches).toEqual([]);
		await contactSearch.press("Enter");
		await expect(page.getByText("Ada", { exact: true })).toBeVisible();
		expect(searches).toEqual(["ada"]);

		await page.goto("/messages");
		await page.getByRole("button", { name: locale === "zh-CN" ? "发起聊天" : "New chat" }).click();
		await page.getByRole("menuitem", { name: locale === "zh-CN" ? "创建群聊" : "Start group chat" }).click();
		const groupLabel = locale === "zh-CN" ? "搜索联系人" : "Search contacts";
		const groupSearch = page.getByRole("searchbox", { name: groupLabel });
		await expect(groupSearch).toHaveAttribute("placeholder", groupLabel);
		await expect(groupSearch.locator("xpath=preceding-sibling::*[1]")).toHaveClass(/lucide-search/);
		await page.getByRole("checkbox", { name: "Ada" }).check();
		await groupSearch.fill("LIN");
		await expect(page.getByRole("checkbox", { name: "Ada" })).toHaveCount(0);
		await page.getByRole("checkbox", { name: "Lin" }).check();
		await groupSearch.clear();
		await expect(page.getByRole("checkbox", { name: "Ada" })).toBeChecked();
		await expect(page.getByRole("checkbox", { name: "Lin" })).toBeChecked();
		await page.screenshot({ path: testInfo.outputPath(`group-search-${locale}.png`), fullPage: true });
		await page.getByRole("button", { name: locale === "zh-CN" ? "完成" : "Done", exact: true }).click();
		await expect.poll(() => groups).toEqual([{ memberIds: ["contact-ada", "contact-lin"] }]);
	});
}

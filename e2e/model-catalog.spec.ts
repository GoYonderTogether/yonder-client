import { expect, test } from "@playwright/test";

// Isolated response fixtures exercise the shipped client without upstream calls or real accounts.
for (const locale of ["zh-CN", "en"] as const) {
	test(`platform catalog stays separate from provider search in ${locale}`, async ({ page }, testInfo) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize(locale === "zh-CN" ? { width: 1280, height: 900 } : { width: 390, height: 844 });
		await page.addInitScript((language) => localStorage.setItem("yonder.locale", language), locale);
		const member = {
			id: "catalog-person",
			kind: "person",
			handle: "catalogtest",
			displayName: "Catalog test",
			avatarUrl: null,
			bio: null,
			createdAt: "2026-11-15T00:00:00Z",
			version: 1,
		};
		const bot = { ...member, id: "catalog-bot", kind: "bot", handle: "catalogbot", displayName: "Bot" };
		const userProviders = [
			{ id: "fixture-matched", name: "Searchable provider", models: ["fixture-FLASH-1017"] },
			{ id: "fixture-other", name: "Unmatched provider", models: ["fixture-other"] },
		].map((provider) => ({
			...provider,
			scope: "user",
			origin: "cloud",
			baseUrl: "https://fixture-provider.example",
			protocol: "openai",
			enabled: true,
			keyConfigured: true,
			isDefault: false,
		}));
		await page.route("**/v1/**", async (route) => {
			const path = new URL(route.request().url()).pathname;
			const json =
				path === "/v1/auth/refresh"
					? { accessToken: "isolated-catalog-test" }
					: path === "/v1/me"
						? { member, bot, hasPassword: true, signInMethods: [], settings: { locale, theme: "light" } }
						: path === "/v1/providers"
							? {
									items: [
										{
											id: "legacy-platform",
											origin: "cloud",
											scope: "platform",
											name: "RightCode",
											baseUrl: "https://private-upstream.example",
											protocol: "openai",
											models: ["glm-5.3-flash"],
											enabled: true,
											keyConfigured: true,
											isDefault: true,
										},
										...userProviders,
									],
									platformModels: [
										{ id: "mdl-glm", name: "glm-5.3-flash", enabled: true, isDefault: true },
										{ id: "mdl-deepseek", name: "DeepSeek-V4.1-Flash-1017", enabled: true, isDefault: false },
									],
								}
							: path === "/v1/health"
								? { ok: true, version: "isolated-catalog-test" }
								: { items: [] };
			await route.fulfill({ json });
		});
		await page.routeWebSocket("**/v1/realtime*", (socket) => socket.onMessage(() => undefined));
		await page.goto("/me/models");
		const defaults = page
			.getByRole("heading", { name: locale === "zh-CN" ? "主模型" : "Main model", exact: true })
			.locator("..");
		const custom = page
			.getByRole("heading", { name: locale === "zh-CN" ? "自定义供应商" : "Custom provider", exact: true })
			.locator("..");
		const glm = defaults.getByText("glm-5.3-flash", { exact: true });
		const deepseek = defaults.getByText("DeepSeek-V4.1-Flash-1017", { exact: true });
		const matching = custom.getByText("Searchable provider", { exact: true });
		const unmatched = custom.getByText("Unmatched provider", { exact: true });
		await expect(deepseek).toBeVisible();
		await expect(matching).toBeVisible();
		await expect(unmatched).toBeVisible();
		await expect(glm).toBeVisible();
		await expect(glm.locator("..").getByRole("button")).toHaveCount(0);
		await expect(page.getByText(/RightCode|private-upstream|平台供应商|Platform provider/)).toHaveCount(0);
		const searchLabel = locale === "zh-CN" ? "搜索模型或供应商" : "Search models or providers";
		const search = page.getByRole("searchbox", { name: searchLabel });
		await expect(search).toBeVisible();
		await expect(search).toHaveAttribute("placeholder", searchLabel);
		await expect(search.locator("xpath=preceding-sibling::*[1]")).toHaveClass(/lucide-search/);
		await expect(page.getByText(searchLabel, { exact: true })).toHaveCount(0);
		await expect(search.locator("..").locator("svg.lucide-search")).toHaveAttribute("aria-hidden", "true");
		await page.screenshot({ path: testInfo.outputPath(`model-catalog-${locale}.png`), fullPage: true });
		await search.fill("FLASH-1017");
		await expect(matching).toBeVisible();
		await expect(unmatched).toHaveCount(0);
		await expect(glm).toBeVisible();
		await expect(deepseek).toBeVisible();
		await search.fill("RightCode");
		await expect(
			page.getByText(locale === "zh-CN" ? "没有匹配的模型或自定义供应商" : "No matching models or custom providers"),
		).toBeVisible();
		await expect(custom).toHaveCount(0);
		await expect(glm).toBeVisible();
		await expect(deepseek).toBeVisible();
	});
}

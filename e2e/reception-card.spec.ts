import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CACHE_STORAGE_KEY } from "@yonder/ui-data";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

test("a person's card opens their chosen reception Bot", async ({ page }) => {
	await isolateChat(page, { items: [] });
	await page.route("**/v1/members/owner-test", (route) =>
		route.fulfill({
			json: {
				card: {
					kind: "person",
					handle: "owner-test",
					displayName: "测试用户",
					avatarUrl: null,
					bio: null,
					owner: null,
				},
				relation: "none",
				memberId: "owner",
				conversationId: null,
				bots: [{ handle: "chosen-bot", displayName: "接待 Bot", avatarUrl: null, reception: true }],
			},
		}),
	);
	let chosen = "";
	await page.route("**/v1/visits", (route) => {
		chosen = route.request().postDataJSON().handle;
		return route.fulfill({ json: { conversation } });
	});
	await page.goto("/@owner-test");
	const button = page.getByRole("button", { name: "有事找 TA" });
	await expect(button).toBeVisible({ timeout: 20000 });
	await mkdir("../reviews/20261118-bot-closure", { recursive: true });
	await page.screenshot({ path: "../reviews/20261118-bot-closure/reception-card.png" });
	await button.click();
	await expect.poll(() => chosen).toBe("chosen-bot");
	await expect(page).toHaveURL(/\/messages\/chat-route-check/);
});

test("the owner can choose a reception Bot", async ({ page }, info) => {
	await isolateChat(page, { items: [] });
	const main = { ...bot, ownerId: person.id, isDefault: true };
	const second = { ...main, id: "second-bot", displayName: "第二个 Bot", isDefault: false };
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [main, second] } }));
	await page.route("**/v1/me/social/library", (route) =>
		route.fulfill({ json: { folders: [], documents: [], drafts: [] } }),
	);
	let selected = main.id;
	await page.route("**/v1/me/reception", (route) => {
		if (route.request().method() === "PUT") selected = route.request().postDataJSON().botId ?? main.id;
		return route.fulfill({ json: { botId: selected, custom: selected !== main.id } });
	});
	await page.goto("/me/reception");
	const selector = page.getByRole("group", { name: "接待 Bot", exact: true });
	const secondOption = selector.getByRole("radio", { name: second.displayName, exact: true });
	await expect(secondOption).toBeVisible({ timeout: 20000 });
	// Preserve the cache that can still be on disk when reload beats its delayed write.
	const browserCacheKey = `yonder.${CACHE_STORAGE_KEY}`;
	const cached = await page.waitForFunction(
		({ key, botId }) => {
			const raw = localStorage.getItem(key);
			if (!raw) return null;
			const queries = JSON.parse(raw).clientState.queries;
			return queries.some(
				(query: { queryKey: string[]; state: { data?: { botId?: string } } }) =>
					query.queryKey[0] === "reception" && query.state.data?.botId === botId,
			)
				? raw
				: null;
		},
		{ key: browserCacheKey, botId: main.id },
		{ timeout: 8000 },
	);
	const stale = await cached.jsonValue();
	await secondOption.click();
	await expect.poll(() => selected).toBe("second-bot");
	await expect(secondOption).toBeChecked();
	await expect(page.getByText("已保存", { exact: true })).toBeVisible();
	await page.screenshot({ path: info.outputPath("reception-setting.png") });
	if (typeof stale !== "string") throw new Error("Missing persisted reception fixture");
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: browserCacheKey,
		value: stale,
	});
	const [reloaded] = await Promise.all([
		page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/v1/me/reception" && response.request().method() === "GET",
			{ timeout: 8000 },
		),
		page.reload(),
	]);
	expect(await reloaded.json()).toEqual({ botId: second.id, custom: true });
	await expect(secondOption).toBeChecked();
});

import { expect, type Page, test } from "@playwright/test";
import type { MemoryFileRevision, RevertMemoryFileRequest } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const path = "/me/近期.md";
const revision = (version: number, content: string): MemoryFileRevision => ({
	version,
	content,
	by: "bot:chat-bot",
	at: "2026-11-18T00:00:00Z",
});

async function isolateUpdate(page: Page, version: number) {
	await isolateChat(page, {
		items: [
			{
				...message("memory-01", null),
				type: "system",
				system: { event: "memory_updated", changes: [{ path, title: "近期", version, previousVersion: version - 1 }] },
			},
		],
	});
}

async function openUpdate(page: Page) {
	await page.goto(`/messages/${conversation.id}`);
	await page.getByRole("button", { name: "记忆已更新 · 近期" }).click();
	return page.getByRole("dialog", { name: "记忆已更新" });
}

function serveFile(page: Page, version: number) {
	return page.route("**/v1/memory/files/content?*", (route) =>
		route.fulfill({
			json: {
				path,
				title: "近期",
				kind: "recent",
				content: "",
				version,
				updatedAt: "2026-11-18T00:00:00Z",
				updatedBy: "bot:chat-bot",
				updatedByName: null,
				visibility: "private",
				userEdited: false,
				draft: false,
				sources: [],
				links: [],
				limit: { length: 2000, unit: "characters" },
			},
		}),
	);
}

test("chat shows what this reply changed and undoes it", async ({ page }) => {
	await isolateUpdate(page, 2);
	await serveFile(page, 2);
	const applied: RevertMemoryFileRequest[] = [];
	await page.route("**/v1/memory/files/revisions?*", async (route) => {
		expect(new URL(route.request().url()).searchParams.get("path")).toBe(path);
		await route.fulfill({ json: { items: [revision(1, "原来的内容"), revision(2, "Bot 这次改的内容")] } });
	});
	await page.route("**/v1/memory/files/revert", async (route) => {
		expect(route.request().method()).toBe("POST");
		applied.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	const dialog = await openUpdate(page);
	await expect(dialog.getByText("原来的内容")).toBeVisible();
	await expect(dialog.getByText("Bot 这次改的内容")).toBeVisible();
	await page.screenshot({ path: test.info().outputPath("memory-change-desktop.png"), animations: "disabled" });
	await dialog.getByRole("button", { name: "撤回", exact: true }).click();
	await expect(dialog.getByText("已撤回")).toBeVisible();
	expect(applied).toEqual([{ path, version: 1 }]);
	await expect(page.getByRole("button", { name: "已撤回" })).toBeVisible();
});

test("a file changed again after the reply cannot be undone from chat", async ({ page }) => {
	await isolateUpdate(page, 2);
	await serveFile(page, 3);
	await page.route("**/v1/memory/files/revisions?*", (route) =>
		route.fulfill({
			json: { items: [revision(3, "更新的编辑"), revision(1, "原来的内容"), revision(2, "Bot 这次改的内容")] },
		}),
	);
	const dialog = await openUpdate(page);
	await expect(dialog.getByText("之后又改过，请在文件里修改")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "撤回", exact: true })).toHaveCount(0);
	await expect(dialog.getByRole("button", { name: "打开" })).toBeVisible();
});

test.describe("on a phone", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});

	test("chat shows the server error in a bottom sheet", async ({ page }) => {
		await isolateUpdate(page, 2);
		await serveFile(page, 2);
		const available = false;
		await page.route("**/v1/memory/files/revisions?*", async (route) => {
			if (available) await route.fulfill({ json: { items: [revision(1, "原来的内容"), revision(2, "首版内容")] } });
			else
				await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "revision route missing" } } });
		});
		await page.goto(`/messages/${conversation.id}`);
		await page.getByRole("button", { name: "记忆已更新 · 近期" }).click();
		const sheet = page.locator('[data-page-side="bottom"]');
		await expect(sheet.getByRole("alert")).toContainText("revision route missing");
		await page.screenshot({ path: test.info().outputPath("memory-change-mobile.png"), animations: "disabled" });
	});
});

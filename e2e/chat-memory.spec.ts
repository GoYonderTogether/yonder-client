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
		items: [{ ...message("memory-01", null), type: "system", system: { event: "memory_updated", path, version } }],
	});
}

async function openUpdate(page: Page) {
	await page.goto(`/messages/${conversation.id}`);
	await page.getByRole("button", { name: `记忆已更新 · ${path}` }).click();
	return page.getByRole("dialog", { name: "记忆已更新" });
}

test("chat opens the named memory version and confirms restoration over later changes", async ({ page }) => {
	await isolateUpdate(page, 2);
	const applied: RevertMemoryFileRequest[] = [];
	const revisions = [revision(3, "更新的编辑"), revision(1, "原来的内容"), revision(2, "Bot 这次改的内容")];
	await page.route("**/v1/memory/files/revisions?*", async (route) => {
		expect(new URL(route.request().url()).searchParams.get("path")).toBe(path);
		await route.fulfill({ json: { items: revisions } });
	});
	await page.route("**/v1/memory/files/revert", async (route) => {
		expect(route.request().method()).toBe("POST");
		applied.push(route.request().postDataJSON());
		await route.fulfill({ json: { ok: true } });
	});
	const dialog = await openUpdate(page);
	await expect(dialog.getByText(path)).toBeVisible();
	await expect(dialog.getByText("原来的内容")).toBeVisible();
	await expect(dialog.getByText("Bot 这次改的内容")).toBeVisible();
	await expect(dialog.getByText("更新的编辑")).toHaveCount(0);
	await page.screenshot({ path: test.info().outputPath("memory-change-desktop.png"), animations: "disabled" });
	await dialog.getByRole("button", { name: "撤回", exact: true }).click();
	expect(applied).toEqual([]);
	await expect(dialog.getByText("文件还有更新的改动。要将第 1 版恢复为当前版本吗？")).toBeVisible();
	await dialog.getByRole("button", { name: /第 1 版/ }).click();
	await expect(dialog.getByText("记忆已撤回")).toBeVisible();
	expect(applied).toEqual([{ path, version: 1 }]);
});

test("mobile chat shows the server error and cannot revert a first revision", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await isolateUpdate(page, 1);
	let available = false;
	await page.route("**/v1/memory/files/revisions?*", async (route) => {
		if (available) await route.fulfill({ json: { items: [revision(1, "首版内容")] } });
		else
			await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "revision route missing" } } });
	});
	const dialog = await openUpdate(page);
	await expect(dialog.getByRole("alert")).toContainText("revision route missing");
	available = true;
	await dialog.getByRole("button", { name: "重试" }).click();
	await expect(dialog.getByText("首版内容")).toBeVisible();
	await expect(dialog.getByRole("button", { name: "撤回", exact: true })).toBeDisabled();
	await page.screenshot({ path: test.info().outputPath("memory-change-mobile.png"), animations: "disabled" });
});

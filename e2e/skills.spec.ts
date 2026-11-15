import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { SkillSummary } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

// Isolated browser regression; actual model and database acceptance runs separately.
test("skills import whole folders, load references on demand and attach an explicit choice to a message", async ({
	page,
}) => {
	const chat = await isolateChat(page);
	const text =
		"---\nname: meeting-follow-up\ndescription: Extract agreed actions from meeting notes.\n---\nRead references/guide.md.";
	const files: Record<string, string> = { "SKILL.md": text, "references/guide.md": "Keep missing owners unassigned." };
	const platform: SkillSummary = {
		id: "skill-platform",
		name: "meeting-follow-up",
		description: "Extract agreed actions from meeting notes.",
		source: "platform",
		enabled: true,
		revision: "r1",
		canEdit: false,
		files: Object.keys(files),
		updatedAt: "2026-11-15T00:00:00Z",
	};
	let items = [platform];
	let imported: Record<string, string> | undefined;
	const readPaths: string[] = [];
	await page.route("**/v1/skills**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const id = url.pathname.split("/")[3];
		if (request.method() === "POST") {
			imported = request.postDataJSON().files;
			const added = { ...platform, id: "skill-user", source: "user" as const, canEdit: true };
			items = [...items, added];
			return route.fulfill({ json: added });
		}
		const entry = items.find((item) => item.id === id);
		if (request.method() === "PATCH" && entry) {
			Object.assign(entry, request.postDataJSON());
			return route.fulfill({ json: entry });
		}
		if (request.method() === "DELETE") {
			items = items.filter((item) => item.id !== id);
			return route.fulfill({ json: { ok: true } });
		}
		if (url.pathname.endsWith("/files")) {
			const path = url.searchParams.get("path") ?? "";
			readPaths.push(path);
			return route.fulfill({ json: { id, revision: "r1", path, content: files[path] } });
		}
		return route.fulfill({ json: entry ?? { items } });
	});
	const folder = await mkdtemp(join(tmpdir(), "yonder-skill-import-"));
	try {
		await mkdir(join(folder, "references"));
		await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(folder, path), content)));
		await page.goto("/me/skills");
		await expect(page.getByText("meeting-follow-up", { exact: true })).toBeVisible();
		expect(readPaths).toEqual([]);
		await page.getByRole("button", { name: "meeting-follow-up", exact: false }).click();
		await expect(page.locator("pre")).toContainText(text);
		await expect(page.getByRole("button", { name: "删除技能" })).toHaveCount(0);
		await page.getByRole("button", { name: "技能文件: SKILL.md" }).click();
		await page.getByRole("option", { name: "references/guide.md" }).click();
		await expect(page.locator("pre")).toContainText(files["references/guide.md"] ?? "");
		expect(readPaths).toContain("references/guide.md");
		await page.goto("/me/skills/import");
		await page.locator('input[aria-label="选择文件夹"]').setInputFiles(folder);
		await expect(page.getByRole("status")).toContainText("已选择 2 个文件");
		await page.getByRole("button", { name: "导入技能", exact: true }).click();
		await expect(page.getByRole("button", { name: "删除技能" })).toBeVisible();
		expect(imported).toEqual(files);
		await page.goto("/messages/main");
		const input = page.getByRole("textbox", { name: "对 界面验收 BOT 说点什么" });
		await input.fill("/meeting-follow-up");
		await page.getByRole("option").filter({ hasText: "我的技能" }).click();
		await input.press("End");
		await input.pressSequentially("请整理这份会议纪要中的后续事项。");
		await page.getByRole("button", { name: "发送", exact: true }).click();
		await expect.poll(() => chat.sent.length).toBe(1);
		expect(chat.sent[0]).toMatchObject({ skillIds: ["skill-user"] });
		await expect(input).toHaveValue("");
		await expect(page.getByRole("listbox")).toHaveCount(0);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/me/skills");
		await expect(page.getByRole("searchbox", { name: "搜索技能" })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

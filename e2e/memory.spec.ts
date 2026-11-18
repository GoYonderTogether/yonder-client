import { devices, expect, type Page, type TestInfo, test } from "@playwright/test";
import type { MemoryDayPage, MemoryFileContent, MemoryFileRevision } from "@yonder/protocol";
import { isolateChat } from "./chat-fixture.ts";

const at = "2026-11-18T09:30:00Z";
const notePath = "/sources/会议/周会.md";
const impressionPath = "/me/印象.md";
const recentPath = "/me/近期.md";

const timeline: MemoryDayPage = {
	items: [
		{
			date: "2026-11-18",
			state: "ready",
			failure: null,
			digest: { steps: null, places: 0, photos: 0 },
			digestPath: null,
			blocks: [
				{
					type: "entry",
					entry: {
						id: "weekly",
						at,
						endsAt: null,
						kind: "voice",
						size: "note",
						activity: null,
						title: "会后决定",
						text: null,
						body: "接口在周五完成。",
						place: null,
						media: [],
						mediaCount: 0,
						materials: [],
						tags: [],
						people: [],
						quote: null,
						links: [],
						visibility: "private",
						weight: 2,
						sources: [{ kind: "meeting", title: "星期三周会", count: 1, target: null }],
						deletable: true,
					},
				},
			],
		},
	],
	nextCursor: null,
};

async function memoryApi(page: Page) {
	await isolateChat(page, { items: [] });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const file = (path: string, title: string, kind: MemoryFileContent["kind"], content: string): MemoryFileContent => ({
		path,
		title,
		kind,
		content,
		version: 1,
		updatedAt: at,
		visibility: "private",
		updatedBy: "bot:weekly",
		updatedByName: "小助手",
		userEdited: false,
		draft: false,
		sources: [],
		links: [],
		limit: { length: path.startsWith("/me/") ? 3000 : 65536, unit: path.startsWith("/me/") ? "characters" : "bytes" },
	});
	const note = file(notePath, "周会纪要", "archive", "核对发布窗口。");
	note.version = 2;
	note.sources = [{ eventId: "mev_1", connector: "meeting", title: "星期三周会", meetingId: "meeting-1" }];
	const records: Record<string, MemoryFileContent> = {
		[impressionPath]: file(impressionPath, "印象", "impression", "偏好 **直接说明**。"),
		[recentPath]: file(recentPath, "近期", "recent", "本周核对归档。"),
		[notePath]: note,
	};
	const revisions: MemoryFileRevision[] = [
		{ version: 2, content: note.content, by: "bot:weekly", at },
		{ version: 1, content: "确认发布窗口。", by: "router", at },
	];
	const writes: { method: string; body: unknown }[] = [];
	let unavailable = false;
	await page.route("**/v1/memory/**", async (route) => {
		const request = route.request();
		const method = request.method();
		const url = new URL(request.url());
		const path = url.searchParams.get("path") ?? "";
		if (url.pathname === "/v1/memory/days") {
			await route.fulfill({ json: timeline });
			return;
		}
		if (unavailable) {
			await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "记忆文件服务尚未接入" } } });
			return;
		}
		if (method === "GET") {
			const json = url.pathname.endsWith("/revisions")
				? { items: revisions }
				: url.pathname.endsWith("/content")
					? records[path]
					: { items: Object.values(records) };
			await route.fulfill({ json });
			return;
		}
		const body = method === "DELETE" ? { path } : request.postDataJSON();
		writes.push({ method, body });
		if (method === "PUT") {
			note.content = body.content;
			note.userEdited = true;
			note.updatedBy = "user";
		} else if (method === "PATCH" && url.pathname.endsWith("/protection")) {
			note.userEdited = false;
		} else if (method === "PATCH") {
			note.visibility = body.visibility;
		} else if (method === "POST") {
			note.content = revisions.find((row) => row.version === body.version)?.content ?? "";
		} else if (method === "DELETE") {
			delete records[path];
		}
		if (method !== "DELETE") {
			note.version += 1;
			revisions.unshift({ version: note.version, content: note.content, by: "user", at });
		}
		await route.fulfill({ json: { ok: true } });
	});
	return { writes, disableFiles: () => (unavailable = true) };
}

async function exerciseMemory(page: Page, testInfo: TestInfo, phone: boolean) {
	const api = await memoryApi(page);
	await page.goto("/memory");
	await expect(page.locator(`[data-layout-mode="${phone ? "mobile" : "wide"}"]`)).toBeVisible();
	// The timeline is the default section; a private card carries no visibility mark.
	await expect(page.getByRole("radio", { name: "时间线" })).toBeChecked();
	await expect(page.getByText("来自 会议")).toBeVisible();
	await expect(page.getByRole("img", { name: "私人" })).toHaveCount(0);
	await page.getByRole("button", { name: /会后决定/ }).click();
	await expect(page.getByText("接口在周五完成。")).toBeVisible();

	await page.getByRole("radio", { name: "了解" }).click();
	await expect(page).toHaveURL(/\/memory\/about$/);
	const impression = page.getByRole("article", { name: "印象" });
	await expect(impression.locator("strong").getByText("直接说明")).toBeVisible();
	await expect(impression.getByText(/小助手 · /)).toBeVisible();
	await impression.getByRole("button", { name: "编辑" }).click();
	await expect(impression.getByText("12 / 3,000")).toBeVisible();
	await impression.getByRole("button", { name: "取消" }).click();

	await page.getByRole("radio", { name: "文件" }).click();
	await expect(page.getByRole("heading", { name: "来源" })).toBeVisible();
	await page.getByRole("button", { name: /周会纪要/ }).click();
	await expect(page).toHaveURL(/\/memory\/files\/.+/);
	const reader = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "周会纪要" }) });
	await expect(reader.getByRole("button", { name: "星期三周会" })).toBeVisible();
	await reader.getByRole("button", { name: "编辑" }).click();
	await reader.getByRole("textbox", { name: "正文" }).fill("发布窗口已确认。");
	await reader.getByRole("button", { name: "保存" }).click();
	await expect(reader.getByText("发布窗口已确认。", { exact: true })).toBeVisible();
	expect(api.writes.at(-1)).toEqual({
		method: "PUT",
		body: { path: notePath, content: "发布窗口已确认。", expectedVersion: 2 },
	});
	await expect(reader.getByRole("button", { name: "你改过" })).toBeVisible();

	await reader.getByRole("button", { name: "可见级别: 私人" }).click();
	await reader.getByRole("menuitemradio", { name: "公开" }).click();
	await expect(reader.getByText("公开后，别人通过你的 Bot 能读到这份内容。")).toBeVisible();
	expect(api.writes).toHaveLength(1);
	await reader.getByRole("button", { name: "公开", exact: true }).click();
	await expect(reader.getByRole("button", { name: "可见级别: 公开" })).toBeVisible();
	expect(api.writes.at(-1)).toEqual({ method: "PATCH", body: { path: notePath, visibility: "public" } });

	await reader.getByRole("button", { name: "历史" }).click();
	const history = page.getByRole("dialog", { name: "周会纪要 的历史" });
	await history.getByRole("button", { name: /第 2 版/ }).click();
	const version = page.getByRole("dialog", { name: "第 2 版" });
	await expect(version.getByText("核对发布窗口。")).toBeVisible();
	if (!phone) await page.screenshot({ path: testInfo.outputPath("memory-history.png") });
	await version.getByRole("button", { name: "恢复到这一版" }).click();
	await expect(version).toHaveCount(0);
	expect(api.writes.at(-1)).toEqual({ method: "POST", body: { path: notePath, version: 2 } });

	await reader.getByRole("button", { name: "删除" }).click();
	await reader.getByRole("button", { name: "确认删除" }).click();
	await expect(page).toHaveURL(/\/memory\/files$/);
	expect(api.writes.at(-1)).toEqual({ method: "DELETE", body: { path: notePath } });

	api.disableFiles();
	await page.reload();
	await expect(page.getByRole("alert").getByText("记忆文件服务尚未接入")).toBeVisible();
	if (phone) await page.screenshot({ path: testInfo.outputPath("memory-file-error.png") });
}

test("opens, edits, publishes, reverts and deletes memory on desktop", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await exerciseMemory(page, testInfo, false);
});

test.describe("memory on a phone", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	test.use(phone);
	test("keeps the owner flow and missing route errors visible on mobile", async ({ page }, testInfo) => {
		await exerciseMemory(page, testInfo, true);
	});
});

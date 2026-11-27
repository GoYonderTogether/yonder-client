import { devices, expect, type Page, type TestInfo, test } from "@playwright/test";
import type { MeetingRecord, MemoryDayPage, MemoryFileContent, MemoryFileRevision } from "@yonder/protocol";
import { memoryFileRoute, memoryFolderRoute } from "../apps/web/src/pages/memory/memory-view.ts";
import { conversation, isolateChat } from "./chat-fixture.ts";

// The static fixture serves extension-bearing deep links through a route intercept.
test.use({ serviceWorkers: "block" });

const at = "2026-11-18T09:30:00Z";
const notePath = "/sources/recordings/周会.md";
const nestedNotePath = "/notes/meetings/weekly/decisions.md";
const digestPath = "/digests/day/2026-11-18.md";
const folders = [
	{ path: "/sources/recordings", displayName: "录音" },
	{ path: "/notes", displayName: "笔记" },
	{ path: "/notes/meetings", displayName: "纪要" },
	{ path: "/notes/meetings/weekly", displayName: "每周" },
	{ path: "/digests", displayName: "总结" },
	{ path: "/digests/day", displayName: "日总结" },
];
const impressionPath = "/me/impression.md";
const recentPath = "/me/recent.md";
const meetingId = "meeting-1";
const attachmentText = "归档文件的正文只在阅读器内显示。";
const meeting: MeetingRecord = {
	id: meetingId,
	clientRecordingId: "memory-test-recording",
	conversationId: conversation.id,
	title: "星期三周会",
	sourceState: "ended",
	startedAt: Date.parse(at),
	endedAt: Date.parse(at) + 60_000,
	durationMs: 60_000,
	uploadedDurationMs: 60_000,
	status: "completed",
	segments: [],
	batches: [],
	transcript: "00:03 发言人 1：验收项目归档。",
	summary: "录音笔记已经交给项目负责人确认。",
	summaryRunId: null,
	resultMessageId: null,
	failedStage: null,
	errorCode: null,
};

const timeline: MemoryDayPage = {
	items: [
		{
			date: "2026-11-18",
			state: "ready",
			failure: null,
			digest: { steps: null, places: 0, photos: 0 },
			digestPath,
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
						materials: [
							{
								id: "material-1",
								kind: "doc",
								label: "归档资料",
								detail: null,
								attachment: {
									id: "memory-records",
									kind: "file",
									name: "归档资料.txt",
									mimeType: "text/plain",
									size: 64,
								},
								url: null,
							},
						],
						tags: [],
						people: [],
						quote: null,
						links: [],
						visibility: "private",
						weight: 2,
						sources: [{ kind: "meeting", title: meeting.title, count: 1, target: null, meetingId }],
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
	await page.route("**/v1/meetings/meeting-1", (route) => route.fulfill({ json: meeting }));
	await page.route("**/v1/attachments/memory-records/content", (route) =>
		route.fulfill({ contentType: "text/plain; charset=utf-8", body: attachmentText }),
	);
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
	note.sources = [{ eventId: "mev_1", connector: "meeting", title: meeting.title, meetingId }];
	const records: Record<string, MemoryFileContent> = {
		[impressionPath]: file(impressionPath, "印象", "impression", "偏好 **直接说明**。"),
		[recentPath]: file(recentPath, "近期", "recent", "本周核对归档。"),
		[notePath]: note,
		[nestedNotePath]: file(nestedNotePath, "项目决定", "note", "先确认发布时间。"),
		[digestPath]: file(digestPath, "日总结", "digest", "接口约定和发布窗口已记录。"),
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
			const json =
				url.pathname === "/v1/memory/folders"
					? { items: folders }
					: url.pathname.endsWith("/revisions")
						? { items: revisions }
						: url.pathname.endsWith("/content")
							? records[path]
							: { items: Object.values(records), folders };
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
	const privateProfile = page.getByRole("button", { name: "AI 对我的了解" });
	await expect(privateProfile).toBeVisible();
	await expect(page.getByRole("region", { name: "我的名片" })).toHaveCount(0);
	// Phones see the latest entries on the home and open the whole timeline from there; a wide
	// window shows the timeline beside the column.
	if (phone) {
		await expect(page.getByRole("button", { name: /会后决定/ })).toBeVisible();
		await page.getByRole("button", { name: "查看全部时间线" }).click();
		await expect(page).toHaveURL(/\/memory\/timeline$/);
	}
	// A private card carries no visibility mark.
	await expect(page.getByRole("img", { name: "私人" })).toHaveCount(0);
	await page.getByRole("button", { name: /会后决定/ }).click();
	await expect(page.getByText("接口在周五完成。")).toBeVisible();
	const pane = phone ? page.locator('[data-page-layer="side"]') : page.locator("[data-detail-pane]");
	const closePane = () => pane.getByRole("button", { name: phone ? "返回" : "关闭全部", exact: true }).click();
	await page.getByRole("button", { name: "当天总结" }).click();
	await expect(pane.getByText("接口约定和发布窗口已记录。")).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath(phone ? "phone-memory-digest.png" : "desktop-memory-digest.png") });
	await closePane();
	await expect(pane.getByText("接口约定和发布窗口已记录。")).toHaveCount(0);
	await page.getByRole("button", { name: "归档资料", exact: true }).click();
	await expect(pane.getByText(attachmentText)).toBeVisible();
	await page.screenshot({
		path: testInfo.outputPath(phone ? "phone-memory-material.png" : "desktop-memory-material.png"),
	});
	await closePane();
	await expect(pane.getByText(attachmentText)).toHaveCount(0);
	await page.getByRole("button", { name: meeting.title, exact: true }).click();
	await expect(pane.getByText(meeting.summary ?? "")).toBeVisible();
	await page.screenshot({
		path: testInfo.outputPath(phone ? "phone-memory-meeting.png" : "desktop-memory-meeting.png"),
	});
	await closePane();
	await expect(pane.locator("[data-recording-reader]")).toHaveCount(0);

	// The owner profile renders the Markdown directly; its canonical editable file URL still works.
	if (phone) await page.goto("/memory");
	await privateProfile.click();
	await expect(page).toHaveURL(/\/memory\/about$/);
	await expect(page.getByRole("radio", { name: "印象" })).toBeChecked();
	await expect(page.locator("strong").getByText("直接说明")).toBeVisible();
	const fileUrl = memoryFileRoute(impressionPath);
	// The test static server treats the .md URL as an asset. Serve the real app shell there.
	await page.route(fileUrl, async (route) =>
		route.fulfill({ response: await route.fetch({ url: new URL("/memory", route.request().url()).href }) }),
	);
	await page.goto(fileUrl);
	await expect(page).toHaveURL(/\/memory\/files\/.+/);
	const impression = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "印象" }) });
	await expect(impression.locator("strong").getByText("直接说明")).toBeVisible();
	await impression.getByRole("button", { name: "编辑" }).click();
	await expect(impression.getByText("12 / 3,000")).toBeVisible();
	await impression.getByRole("button", { name: "取消" }).click();

	await page.goto("/memory");
	const recordings = page.getByRole("button", { name: /^录音/ });
	await recordings.click();
	const directoryRoute = /\/memory\/g\/.+$/;
	await expect(page).toHaveURL(phone ? directoryRoute : /\/memory$/);
	if (!phone) {
		await expect(recordings).toHaveAttribute("aria-expanded", "true");
		await expect(page.getByRole("main").getByRole("button", { name: /会后决定/ })).toBeVisible();
	}
	await page.getByRole("button", { name: /周会纪要/ }).click();
	await expect(page).toHaveURL(phone ? directoryRoute : /\/memory\/files\/.+$/);
	const reader = (phone ? pane : page.getByRole("main"))
		.getByRole("article")
		.filter({ has: page.getByRole("heading", { name: "周会纪要" }) });
	await expect(reader.getByRole("button", { name: "星期三周会" })).toBeVisible();
	await reader.getByRole("button", { name: "编辑" }).click();
	const editor = reader.getByRole("textbox", { name: "正文" });
	await editor.fill("发布窗口已确认。");
	if (phone) await closePane();
	else await page.getByRole("button", { name: "返回", exact: true }).click();
	const discard = page.getByRole("dialog", { name: "放弃更改", exact: true });
	await discard.getByRole("button", { name: "取消", exact: true }).click();
	await expect(editor).toHaveValue("发布窗口已确认。");
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

	// Version history and restore are gone from the app (2026-11-24, Meta Muse as the reference).
	await expect(reader.getByRole("button", { name: "历史" })).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath(phone ? "phone-memory-file.png" : "desktop-memory-file.png") });

	await reader.getByRole("button", { name: "删除" }).click();
	await reader.getByRole("button", { name: "确认删除" }).click();
	await expect(page).toHaveURL(directoryRoute);
	await expect(reader).toHaveCount(0);
	expect(api.writes.at(-1)).toEqual({ method: "DELETE", body: { path: notePath } });

	api.disableFiles();
	await page.reload();
	await expect(page.getByRole("alert").getByText("没找到。").first()).toBeVisible();
	if (phone) await page.screenshot({ path: testInfo.outputPath("memory-file-error.png") });
}

test("opens, edits, publishes and deletes memory on desktop", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await exerciseMemory(page, testInfo, false);
});

test("expands nested notes in the wide sidebar while keeping the current detail", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await memoryApi(page);
	await page.goto("/memory");
	const main = page.getByRole("main");
	const notes = page.getByRole("button", { name: /^笔记/ });
	const folder = page.getByRole("button", { name: "纪要", exact: true });
	const subfolder = page.getByRole("button", { name: "每周", exact: true });
	const note = page.getByRole("button", { name: /项目决定/ });
	await expect(notes).toHaveAttribute("aria-expanded", "false");
	await notes.click();
	await expect(note).toHaveCount(0);
	await folder.click();
	await subfolder.click();
	await expect(page).toHaveURL(/\/memory$/);
	await expect(main.getByRole("button", { name: /会后决定/ })).toBeVisible();
	await note.click();
	await expect(main.getByRole("heading", { name: "项目决定" })).toBeVisible();
	await expect(page).toHaveURL(new URL(memoryFileRoute(nestedNotePath), page.url()).href);
	await notes.click();
	await expect(note).toHaveCount(0);
	await expect(main.getByRole("heading", { name: "项目决定" })).toBeVisible();
	await notes.click();
	await expect(note).toBeVisible();

	await page.goto(memoryFolderRoute("notes", "meetings/weekly"));
	await expect(main.getByRole("button", { name: /会后决定/ })).toBeVisible();
	await expect(note).toBeVisible();
	await expect(main.getByRole("button", { name: /项目决定/ })).toHaveCount(0);
	await page.getByRole("button", { name: /^总结/ }).click();
	await page.getByRole("button", { name: "日总结", exact: true }).click();
	await page.getByRole("button", { name: "日总结", exact: true }).and(page.getByTitle("日总结")).click();
	await expect(main.getByRole("heading", { name: "日总结" })).toBeVisible();
});

test.describe("memory on a phone", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	test.use(phone);
	test("keeps the owner flow and missing route errors visible on mobile", async ({ page }, testInfo) => {
		await exerciseMemory(page, testInfo, true);
	});
});

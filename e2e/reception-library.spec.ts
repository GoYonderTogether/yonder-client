import { devices, expect, type Page, test } from "@playwright/test";
import type { SocialLibrary, SocialLibraryChange } from "@yonder/protocol";
import { bot, isolateChat, person } from "./chat-fixture.ts";

const updatedAt = "2026-11-20T03:00:00.000Z";
const receptionBot = { ...bot, displayName: "栗子", botRoleLabel: "主助理", avatarColor: "4" };
const bots = [
	receptionBot,
	{
		...bot,
		id: "greeter",
		handle: "greeter",
		displayName: "青屿",
		botRoleLabel: "外部接待",
		isDefault: false,
		avatarColor: "2",
	},
	{
		...bot,
		id: "researcher",
		handle: "researcher",
		displayName: "河洛",
		botRoleLabel: "研究与资料",
		isDefault: false,
		avatarColor: "5",
	},
	{
		...bot,
		id: "helper",
		handle: "helper",
		displayName: "浮光",
		botRoleLabel: "项目协作",
		isDefault: false,
		avatarColor: "1",
	},
];

async function isolateLibrary(page: Page, large = false) {
	await isolateChat(page, { items: [] });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, displayName: "林然" },
				bot: receptionBot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: bots } }));
	await page.route("**/v1/me/reception", (route) => route.fulfill({ json: { botId: "greeter", custom: true } }));
	const library: SocialLibrary = {
		folders: [
			{ id: "visits", name: "来访指南", parentFolderId: null },
			{ id: "partnerships", name: "合作咨询", parentFolderId: null },
		],
		documents: [
			{
				id: "hours",
				folderId: "visits",
				title: "来访时间与预约",
				updatedAt,
				content:
					"工作室在工作日 **10:00–18:00** 接待来访。\n\n### 如何预约\n\n- 请提前一天说明来访人数和希望到访的时段。\n- 临时改期时，直接回复预约消息即可。\n\n到达后请在一楼等候，接待同事会来接你。",
			},
			{ id: "directions", folderId: "visits", title: "到达方式", updatedAt, content: "地铁站步行约五分钟。" },
			{
				id: "proposal",
				folderId: "partnerships",
				title: "商务合作流程",
				updatedAt,
				content: "请说明你的项目和合作时间。",
			},
			{ id: "general", folderId: null, title: "共用对外资料", updatedAt, content: "这里保留原有对外资料。" },
		],
		drafts: [
			{
				id: "one",
				createdAt: updatedAt,
				content: "周末来访安排\n\n周六上午 10 点至 12 点可以预约参观。请在周五 18 点前提交预约。",
			},
			{ id: "two", createdAt: updatedAt, content: "活动报名方式\n\n来访者可以先留下人数和联系方式。" },
		],
	};
	if (large) {
		library.folders.push(
			{ id: "access", name: "场馆交通", parentFolderId: "visits" },
			{ id: "assistance", name: "现场协助", parentFolderId: "access" },
		);
		library.documents.push(
			{
				id: "parking",
				folderId: "access",
				title: "访客出入与停车申请",
				updatedAt: "2026-11-21T03:00:00.000Z",
				content: "携带物品较多时，可从南门无障碍电梯直达二楼接待处。访客停车需要提前登记车牌。",
			},
			...Array.from({ length: 124 }, (_, index) => ({
				id: `event-${index + 1}`,
				folderId: null,
				title: `活动接待手册第 ${index + 1} 期`,
				updatedAt,
				content: `参加第 ${index + 1} 期活动的访客可在前台签到，团队请提前联系现场协调员。`,
			})),
		);
	}
	const changes: SocialLibraryChange[] = [];
	await page.route("**/v1/me/social/library", async (route) => {
		if (route.request().method() === "POST") {
			const change = route.request().postDataJSON() as SocialLibraryChange;
			changes.push(change);
			if (change.kind === "save_folder") {
				const folder = library.folders.find((item) => item.id === change.id);
				if (folder) {
					folder.name = change.name;
					if (change.parentFolderId !== undefined) folder.parentFolderId = change.parentFolderId;
				} else {
					library.folders.push({ id: "new-folder", name: change.name, parentFolderId: change.parentFolderId ?? null });
				}
			} else if (change.kind === "remove_folder") {
				const parentFolderId = library.folders.find((item) => item.id === change.id)?.parentFolderId ?? null;
				library.folders = library.folders.filter((item) => item.id !== change.id);
				for (const folder of library.folders) {
					if (folder.parentFolderId === change.id) folder.parentFolderId = parentFolderId;
				}
				for (const document of library.documents) {
					if (document.folderId === change.id) document.folderId = parentFolderId;
				}
			} else if (change.kind === "save_document") {
				const data = { folderId: change.folderId, title: change.title, content: change.content, updatedAt };
				const document = library.documents.find((item) => item.id === change.id);
				if (document) Object.assign(document, data);
				else library.documents.push({ id: "new-document", ...data });
			} else if (change.kind === "remove_document") {
				library.documents = library.documents.filter((item) => item.id !== change.id);
			} else {
				const draft = library.drafts.find((item) => item.id === change.id);
				if (change.approve && draft)
					library.documents.push({
						id: "approved-draft",
						content: draft.content,
						folderId: change.folderId,
						title: change.title,
						updatedAt,
					});
				library.drafts = library.drafts.filter((item) => item.id !== change.id);
			}
		}
		await route.fulfill({ json: library });
	});
	return changes;
}

test("desktop reception opens folders and documents beside the directory and persists library edits", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const changes = await isolateLibrary(page);
	await page.goto("/me/reception");
	await expect(page.getByRole("radio", { name: "青屿" })).toBeChecked();
	await page.getByRole("button", { name: /^来访指南/ }).click();
	await expect(page).toHaveURL(/\/me\/reception\/folder\/visits$/);
	await page.getByRole("button", { name: /^来访时间与预约/ }).click();
	const layer = page.locator('[data-page-layer="/me/reception/folder/visits/hours"]');
	await expect(layer.getByRole("heading", { name: "来访时间与预约" })).toBeVisible();
	await expect(layer.locator("[data-reception-directory]").getByRole("button", { name: /^到达方式/ })).toBeVisible();
	await expect(layer.getByRole("button", { name: "编辑资料" })).toBeVisible();
	await page.mouse.move(1395, 870);
	await page.screenshot({ path: info.outputPath("reception-desktop.png"), animations: "disabled" });
	await page.reload();
	const back = page.getByRole("button", { name: "返回", exact: true });
	await back.click();
	await expect(page).toHaveURL(/\/folder\/visits$/);
	await page.getByRole("button", { name: "重命名或移动文件夹" }).click();
	await page.getByRole("textbox", { name: "文件夹名称" }).fill("参观指南");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page.getByRole("heading", { name: "参观指南" })).toBeVisible();
	await back.click();
	await page.getByRole("button", { name: "新建文件夹" }).click();
	await page.getByRole("textbox", { name: "文件夹名称" }).fill("常见问题");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page.getByRole("button", { name: /^常见问题/ })).toBeVisible();
	await page.getByRole("button", { name: /^常见问题/ }).click();
	const newFolder = page.locator('[data-page-layer="/me/reception/folder/new-folder"]:not([inert])');
	await newFolder.getByRole("button", { name: "新建资料" }).click();
	await page.getByRole("textbox", { name: "标题" }).fill("接待联系渠道");
	await page.getByRole("textbox", { name: "正文" }).fill("请通过原预约渠道联系。");
	await page.getByRole("button", { name: "保存并公开" }).click();
	await page.getByRole("button", { name: /^接待联系渠道/ }).click();
	await page
		.locator('[data-page-layer="/me/reception/folder/new-folder/new-document"]:not([inert])')
		.getByRole("button", { name: "编辑资料" })
		.click();
	await page.getByRole("button", { name: /^存放位置/ }).click();
	await page.getByRole("option", { name: "参观指南" }).click();
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page).toHaveURL(/\/folder\/new-folder$/);
	await page.getByRole("button", { name: /^参观指南/ }).click();
	await page.getByRole("button", { name: /^接待联系渠道/ }).click();
	await expect(page.getByText("请通过原预约渠道联系。", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "删除资料" }).click();
	await page.getByRole("dialog", { name: "删除资料" }).getByRole("button", { name: "删除资料" }).click();
	await expect(page).toHaveURL(/\/folder\/visits$/);
	await expect(page.getByRole("button", { name: /^接待联系渠道/ })).toHaveCount(0);
	expect(changes.map(({ kind }) => kind)).toEqual([
		"save_folder",
		"save_folder",
		"save_document",
		"save_document",
		"remove_document",
	]);
});

test("narrow desktop keeps hierarchy on direct links and preserves contents when deleting a folder", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 820, height: 850 });
	const changes = await isolateLibrary(page, true);
	await page.goto("/me/reception");
	await page.getByRole("button", { name: /^全部资料.*129/ }).click();
	await expect(page.getByRole("button", { name: /^活动接待手册第 / })).toHaveCount(15);
	await page.getByRole("button", { name: "显示更多" }).click();
	await expect(page.getByRole("button", { name: /^活动接待手册第 / })).toHaveCount(35);
	await page.getByRole("button", { name: /^访客出入与停车申请/ }).click();
	await expect(page).toHaveURL(/\/reception\/all\/parking$/);
	await page.goBack();
	await expect(page).toHaveURL(/\/reception\/all$/);
	await expect(page.getByRole("button", { name: /^活动接待手册第 / })).toHaveCount(35);
	await page.goto("/me/reception/folder/visits/folder/access/parking");
	await page.reload();
	await expect(page.getByRole("heading", { name: "访客出入与停车申请" })).toBeVisible();
	const trail = page.getByRole("navigation", { name: "文件夹路径" });
	await expect(trail).toContainText("来访指南");
	await expect(trail).toContainText("场馆交通");
	await expect(page.locator("[data-reception-directory]")).toHaveCount(0);
	await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBe(820);
	await page.screenshot({ path: info.outputPath("reception-narrow-nested.png"), animations: "disabled" });
	const back = page.getByRole("button", { name: "返回", exact: true });
	await back.click();
	await expect(page).toHaveURL(/\/reception\/folder\/visits\/folder\/access$/);
	await page.screenshot({ path: info.outputPath("reception-narrow-folder.png"), animations: "disabled" });
	await page.getByRole("button", { name: "删除文件夹" }).click();
	const confirm = page.getByRole("dialog", { name: "删除文件夹" });
	await expect(confirm).toContainText("其中的资料和子文件夹会移到「来访指南」");
	await confirm.getByRole("button", { name: "删除文件夹" }).click();
	await expect(page).toHaveURL(/\/reception\/folder\/visits$/);
	await expect(page.getByRole("button", { name: /^访客出入与停车申请/ })).toBeVisible();
	await page.getByRole("button", { name: /^现场协助/ }).click();
	await expect(page).toHaveURL(/\/folder\/visits\/folder\/assistance$/);
	await page.getByRole("button", { name: "重命名或移动文件夹" }).click();
	await page.getByRole("button", { name: /^存放位置/ }).click();
	await page.getByRole("option", { name: "资料库根目录" }).click();
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page).toHaveURL(/\/reception\/folder\/visits$/);
	await back.click();
	await page.getByRole("button", { name: /^现场协助/ }).click();
	const parent = page.locator('[data-page-layer="/me/reception/folder/assistance"]:not([inert])');
	await parent.getByRole("button", { name: "新建文件夹" }).click();
	await page.getByRole("textbox", { name: "文件夹名称" }).fill("活动入口");
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await page.getByRole("button", { name: /^活动入口/ }).click();
	await expect(page).toHaveURL(/\/reception\/folder\/assistance\/folder\/new-folder$/);
	expect(changes).toEqual([
		{ kind: "remove_folder", id: "access" },
		{ kind: "save_folder", id: "assistance", name: "现场协助", parentFolderId: null },
		{ kind: "save_folder", name: "活动入口", parentFolderId: "assistance" },
	]);
});

test.describe("phone reception library", () => {
	test.use({
		userAgent: devices["iPhone 15"].userAgent,
		viewport: devices["iPhone 15"].viewport,
		isMobile: true,
		hasTouch: true,
	});

	test("searches the body of a nested document in a 129-document library and returns to the search", async ({
		page,
	}, info) => {
		await isolateLibrary(page, true);
		await page.goto("/me/reception");
		await expect(page.getByRole("button", { name: /^全部资料.*129/ })).toBeVisible();
		await expect(page.getByRole("heading", { name: "最近更新" })).toBeVisible();
		await expect(page.getByRole("button", { name: /^活动接待手册第 / })).toHaveCount(0);
		await page.screenshot({ path: info.outputPath("reception-mobile-library-129.png"), animations: "disabled" });
		const search = page.getByRole("searchbox", { name: "搜索资料标题或正文" });
		await search.fill("南门无障碍电梯");
		await expect(page.getByRole("heading", { name: "1 条匹配" })).toBeVisible();
		const result = page.getByRole("button", { name: /访客出入与停车申请.*来访指南 › 场馆交通/ });
		await expect(result).toBeVisible();
		await page.screenshot({ path: info.outputPath("reception-mobile-search.png"), animations: "disabled" });
		await result.click();
		await expect(page.getByRole("heading", { name: "访客出入与停车申请" })).toBeVisible();
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(search).toHaveValue("南门无障碍电梯");
		await expect(result).toBeVisible();
		await search.fill("活动接待手册第 124 期");
		await expect(page.getByRole("button", { name: /活动接待手册第 124 期.*资料库根目录/ })).toBeVisible();
	});

	test("manages nested folders and documents by touch on a phone", async ({ page }, info) => {
		const changes = await isolateLibrary(page);
		await page.goto("/me/reception");
		await page.getByRole("button", { name: /^来访指南/ }).tap();
		const parent = page.locator('[data-page-layer="/me/reception/folder/visits"]:not([inert])');
		await parent.getByRole("button", { name: "新建文件夹" }).tap();
		await page.getByRole("textbox", { name: "文件夹名称" }).fill("展厅接待");
		await page.getByRole("button", { name: "保存", exact: true }).tap();
		await parent.getByRole("button", { name: /^展厅接待/ }).tap();
		const folder = page.locator('[data-page-layer="/me/reception/folder/visits/folder/new-folder"]:not([inert])');
		await folder.getByRole("button", { name: "新建资料" }).tap();
		await page.getByRole("textbox", { name: "标题" }).fill("展厅签到");
		await page.getByRole("textbox", { name: "正文" }).fill("请在展厅入口签到。");
		await page.getByRole("button", { name: "保存并公开" }).tap();
		await expect(folder.getByRole("button", { name: /^展厅签到/ })).toBeVisible();
		await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBe(393);
		await page.screenshot({ path: info.outputPath("reception-mobile-folder.png"), animations: "disabled" });
		await folder.getByRole("button", { name: "删除文件夹" }).tap();
		await page.getByRole("dialog", { name: "删除文件夹" }).getByRole("button", { name: "删除文件夹" }).tap();
		await parent.getByRole("button", { name: /^展厅签到/ }).tap();
		await expect(page.getByText("请在展厅入口签到。")).toBeVisible();
		expect(changes.map((item) => item.kind)).toEqual(["save_folder", "save_document", "remove_folder"]);
	});

	test("steps from the library root into a file and publishes a reviewed draft to a chosen folder", async ({
		page,
	}, info) => {
		const changes = await isolateLibrary(page);
		await page.goto("/me/reception");
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		await expect(page.getByRole("radio", { name: "青屿" })).toBeChecked();
		const pending = page.getByRole("button", { name: /^待审核草稿/ });
		await expect(pending).toBeVisible();
		await page.screenshot({ path: info.outputPath("reception-mobile.png"), animations: "disabled" });
		await page.getByRole("button", { name: /^来访指南/ }).click();
		await page.getByRole("button", { name: /^来访时间与预约/ }).click();
		await expect(page.getByRole("heading", { name: "来访时间与预约" })).toBeVisible();
		await expect(page.locator("[data-reception-directory]")).toHaveCount(0);
		await expect(page.getByRole("radio")).toHaveCount(0);
		const back = page.getByRole("button", { name: "返回", exact: true });
		await back.click();
		await expect(page).toHaveURL(/\/folder\/visits$/);
		await back.click();
		await pending.click();
		await page.getByRole("button", { name: /^周末来访安排/ }).click();
		await expect(page.getByRole("heading", { name: "周末来访安排" })).toBeVisible();
		await page.reload();
		await page.getByRole("button", { name: /^存放位置/ }).click();
		await expect(page.getByRole("option", { name: "来访指南" })).toBeVisible();
		await page.getByRole("option", { name: "来访指南" }).click();
		await expect(page.getByRole("button", { name: /^存放位置.*来访指南/ })).toBeVisible();
		await page.screenshot({ path: info.outputPath("reception-draft.png"), animations: "disabled" });
		await page.getByRole("button", { name: "批准并公开" }).click();
		await expect(page).toHaveURL(/\/reception\/drafts$/);
		await expect(page.getByRole("button", { name: /^周末来访安排/ })).toHaveCount(0);
		expect(changes).toEqual([
			{ kind: "review_draft", id: "one", approve: true, folderId: "visits", title: "周末来访安排" },
		]);
		await back.click();
		await page.getByRole("button", { name: /^来访指南/ }).click();
		await expect(page.getByRole("button", { name: /^周末来访安排/ })).toBeVisible();
	});
});

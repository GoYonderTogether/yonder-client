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

async function isolateLibrary(page: Page) {
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
			{ id: "visits", name: "来访指南" },
			{ id: "partnerships", name: "合作咨询" },
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
	const changes: SocialLibraryChange[] = [];
	await page.route("**/v1/me/social/library", async (route) => {
		if (route.request().method() === "POST") {
			const change = route.request().postDataJSON() as SocialLibraryChange;
			changes.push(change);
			if (change.kind === "save_folder") {
				const folder = library.folders.find((item) => item.id === change.id);
				if (folder) folder.name = change.name;
				else library.folders.push({ id: "new-folder", name: change.name });
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
	await page.getByRole("button", { name: "重命名文件夹" }).click();
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

test.describe("phone reception library", () => {
	test.use({
		userAgent: devices["iPhone 15"].userAgent,
		viewport: devices["iPhone 15"].viewport,
		isMobile: true,
		hasTouch: true,
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

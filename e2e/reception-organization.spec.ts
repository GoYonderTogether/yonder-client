import { devices, expect, type Page, test } from "@playwright/test";
import type {
	MemoryFileContent,
	MemoryOrganizationPlan,
	ReviewMemoryOrganizationRequest,
	SocialLibrary,
} from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const time = "2026-11-20T03:00:00Z";
const special = [
	{
		id: "parking",
		title: "访客出入与停车申请",
		path: "/notes/访客出入与停车申请.md",
		to: "/public/来访指南/场馆交通/停车申请.md",
	},
	{
		id: "booking",
		title: "开放时间和预约规则",
		path: "/public/开放时间和预约规则.md",
		to: "/public/来访指南/开放时间和预约规则.md",
	},
	{ id: "partner", title: "商务合作流程", path: "/public/商务合作流程.md", to: "/public/商务合作/商务合作流程.md" },
];
const draft = {
	id: "weekend",
	title: "周末来访安排",
	path: "/public/周末来访安排.md",
	to: "/public/待审核草稿/周末来访安排.md",
	draft: true,
};
const relocated = "/public/来访指南/场馆交通/停车办理.md";

async function isolateOrganization(page: Page, existing: boolean) {
	await isolateChat(page, { items: [] });
	await page.emulateMedia({ reducedMotion: "reduce" });
	const proposed = [
		...special,
		...Array.from({ length: 126 }, (_, index) => {
			const title = `活动接待手册第 ${index + 1} 期`;
			return {
				id: `event-${index + 1}`,
				title,
				path: `/public/${title}.md`,
				to: `/public/活动接待/活动手册/${title}.md`,
			};
		}),
		draft,
	];
	const suggested: MemoryOrganizationPlan = {
		id: "organize-129",
		createdAt: time,
		moves: proposed.map((file) => ({
			fileId: file.id,
			from: file.path,
			to: file.to,
			title: file.title,
			...("draft" in file && { draft: true }),
		})),
	};
	let plan: MemoryOrganizationPlan | null = existing ? suggested : null;
	let conflict = existing;
	const prompt: string[] = [];
	const reviews: ReviewMemoryOrganizationRequest[] = [];
	const files = proposed.map((file) => ({
		...file,
		draft: "draft" in file,
		visibility: "draft" in file ? ("private" as const) : ("public" as const),
	}));
	const contentOf = (file: (typeof files)[number]) =>
		`${file.title}\n\n${file.id === "parking" ? "访客停车前请向前台登记车牌。" : "到访前请确认与接待同事约定的时间。"}`;
	function library(): SocialLibrary {
		const folders = new Map<string, SocialLibrary["folders"][number]>();
		const documents = files
			.filter((file) => file.visibility === "public")
			.map((file) => {
				const names = file.path
					.replace(/^\/public\//, "/")
					.split("/")
					.slice(1, -1);
				let parentFolderId: string | null = null;
				for (const name of names) {
					const id: string = `${parentFolderId ?? ""}/${name}`;
					folders.set(id, { id, name, parentFolderId });
					parentFolderId = id;
				}
				return {
					id: file.id,
					folderId: parentFolderId,
					path: file.path,
					title: file.title,
					content: contentOf(file),
					updatedAt: time,
				};
			});
		return {
			folders: [...folders.values()],
			documents,
			drafts: files
				.filter((file) => file.draft)
				.map((file) => ({ id: file.id, path: file.path, content: contentOf(file), createdAt: time })),
		};
	}
	await page.route("**/v1/me/reception", (route) => route.fulfill({ json: { botId: "chat-bot", custom: false } }));
	await page.route("**/v1/me/social/library", (route) => route.fulfill({ json: library() }));
	await page.route(`**/v1/conversations/${conversation.id}/messages`, async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		const request = route.request().postDataJSON();
		prompt.push(request.body);
		plan = suggested;
		return route.fulfill({
			json: {
				message: { ...message("organize-01", request.body, true), clientNonce: request.clientNonce },
				clientNonce: request.clientNonce,
			},
		});
	});
	await page.route("**/v1/me/social/organization", async (route) => {
		if (route.request().method() === "POST") {
			const review = route.request().postDataJSON() as ReviewMemoryOrganizationRequest;
			reviews.push(review);
			if (conflict && review.moves.length) {
				conflict = false;
				return route.fulfill({ status: 409, json: { error: { code: "conflict_version", message: "path occupied" } } });
			}
			for (const move of review.moves) {
				const file = files.find(({ id }) => id === move.fileId);
				if (file) file.path = move.to;
			}
			plan = null;
		}
		return route.fulfill({ json: { plan } });
	});
	await page.route("**/v1/memory/files**", (route) => {
		const url = new URL(route.request().url());
		const items: MemoryFileContent[] = files.map((file) => ({
			path: file.path,
			title: file.title,
			visibility: file.visibility,
			draft: file.draft,
			kind: file.path.startsWith("/public/") ? "public" : "note",
			updatedAt: time,
			updatedBy: "user",
			updatedByName: null,
			userEdited: false,
			content: contentOf(file),
			version: 1,
			sources: [],
			links: [],
			limit: { unit: "bytes", length: 65536 },
		}));
		if (url.pathname.endsWith("/content")) {
			const path = url.searchParams.get("path");
			return route.fulfill({ json: items.find((item) => item.path === path) });
		}
		return route.fulfill({ json: { items } });
	});
	return { prompt, reviews, files };
}

test.describe("130 proposed changes in a 129-document library", () => {
	test.use({
		userAgent: devices["iPhone 15"].userAgent,
		viewport: devices["iPhone 15"].viewport,
		isMobile: true,
		hasTouch: true,
	});
	test("starts the private Bot request, adjusts a path, reviews in one tap, and opens the same file in Memory", async ({
		page,
	}, info) => {
		const { prompt, reviews, files } = await isolateOrganization(page, false);
		await page.goto("/me/reception");
		await expect(page.getByRole("button", { name: /^全部资料.*129/ })).toBeVisible();
		await page.getByRole("button", { name: "Bot 整理", exact: true }).tap();
		await page.getByRole("button", { name: "让 Bot 整理", exact: true }).tap();
		await expect.poll(() => prompt.length).toBe(1);
		expect(prompt[0]).toContain("请整理我的对外接待资料和待审核草稿");
		await expect(page.getByText("已选 130 / 130 项")).toBeVisible();
		await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBe(393);
		await page.screenshot({
			path: info.outputPath("reception-organization-mobile-preview.png"),
			animations: "disabled",
		});
		await page.locator("summary").filter({ hasText: "来访指南" }).tap();
		await page.locator("summary").filter({ hasText: "场馆交通" }).tap();
		await page.getByRole("button", { name: "调整「访客出入与停车申请」的路径", exact: true }).tap();
		await page.getByRole("textbox", { name: "目标路径" }).fill(relocated);
		await page.getByRole("button", { name: "保存", exact: true }).tap();
		await expect(page.getByText(relocated, { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "批准并应用", exact: true }).tap();
		await expect(page.getByText("已应用 130 项整理变更。")).toBeVisible();
		expect(reviews[0]?.moves).toHaveLength(130);
		expect(files.find((file) => file.id === "parking")).toMatchObject({ path: relocated, visibility: "public" });
		expect(files.find((file) => file.id === "weekend")).toMatchObject({
			path: draft.to,
			visibility: "private",
			draft: true,
		});
		await page.getByRole("button", { name: "返回", exact: true }).tap();
		await page.getByRole("button", { name: /^来访指南/ }).tap();
		await page.getByRole("button", { name: /^场馆交通/ }).tap();
		await page.getByRole("button", { name: /^访客出入与停车申请/ }).tap();
		await expect(page.getByText("已公开", { exact: true })).toBeVisible();
		await page.getByRole("link", { name: "在记忆中查看" }).tap();
		await expect(page.getByRole("heading", { name: "访客出入与停车申请" })).toBeVisible();
		await expect(page.getByText("访客停车前请向前台登记车牌。", { exact: true })).toBeVisible();
		await page.screenshot({
			path: info.outputPath("reception-organization-mobile-memory-file.png"),
			animations: "disabled",
		});
		await page.getByRole("button", { name: "返回", exact: true }).tap();
		await expect(page.getByText("场馆交通", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: /^访客出入与停车申请/ })).toBeVisible();
		await page.getByRole("button", { name: "返回", exact: true }).tap();
		await expect(page.getByText("来访指南", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "场馆交通" })).toBeVisible();
	});
});

test("narrow desktop selects by folder, exposes a stale plan, and approves the adjusted subset", async ({
	page,
}, info) => {
	await page.setViewportSize({ width: 820, height: 870 });
	const { reviews, files } = await isolateOrganization(page, true);
	await page.goto("/me/reception");
	await page.getByRole("button", { name: "审核整理建议" }).click();
	await expect(page.getByText("已选 130 / 130 项")).toBeVisible();
	await page.getByRole("checkbox", { name: "选择 /public/活动接待 下的所有变更", exact: true }).uncheck();
	await expect(page.getByText("已选 4 / 130 项")).toBeVisible();
	await page.getByRole("button", { name: "批准并应用", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("资料或目标路径已变化");
	await expect(page.getByRole("button", { name: "批准并应用", exact: true })).toBeDisabled();
	await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBe(820);
	await page.locator("summary").filter({ hasText: "来访指南" }).click();
	await page.locator("summary").filter({ hasText: "场馆交通" }).click();
	await page.getByRole("button", { name: "调整「访客出入与停车申请」的路径", exact: true }).click();
	await page.getByRole("textbox", { name: "目标路径" }).fill(relocated);
	await page.getByRole("button", { name: "保存", exact: true }).click();
	await expect(page.getByText(relocated, { exact: true })).toBeVisible();
	await page.screenshot({ path: info.outputPath("reception-organization-narrow-preview.png"), animations: "disabled" });
	await page.getByRole("button", { name: "批准并应用", exact: true }).click();
	await expect(page.getByText("已应用 4 项整理变更。")).toBeVisible();
	expect(reviews[1]?.moves).toHaveLength(4);
	expect(files.find((file) => file.id === "event-126")?.path).toBe("/public/活动接待手册第 126 期.md");
});

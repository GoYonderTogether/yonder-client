import { mkdir, readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const previewDir = process.env.YONDER_PREVIEW_DIR ?? "test-results/social-memory";

async function decodeQr(page: Page, png: Buffer) {
	await page.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
	return page.evaluate(async (encoded) => {
		const image = new Image();
		image.src = `data:image/png;base64,${encoded}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas unavailable");
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
		return (
			window as typeof window & {
				jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
			}
		).jsQR(pixels.data, pixels.width, pixels.height)?.data;
	}, png.toString("base64"));
}

async function setup(page: Page) {
	await isolateChat(page);
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, bio: "做个人 AI 网络，找我聊合作和内测。" },
				bot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	await page.route("**/v1/invite", (route) =>
		route.fulfill({
			json: {
				code: "isolated-invite",
				link: "https://yonder.zethai.cn/i/isolated-invite",
				stats: { invitedCount: 0, grantedTotal: 0 },
				rewardRule: { newUserGets: 100, inviterGets: 50, maxInvites: null },
			},
		}),
	);
	const now = new Date();
	const today = now.toISOString().slice(0, 10);
	const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
	const entry = (id: string, title: string, at: string) => ({
		type: "entry",
		entry: {
			id,
			at,
			endsAt: null,
			kind: "voice",
			size: "note",
			activity: null,
			title,
			text: null,
			body: null,
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
			sources: [],
			deletable: true,
		},
	});
	const summary = (path: string, title: string, extra = {}) => ({
		path,
		title,
		kind: "note",
		visibility: "private",
		updatedAt: hoursAgo(2),
		updatedBy: "user",
		updatedByName: null,
		userEdited: false,
		draft: false,
		...extra,
	});
	const files = [
		summary("/notes/合作方.md", "合作方"),
		summary("/notes/内测反馈.md", "内测反馈"),
		summary("/sources/会议/周会.md", "周会纪要"),
		summary("/digests/day/2026-11-18.md", "11 月 18 日"),
		summary("/public/草稿.md", "我在找什么", { draft: true }),
	];
	const content = (path: string, text: string) => ({
		...summary(path, path.includes("印象") ? "印象" : "近期"),
		content: text,
		version: 1,
		sources: [],
		links: [],
		limit: { length: 3000, unit: "characters" },
	});
	await page.route("**/v1/memory/**", (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === "/v1/memory/days")
			return route.fulfill({
				json: {
					items: [
						{
							date: today,
							state: "ready",
							failure: null,
							digest: { steps: null, places: 0, photos: 0 },
							digestPath: null,
							blocks: [entry("e1", "和投资人确认下周路演", hoursAgo(1)), entry("e2", "整理内测用户反馈", hoursAgo(3))],
						},
					],
					nextCursor: null,
				},
			});
		if (url.pathname === "/v1/memory/files/content") {
			const path = url.searchParams.get("path") ?? "";
			return route.fulfill({
				json: path.includes("印象")
					? content(path, "# 印象\n喜欢直接的结论，先看表格再看细节；晚上效率最高。")
					: content(path, "# 近期\n在准备 12 月路演，同时推进 Yonder 内测。"),
			});
		}
		if (url.pathname === "/v1/memory/files") return route.fulfill({ json: { items: files } });
		return route.fulfill({ status: 404, json: { error: "not_found" } });
	});
}

test("the card shares a PNG whose QR opens /@handle with the invite code, and turns over to what the Bot knows", async ({
	page,
}) => {
	await mkdir(previewDir, { recursive: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await setup(page);
	await page.goto("/memory");
	const card = page.getByRole("region", { name: "我的名片" });
	await expect(card.getByText("做个人 AI 网络")).toBeVisible();
	await expect(page.getByRole("heading", { name: "最近" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "全部" })).toBeVisible();
	// Settings live in 「我」, not on the memory page.
	await expect(page.getByRole("button", { name: "谁可以看到" })).toHaveCount(0);
	await page.screenshot({ path: `${previewDir}/memory-home-mobile.png`, animations: "disabled", fullPage: true });
	await card.getByRole("button", { name: "翻到背面" }).click({ position: { x: 24, y: 24 } });
	await expect(card.getByText("只有你看得到")).toBeVisible();
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${previewDir}/memory-back-mobile.png`, animations: "disabled" });
	await card.getByRole("button", { name: "翻回正面" }).click({ position: { x: 24, y: 24 } });
	await card.getByRole("button", { name: "分享我的名片" }).click();
	const sheet = page.getByRole("dialog", { name: "我的名片" });
	await expect(sheet.getByRole("img", { name: "我的名片二维码" }).first()).toBeVisible();
	await page.waitForTimeout(400);
	await page.screenshot({ path: `${previewDir}/memory-share-mobile.png`, animations: "disabled" });
	const downloadPromise = page.waitForEvent("download");
	await sheet.getByRole("button", { name: "保存图片" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(`yonder-${person.handle}.png`);
	const path = `${previewDir}/memory-card.png`;
	await download.saveAs(path);
	expect(await decodeQr(page, await readFile(path))).toMatch(new RegExp(`/@${person.handle}\\?i=isolated-invite$`));
	await expect(sheet.getByRole("status")).toHaveText("图片已保存");
	await sheet.getByRole("button", { name: "名片设置" }).click();
	await expect(page).toHaveURL(/\/me\/profile$/);
});

for (const [width, height, name] of [
	[820, 900, "narrow"],
	[1440, 1000, "wide"],
] as const) {
	test(`the memory home on a ${name} window`, async ({ page }) => {
		await mkdir(previewDir, { recursive: true });
		await page.setViewportSize({ width, height });
		await setup(page);
		await page.goto("/memory");
		await expect(page.getByRole("region", { name: "我的名片" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "全部" })).toBeVisible();
		await page.screenshot({ path: `${previewDir}/memory-home-${name}.png`, animations: "disabled" });
	});
}

test("a group sender's avatar opens their card in the side panel", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	const stranger = {
		memberId: "group-stranger",
		kind: "person" as const,
		handle: "stranger1",
		displayName: "群里的陌生人",
		avatarUrl: null,
	};
	const self = conversation.members.find((member) => member.memberId === person.id);
	await isolateChat(page, {
		group: true,
		members: [...(self ? [self] : []), stranger],
		items: [{ ...message("group-01", "大家好"), senderId: stranger.memberId, senderKind: "person" }],
	});
	await page.route("**/v1/members/stranger1", (route) =>
		route.fulfill({
			json: {
				card: {
					kind: "person",
					handle: "stranger1",
					displayName: "群里的陌生人",
					avatarUrl: null,
					bio: null,
					owner: null,
				},
				relation: "none",
				memberId: "group-stranger",
				conversationId: null,
				bots: [{ handle: "strangerbot", displayName: "TA 的接待 Bot", avatarUrl: null, reception: true }],
			},
		}),
	);
	await page.goto(`/messages/${conversation.id}`);
	await page.getByRole("button", { name: "打开 群里的陌生人 的资料" }).click();
	const panel = page.getByRole("complementary").or(page.getByRole("dialog")).filter({ hasText: "@stranger1" });
	await expect(panel.getByRole("button", { name: "加为联系人" })).toBeVisible();
	await expect(panel.getByRole("heading", { name: "TA 的 Bot" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/group-avatar-card-desktop.png`, animations: "disabled" });
});

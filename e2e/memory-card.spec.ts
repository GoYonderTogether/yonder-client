import { mkdir } from "node:fs/promises";
import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use({ reducedMotion: "reduce" });

const previewDir = process.env.YONDER_PREVIEW_DIR ?? "test-results/social-memory";

async function screenshot(page: Page, name: string) {
	await expect
		.poll(() =>
			page.locator("[data-page-layer]:not([inert])").evaluateAll((panels) =>
				panels
					.filter((panel) => getComputedStyle(panel).visibility === "visible")
					.every((panel) => {
						const transform = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
						return Math.abs(transform.m41) < 0.5 && Math.abs(transform.m42) < 0.5;
					}),
			),
		)
		.toBe(true);
	await page.screenshot({ path: `${previewDir}/${name}.png`, animations: "disabled", scale: "css" });
}

async function surfaceColors(locator: Locator) {
	return locator.evaluate((element) => {
		const context = document.createElement("canvas").getContext("2d");
		if (!context) throw new Error("Cannot resolve surface colors");
		const pixel = (node: Element) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = getComputedStyle(node).backgroundColor;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data];
		};
		const card = pixel(element);
		for (let canvas = element.parentElement; canvas; canvas = canvas.parentElement) {
			const color = pixel(canvas);
			if (color[3] === 255) return { card, canvas: color };
		}
		throw new Error("No opaque page canvas");
	});
}

async function setup(page: Page, dark = false) {
	await isolateChat(page, { dark });
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, bio: "做个人 AI 网络，找我聊合作和内测。" },
				bot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "zh-CN", theme: dark ? "dark" : "light" },
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
				json: path.includes("印象") ? content(path, impressionMarkdown) : content(path, recentMarkdown),
			});
		}
		if (url.pathname === "/v1/memory/files") return route.fulfill({ json: { items: files } });
		return route.fulfill({ status: 404, json: { error: "not_found" } });
	});
}

const privateText = "喜欢直接的结论，先看表格再看细节；晚上效率最高。";
const impressionDetail =
	"做原型时通常先自己走完整个流程，从真实体验里找最卡的一步。遇到分歧时会拿出两种方案，比较各自的成本和收益，再决定下一步。";
const recentText = "在准备 12 月路演，同时推进 Yonder 内测。";
const impressionMarkdown = [
	"# 印象",
	privateText,
	`**${impressionDetail}** [内测反馈](/notes/内测反馈.md)`,
	"## 沟通习惯",
	"- 先说结论、分歧和下一步，再补充判断依据。\n- 不需要为了每个小决定停下来确认；遇到影响上线或用户数据的变更再一起定。",
	"## 工作方式",
	"喜欢用真机体验来检验功能，而不是只看效果图。看预览时，会先判断一件事是否顺手，再调整间距和动效。",
].join("\n\n");
const recentMarkdown = [
	"# 近期",
	recentText,
	"## 这周在推进",
	"- 整理演示流程，选出能完整走通的真实任务。\n- 收集内测的第一手反馈，把上手阻力和功能建议分开记录。",
	"## 下次回看",
	"确认跨端操作有没有断点，尤其是手机上发起任务后，能不能在电脑上接着看进度。",
].join("\n\n");

for (const layout of ["mobile", "desktop"] as const) {
	test.describe(`AI profile tabs on ${layout}`, () => {
		if (layout === "mobile") test.use({ ...phone, viewport: { width: 390, height: 844 } });
		else test.use({ viewport: { width: 1440, height: 1000 } });
		test("two fixed tabs show one readable card each", async ({ page }) => {
			await mkdir(previewDir, { recursive: true });
			await setup(page);
			const fileRequests: string[] = [];
			page.on("request", (request) => {
				const url = new URL(request.url());
				if (url.pathname === "/v1/memory/files/content") fileRequests.push(url.searchParams.get("path") ?? "");
			});
			await page.goto("/memory");
			const entry = page.getByRole("button", { name: "AI 对我的了解", exact: true });
			const snippet = entry.locator(".line-clamp-3");
			await expect(entry).toBeVisible();
			await expect(snippet).toContainText(`${privateText} ${impressionDetail} 内测反馈`);
			await expect(snippet).not.toContainText("印象");
			await expect(snippet.locator("a, img, strong")).toHaveCount(0);
			await expect(snippet).toHaveCSS("-webkit-line-clamp", "3");
			expect(
				await snippet.evaluate(
					(node) => node.clientHeight === Number.parseFloat(getComputedStyle(node).lineHeight) * 3,
				),
			).toBe(true);
			expect(fileRequests).toEqual(["/me/印象.md"]);
			await expect(page.getByRole("heading", { name: "全部" })).toBeVisible();
			await expect(page.getByRole("region", { name: "我的名片" })).toHaveCount(0);
			await screenshot(page, `memory-private-landing-${layout}`);
			await entry.click();
			const tabs = page.getByRole("radiogroup", { name: "AI 对我的了解" });
			const impression = tabs.getByRole("radio", { name: "印象" });
			const recent = tabs.getByRole("radio", { name: "近期" });
			await expect(impression).toBeChecked();
			await expect(page.getByText(privateText, { exact: true })).toBeVisible();
			const recentParagraph = page.getByText(recentText, { exact: true });
			await expect(recentParagraph).toHaveCount(0);
			const doc = page.getByRole("article");
			const card = doc.locator("..");
			await expect(doc).toHaveCount(1);
			const paragraphs = doc.getByText(privateText, { exact: true });
			await expect(paragraphs).toHaveCSS("font-size", "15px");
			await expect(paragraphs).toHaveCSS("line-height", "24px");
			await expect(doc.getByRole("list")).toHaveCSS("list-style-type", "disc");
			const colors = { card: [245, 245, 245, 255], canvas: [255, 255, 255, 255] };
			await expect.poll(() => surfaceColors(card)).toEqual(colors);
			await expect(card).toHaveCSS("border-top-left-radius", "16px");
			await expect(page.getByText("只有你看得到")).toHaveCount(0);
			await expect(page.getByRole("button", { name: "打开", exact: true })).toHaveCount(0);
			await expect(doc.locator("details, button")).toHaveCount(0);
			await expect(paragraphs.evaluate((node) => node.getBoundingClientRect().width)).resolves.toBeGreaterThan(
				layout === "mobile" ? 315 : 565,
			);
			await screenshot(page, `ai-profile-card-reading-${layout}-impression`);
			await recent.click();
			await expect(recent).toBeChecked();
			await expect(recentParagraph).toBeVisible();
			await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
			await expect(page).toHaveURL(/\/memory\/about$/);
			await expect(page.getByRole("button", { name: "分享我的名片" })).toHaveCount(0);
			await expect(tabs.evaluate((node) => !node.closest("[data-frame-scroll]"))).resolves.toBe(true);
			await expect(doc).toHaveCount(1);
			await expect.poll(() => surfaceColors(card)).toEqual(colors);
			await screenshot(page, `ai-profile-card-reading-${layout}-recent`);
		});
	});
}

for (const status of [200, 403]) {
	test(`the profile entry keeps only its title while loading and after a ${status} fallback`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await setup(page);
		const pending = Promise.withResolvers<void>();
		const pattern = "**/v1/memory/files/content?*";
		await page.route(pattern, async (route) => {
			await pending.promise;
			await route.fulfill({
				status,
				json: status === 200 ? { content: "# 印象" } : { code: "forbidden", content: privateText },
			});
		});
		const request = page.waitForRequest(pattern);
		await page.goto("/memory");
		await request;
		const entry = page.getByRole("button", { name: "AI 对我的了解", exact: true });
		await expect(entry).toHaveText("AI 对我的了解");
		const response = page.waitForResponse(pattern);
		pending.resolve();
		expect((await response).status()).toBe(status);
		await expect(entry).toHaveText("AI 对我的了解");
		await expect(entry).not.toHaveAttribute("aria-describedby");
	});
}

test("private AI profile redirects signed-out visitors before using the memory API", async ({ page }) => {
	const requests: string[] = [];
	page.on("request", (request) => requests.push(new URL(request.url()).pathname));
	await page.route("**/v1/**", (route) => route.fulfill({ status: 401, json: { code: "unauthorized" } }));
	await page.goto("/memory/about");
	await expect(page).toHaveURL(/\/sign-in\?next=%2Fmemory%2Fabout$/);
	await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
	expect(requests.some((path) => path.startsWith("/v1/memory/"))).toBe(false);
});

test("private AI memory uses a real dark surface pair", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await setup(page, true);
	await page.goto("/memory/about");
	const doc = page.getByRole("article");
	await expect(doc.getByText(privateText, { exact: true })).toBeVisible();
	await expect
		.poll(() => surfaceColors(doc.locator("..")))
		.toEqual({ card: [35, 36, 41, 255], canvas: [22, 22, 26, 255] });
});

test("the narrow Memory home preserves the profile entry and file groups", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await page.setViewportSize({ width: 820, height: 900 });
	await setup(page);
	await page.goto("/memory");
	await expect(page.getByRole("button", { name: "AI 对我的了解" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "全部" })).toBeVisible();
	await screenshot(page, "memory-private-landing-narrow");
});

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

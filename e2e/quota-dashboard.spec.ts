import { devices, expect, type Page, test } from "@playwright/test";

const zero = { main: 0, background: 0, coding: 0, external: 0, tools: 0 };
const pool = (granted: number, remaining: number) => ({
	granted,
	used: granted - remaining,
	remaining,
	remainingPercent: (remaining / granted) * 100,
});
const quota = {
	balance: 41_234_000,
	granted: 65_000_000,
	used: 23_766_000,
	pools: {
		main: pool(65_000_000, 41_234_000),
		background: pool(5_000_000, 2_130_000),
		coding: pool(5_000_000, 420_000),
		external: pool(2_000_000, 830_000),
		tools: pool(10_000_000, 9_650_000),
	},
	overflow: {
		main: { overflow: false, rate: 1, floor: null },
		background: { overflow: true, rate: 1, floor: null },
		coding: { overflow: true, rate: 1.2, floor: null },
		external: { overflow: false, rate: 1, floor: null },
		tools: { overflow: false, rate: 1, floor: null },
	},
	configVersion: 1,
	cycle: { start: "2026-10-31T16:00:00Z", resetsAt: "2026-11-30T16:00:00Z" },
};
const daily = Array.from({ length: 19 }, (_, index) => {
	const date = `2026-11-${String(index + 1).padStart(2, "0")}`;
	const wave = (index * 37) % 11;
	return {
		date,
		calls: wave * 3,
		cost: {
			...zero,
			main: wave * 180_000,
			background: index % 3 === 0 ? 220_000 : 60_000,
			coding: index % 5 === 0 ? 400_000 : 0,
			external: index % 4 === 1 ? 90_000 : 0,
		},
	};
});
const overview = {
	range: { kind: "cycle", start: "2026-10-31T16:00:00Z", end: "2026-11-19T12:00:00Z" },
	totals: {
		calls: 320,
		cost: 23_766_000,
		inputTokens: 1,
		outputTokens: 1,
		cacheWriteTokens: 0,
		cacheReadTokens: 0,
		unknownUsageCalls: 0,
	},
	daily,
	byPool: {
		main: { cost: 18_000_000, calls: 260 },
		background: { cost: 2_870_000, calls: 40 },
		coding: { cost: 1_600_000, calls: 12 },
		external: { cost: 1_296_000, calls: 8 },
		tools: { cost: 350_000, calls: 70 },
	},
	byPurpose: [
		{ purpose: "chat", cost: 14_600_000, calls: 210, runs: 96 },
		{ purpose: "scheduled", cost: 4_100_000, calls: 51, runs: 19 },
		{ purpose: "subtask", cost: 3_200_000, calls: 41, runs: 7 },
		{ purpose: "outward", cost: 1_296_000, calls: 8, runs: 5 },
		{ purpose: "meeting", cost: 570_000, calls: 10, runs: 2 },
	],
	topConversations: [{ conversationId: "conversation-main", cost: 9_800_000, runs: 40 }],
};
const runs = {
	items: [
		{
			id: "run-1",
			at: "2026-11-19T11:02:00Z",
			purpose: "chat",
			pool: "main",
			conversationId: "conversation-main",
			title: null,
			models: ["标准"],
			calls: 3,
			cost: 13_000,
			inputTokens: 8000,
			outputTokens: 600,
			cacheWriteTokens: 0,
			cacheReadTokens: 4000,
			usageKnown: true,
			ok: true,
			overflowRate: null,
		},
		{
			id: "run-2",
			at: "2026-11-19T09:00:00Z",
			purpose: "scheduled",
			pool: "background",
			conversationId: "conversation-main",
			title: "每天早上整理日程",
			models: ["轻量"],
			calls: 2,
			cost: 4_200,
			inputTokens: 3000,
			outputTokens: 300,
			cacheWriteTokens: 0,
			cacheReadTokens: 0,
			usageKnown: true,
			ok: true,
			overflowRate: null,
		},
	],
	hasMore: false,
	nextCursor: null,
};
const calls = {
	items: [
		{
			id: "call-1",
			at: "2026-11-19T11:02:00Z",
			model: "标准",
			conversationId: "conversation-main",
			taskId: "run-1",
			fallbackIndex: 0,
			pool: "main",
			overflow: false,
			overflowRate: null,
			inputTokens: 8000,
			outputTokens: 600,
			cacheWriteTokens: 0,
			cacheReadTokens: 4000,
			usageKnown: true,
			cost: 13_000,
			costAmount: null,
			costCurrency: null,
			costEstimated: false,
			costSource: "computed",
			ok: true,
			failReason: null,
		},
	],
	hasMore: false,
	nextCursor: null,
	summary: { calls: 1, inputTokens: 8000, outputTokens: 600, cost: 13_000, unknownUsageCalls: 0 },
	daily: [],
};

async function isolate(page: Page, dark: boolean) {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.addInitScript((dark) => {
		localStorage.setItem("yonder.locale", "zh-CN");
		localStorage.setItem("yonder.theme", dark ? "dark" : "light");
	}, dark);
	const member = {
		id: "quota-person",
		kind: "person",
		handle: "quotatest",
		displayName: "额度检查",
		avatarUrl: null,
		bio: null,
		createdAt: "2026-11-15T00:00:00Z",
		version: 1,
	};
	const bot = { ...member, id: "quota-bot", kind: "bot", handle: "quotabot", displayName: "Bot" };
	await page.route("**/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		const json =
			path === "/v1/auth/refresh"
				? { accessToken: "isolated-quota-test" }
				: path === "/v1/me"
					? { member, bot, hasPassword: true, signInMethods: [], settings: { locale: "zh-CN", theme: "light" } }
					: path === "/v1/quota"
						? quota
						: path === "/v1/quota/config"
							? {
									version: 1,
									tier: "default",
									signup: { main: 65_000_000, background: 5_000_000, coding: 5_000_000, external: 2_000_000 },
									monthly: { main: 20_000_000, background: 3_000_000, coding: 3_000_000, external: 1_000_000 },
									rules: quota.overflow,
									invite: { inviter: 10_000_000, invitee: 10_000_000, maxInvites: 20 },
								}
							: path === "/v1/quota/rates"
								? {
										quotaPerYuan: 1_000_000,
										baseline: "标准",
										items: [{ name: "标准", input: 1, output: 4, cacheWrite: 1, cacheRead: 0.02, multiple: 1 }],
									}
								: path === "/v1/usage/overview"
									? overview
									: path === "/v1/usage/runs"
										? runs
										: path === "/v1/usage"
											? calls
											: path === "/v1/conversations"
												? {
														items: [
															{
																id: "conversation-main",
																kind: "direct",
																isPrimary: true,
																title: null,
																members: [
																	{
																		memberId: "quota-bot",
																		kind: "bot",
																		handle: "quotabot",
																		displayName: "Bot",
																		avatarUrl: null,
																	},
																],
																lastMessageAt: null,
																unreadCount: 0,
																pinned: false,
																version: 1,
															},
														],
														hasMore: false,
														nextCursor: null,
													}
												: path === "/v1/health"
													? { ok: true, version: "isolated-quota-test" }
													: { items: [], hasMore: false, nextCursor: null };
		await route.fulfill({ json });
	});
	await page.routeWebSocket("**/v1/realtime*", (socket) => socket.onMessage(() => undefined));
}

for (const dark of [false, true]) {
	test(`desktop quota dashboard opens its pages (${dark ? "dark" : "light"})`, async ({ page }, info) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await isolate(page, dark);
		await page.goto("/me/quota");
		const main = page.getByRole("button", { name: "查看主额度详情" });
		await expect(main).toContainText("41.2M");
		await expect(main).toContainText("本月 65M");
		await expect(main).toContainText("剩 63%");
		await expect(main).toContainText("补充 20M");
		await expect(page.getByText("1M 额度 = ¥1，约 标准 1M 输入 token")).toBeVisible();
		await expect(page.getByText(/^共 [0-9.]+M$/)).toBeVisible();
		await page.screenshot({ path: info.outputPath("desktop-quota.png"), fullPage: true });

		await page.getByRole("button", { name: /^11\/6，共/ }).hover();
		await expect(page.locator("[aria-live=polite]")).toContainText("执行");
		await page.screenshot({ path: info.outputPath("desktop-quota-hover.png") });

		await page.getByRole("button", { name: "查看执行详情" }).click();
		await expect(page).toHaveURL(/\/me\/quota\/pool-coding$/);
		await expect(page.getByText("用完按 1.2 倍扣主额度").last()).toBeVisible();
		await page.screenshot({ path: info.outputPath("desktop-quota-pool.png"), fullPage: true });
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/quota$/);

		await page.getByRole("button", { name: /定时任务/ }).click();
		await expect(page).toHaveURL(/\/me\/quota\/purpose-scheduled$/);
		await page
			.getByRole("button", { name: /每天早上整理日程/ })
			.last()
			.click();
		await page.screenshot({ path: info.outputPath("desktop-quota-purpose.png"), fullPage: true });
		await page.getByRole("button", { name: "返回", exact: true }).click();
		await page.getByRole("button", { name: "全部记录" }).click();
		await page.getByRole("button", { name: /^Bot/ }).last().click();
		await expect(page.getByText("输入 8,000 · 输出 600").last()).toBeVisible();
	});
}

test.describe("phone", () => {
	const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
	test.use(phone);
	for (const dark of [false, true]) {
		test(`the first screen fits the pools, chart and where it went (${dark ? "dark" : "light"})`, async ({
			page,
		}, info) => {
			await isolate(page, dark);
			await page.goto("/me/quota");
			await expect(page.locator('[data-layout-mode="mobile"]')).toBeVisible();
			await expect(page.getByRole("button", { name: "查看对外详情" })).toBeVisible();
			const tiles = page.getByRole("button", { name: /^查看(后台|执行|对外)详情$/ });
			const boxes = await Promise.all([0, 1, 2].map((index) => tiles.nth(index).boundingBox()));
			// Three sub-pool tiles share one row.
			expect(new Set(boxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(1);
			await page.screenshot({ path: info.outputPath("phone-quota.png") });
			await page.screenshot({ path: info.outputPath("phone-quota-full.png"), fullPage: true });
			await page.getByRole("button", { name: "表格" }).click();
			await expect(page.getByRole("table")).toBeVisible();
			await page.getByRole("button", { name: /^11\/19/ }).click();
			await expect(page).toHaveURL(/\/me\/quota\/day-2026-11-19$/);
			await page.screenshot({ path: info.outputPath("phone-quota-day.png") });
		});
	}
});

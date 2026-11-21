import { devices, expect, type Page, test } from "@playwright/test";
import { bot, isolateChat, message } from "./chat-fixture.ts";

const backFrom = (page: Page, path: string) =>
	page.locator(`[data-page-layer="${path}"]`).getByRole("button", { name: "返回", exact: true });

test("settings and a Bot message render the shared Feishu authorization card", async ({ page }, info) => {
	const id = "authorization-review";
	const sample = { ...message("channel-01", "Feishu"), channelAttemptId: id };
	await isolateChat(page, { items: [sample] });
	const attempt = {
		id,
		botId: "chat-bot",
		state: "awaiting",
		connectionId: null,
		expiresAt: new Date(Date.now() + 120_000).toISOString(),
		link: {
			url: "https://accounts.feishu.cn/page/launcher?preview=1",
			expiresAt: new Date(Date.now() + 120_000).toISOString(),
		},
	};
	let starts = 0;
	await page.route("**/v1/channels", (route) => route.fulfill({ json: { available: true, items: [] } }));
	await page.route("**/v1/channels/attempts", (route) => {
		expect(route.request().postDataJSON()).toEqual({ botId: "chat-bot" });
		starts++;
		return route.fulfill({ json: { ...attempt, link: null } });
	});
	await page.route(`**/v1/channels/attempts/${id}`, (route) =>
		route.fulfill({
			json: route.request().method() === "DELETE" ? { ...attempt, state: "cancelled", link: null } : attempt,
		}),
	);
	await page.goto("/me/channels");
	await page.getByRole("button", { name: "飞书 连接", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/channels\/feishu\?bot=chat-bot$/);
	const connect = page.getByRole("button", { name: "连接飞书" });
	await expect(connect).toBeVisible();
	expect(starts).toBe(0);
	await connect.click();
	await expect(page.getByRole("link", { name: "去飞书授权" })).toBeVisible();
	await page.screenshot({ path: info.outputPath("feishu-settings.png") });
	expect(starts).toBe(1);
	await page.goto("/messages/main");
	await expect(page.getByRole("link", { name: "去飞书授权" })).toBeVisible();
	await page.screenshot({ path: info.outputPath("feishu-message.png") });
	expect(starts).toBe(1);
	await page.getByRole("button", { name: "取消", exact: true }).click();
	await expect(page.getByRole("link", { name: "去飞书授权" })).toHaveCount(0);
	await expect(page.getByText("授权已取消")).toBeVisible();
});

test("the channel owner can inspect and close an external chat without a composer", async ({ page }, info) => {
	await isolateChat(page, { items: [] });
	await page.route("**/v1/channels", (route) =>
		route.fulfill({
			json: {
				available: true,
				items: [
					{
						id: "feishu-qa",
						botId: "chat-bot",
						brand: "feishu",
						name: "飞书 QA",
						enabled: true,
						status: "connected",
						credentialState: "valid",
						allowExternalDm: true,
						allowGroups: true,
						missingPermissions: [],
					},
				],
			},
		}),
	);
	let closed = false;
	const stamp = "2026-11-17T09:00:00Z";
	await page.route("**/v1/channels/feishu-qa/conversations", (route) =>
		route.fulfill({
			json: {
				items: [
					{ id: "group", state: closed ? "closed" : "open", kind: "group", expiresAt: null, lastMessageAt: stamp },
					{ id: "direct", state: "pending", kind: "direct", expiresAt: null, lastMessageAt: stamp },
				],
			},
		}),
	);
	await page.route("**/v1/channel-conversations/group/messages", (route) =>
		route.fulfill({
			json: {
				before: null,
				items: [{ id: "incoming", sender: "external", name: null, createdAt: stamp, text: "群内文字" }],
			},
		}),
	);
	await page.route("**/v1/channel-conversations/group", (route) => {
		expect(route.request().postDataJSON()).toEqual({ action: "close" });
		closed = true;
		return route.fulfill({ json: { ok: true } });
	});
	await page.goto("/me/channels");
	await expect(page.getByRole("switch")).toHaveCount(0);
	await page.getByRole("button", { name: "飞书 飞书 QA", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/channels\/feishu\?bot=chat-bot$/);
	await expect(page.getByRole("switch", { name: "允许群聊" })).toBeChecked();
	await expect(page.getByRole("button", { name: /群聊.*已开放/ })).toHaveCount(0);
	await page.getByRole("button", { name: "外部会话", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/channels\/feishu\/external\?bot=chat-bot$/);
	await page.getByRole("button", { name: /群聊.*已开放/ }).click();
	await expect(page.getByRole("region", { name: "只读会话" })).toContainText("群内文字");
	await expect(page.getByRole("textbox")).toHaveCount(0);
	await page.getByRole("button", { name: "关闭会话" }).click();
	await expect(page.getByRole("button", { name: /群聊.*已关闭/ })).toBeVisible();
	await expect(page.getByText("群内文字")).toBeVisible();
	await page.screenshot({ path: info.outputPath("feishu-read-only-closed.png") });
	await backFrom(page, "/me/channels/feishu/external").click();
	await expect(page).toHaveURL(/\/me\/channels\/feishu\?bot=chat-bot$/);
	await expect(page.getByRole("switch", { name: "允许群聊" })).toBeChecked();
	await backFrom(page, "/me/channels/feishu").click();
	await expect(page).toHaveURL(/\/me\/channels$/);
	await expect(page.locator('[data-page-layer="/me/channels"]').getByRole("switch")).toHaveCount(0);
	await page.goto("/me/channels/external?bot=chat-bot");
	await expect(page.getByRole("button", { name: /群聊.*已关闭/ })).toBeVisible();
	await backFrom(page, "/me/channels/external").click();
	await expect(page).toHaveURL(/\/me\/channels\/feishu\?bot=chat-bot$/);
});

test.describe("phone authorization", () => {
	const phone = devices["iPhone 15"];
	test.use({ viewport: phone.viewport, userAgent: phone.userAgent, isMobile: true, hasTouch: true });
	test("iLink displays a QR only after explicit test authorization starts and QQ stays unavailable", async ({
		page,
	}, info) => {
		await isolateChat(page, { items: [] });
		await page.route("**/v1/channels", (route) =>
			route.fulfill({ json: { available: true, wechatAvailable: true, items: [] } }),
		);
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const attempt = {
			provider: "wechat",
			id: "ilink-test",
			botId: "chat-bot",
			state: "awaiting",
			connectionId: null,
			expiresAt,
		};
		let started = false;
		await page.route("**/v1/channels/attempts", (route) => {
			expect(route.request().postDataJSON()).toEqual({ botId: "chat-bot", provider: "wechat" });
			started = true;
			return route.fulfill({ json: { ...attempt, link: null } });
		});
		await page.route("**/v1/channels/attempts/ilink-test", (route) =>
			route.fulfill({
				json:
					route.request().method() === "DELETE"
						? { ...attempt, state: "cancelled", link: null }
						: { ...attempt, link: { url: "weixin://dl/isolated-preview", expiresAt } },
			}),
		);
		await page.goto("/me/channels");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.getByRole("button", { name: "QQ 暂不可用", exact: true }).click();
		await expect(page.getByText(/QQ 暂不可用/)).toBeVisible();
		await expect(page.getByRole("button", { name: /连接 QQ/ })).toHaveCount(0);
		await backFrom(page, "/me/channels/qq").click();
		await page.getByRole("button", { name: "微信 iLink 连接", exact: true }).click();
		await expect(page).toHaveURL(/\/me\/channels\/wechat\?bot=chat-bot$/);
		const start = page.getByRole("button", { name: "连接微信 iLink" });
		await expect(start).toBeVisible();
		expect(started).toBe(false);
		await start.click();
		const qr = page.getByRole("img", { name: "用微信扫码授权" });
		await expect(qr).toBeVisible();
		await page.screenshot({ path: info.outputPath("channels-connect-mobile.png") });
		await page.getByRole("button", { name: "取消", exact: true }).click();
		await expect(qr).toHaveCount(0);
		await expect(page.getByRole("button", { name: "重试", exact: true })).toBeVisible();
		await backFrom(page, "/me/channels/wechat").click();
		await expect(page).toHaveURL(/\/me\/channels$/);
	});
});

for (const layout of ["desktop", "narrow", "mobile"] as const) {
	test.describe(layout, () => {
		const phone = devices["iPhone 15"];
		test.use(
			layout === "mobile"
				? { viewport: phone.viewport, userAgent: phone.userAgent, isMobile: true, hasTouch: true }
				: { viewport: { width: layout === "narrow" ? 766 : 1280, height: 900 } },
		);

		test("the Bot selector scrolls to a preselection, supports keyboard selection and switches channels", async ({
			page,
		}, info) => {
			await isolateChat(page, { items: [] });
			await page.emulateMedia({ reducedMotion: "reduce" });
			const bots = (
				[
					[bot.id, "栗子", "日程与提醒", "1"],
					["songguo", "松果", "客户与来访", "2"],
					["qinghe", "青禾", "研究与整理", "3"],
					["xiaoman", "小满", "内容与写作", "4"],
				] as const
			).map(([id, displayName, botRoleLabel, avatarColor]) => ({
				...bot,
				id,
				displayName,
				botRoleLabel,
				avatarColor,
				handle: id,
				isDefault: id === bot.id,
			}));
			await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: bots } }));
			await page.route("**/v1/channels", (route) =>
				route.fulfill({
					json: {
						available: true,
						wechatAvailable: true,
						items: [
							{
								id: "feishu-songguo",
								botId: "songguo",
								provider: "feishu",
								name: "松果接待台",
								enabled: true,
								status: "connected",
								credentialState: "valid",
								allowExternalDm: true,
								allowGroups: false,
								missingPermissions: [],
							},
							{
								id: "wechat-qinghe",
								botId: "qinghe",
								provider: "wechat",
								name: "青禾个人微信",
								enabled: false,
								status: "offline",
								credentialState: "valid",
								allowExternalDm: true,
								allowGroups: false,
								missingPermissions: [],
							},
						],
					},
				}),
			);
			await page.goto("/me/channels?bot=xiaoman");
			const group = page.getByRole("group", { name: "选择 Bot" });
			const last = group.getByRole("radio", { name: "小满", exact: true });
			await expect(last).toBeChecked();
			await expect(last).toBeInViewport({ ratio: 0.98 });
			await expect(group.getByRole("radio", { name: "栗子", exact: true })).not.toBeInViewport({ ratio: 0.98 });
			await expect(page.getByRole("button", { name: "飞书 连接", exact: true })).toBeVisible();
			await expect(page.getByRole("heading", { name: "已连接", exact: true })).toHaveCount(0);
			await last.focus();
			await page.keyboard.press("ArrowLeft");
			await expect(page).toHaveURL(/\?bot=qinghe$/);
			await expect(page.getByRole("heading", { name: "已连接", exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "微信 iLink 青禾个人微信 已暂停", exact: true })).toBeVisible();
			await page.keyboard.press("ArrowLeft");
			const selected = group.getByRole("radio", { name: "松果", exact: true });
			await expect(selected).toBeChecked();
			await expect(selected).toHaveAccessibleDescription("客户与来访");
			await expect(page).toHaveURL(/\?bot=songguo$/);
			const feishu = page.getByRole("button", { name: "飞书 松果接待台", exact: true });
			await expect(feishu).toBeVisible();
			await expect(page.getByRole("heading", { name: "未连接", exact: true })).toBeVisible();
			await expect(page.getByRole("switch")).toHaveCount(0);
			await page.reload();
			await expect(selected).toBeChecked();
			await expect(feishu).toBeVisible();
			await selected.click();
			await page.evaluate(async () => await document.fonts.ready);
			await page.screenshot({ path: info.outputPath(`channels-list-${layout}.png`) });
			await feishu.click();
			await expect(page).toHaveURL(/\/me\/channels\/feishu\?bot=songguo$/);
			await expect(page.getByRole("switch", { name: "启用此连接", exact: true })).toBeChecked();
			await expect(page.getByRole("button", { name: "外部会话", exact: true })).toBeVisible();
			if (layout === "mobile") await page.screenshot({ path: info.outputPath("channels-settings-mobile.png") });
			await page.reload();
			await backFrom(page, "/me/channels/feishu").click();
			await expect(page).toHaveURL(/\/me\/channels\?bot=songguo$/);
			await expect(selected).toBeChecked();
			await expect(feishu).toBeVisible();
		});
	});
}

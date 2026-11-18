import { expect, test } from "@playwright/test";
import { isolateChat, message } from "./chat-fixture.ts";

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
	await expect(page.getByRole("checkbox", { name: "允许群聊" })).toBeChecked();
	await expect(page.getByRole("button", { name: /群聊.*已开放/ })).toHaveCount(0);
	await page.getByRole("button", { name: "外部会话", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/channels\/external\?bot=chat-bot$/);
	await page.getByRole("button", { name: /群聊.*已开放/ }).click();
	await expect(page.getByRole("region", { name: "只读会话" })).toContainText("群内文字");
	await expect(page.getByRole("textbox")).toHaveCount(0);
	await page.getByRole("button", { name: "关闭会话" }).click();
	await expect(page.getByRole("button", { name: /群聊.*已关闭/ })).toBeVisible();
	await expect(page.getByText("群内文字")).toBeVisible();
	await page.screenshot({ path: info.outputPath("feishu-read-only-closed.png") });
	await page.getByRole("button", { name: "返回", exact: true }).click();
	await expect(page).toHaveURL(/\/me\/channels$/);
	await expect(page.getByRole("checkbox", { name: "允许群聊" })).toBeChecked();
});

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
	await expect(page.getByText(/QQ 暂不可用/)).toBeVisible();
	await expect(page.getByRole("button", { name: /连接 QQ/ })).toHaveCount(0);
	const start = page.getByRole("button", { name: "连接微信 iLink" });
	await expect(start).toBeVisible();
	expect(started).toBe(false);
	await start.click();
	const qr = page.getByRole("img", { name: "用微信扫码授权" });
	await expect(qr).toBeVisible();
	await page.screenshot({ path: info.outputPath("ilink-authorization-test.png") });
	await page.getByRole("button", { name: "取消", exact: true }).click();
	await expect(qr).toHaveCount(0);
});

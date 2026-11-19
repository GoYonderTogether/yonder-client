import { expect, test } from "@playwright/test";
import type { Conversation, ConversationMember, Run } from "@yonder/protocol";
import { bot as accountBot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const [self, botMember] = conversation.members as [ConversationMember, ConversationMember];
const bot = { ...botMember, displayName: "Yonder 助理" };
const friend = { ...self, memberId: "lin", handle: "lin", displayName: "林知夏" };
const teammate = { ...self, memberId: "zhou", handle: "zhou", displayName: "周予安" };
const chats = {
	person: { ...conversation, id: "person-chat", members: [self, friend], isPrimary: false },
	group: {
		...conversation,
		id: "group-chat",
		kind: "group",
		title: "产品小组",
		members: [self, friend, teammate, bot],
		ownerId: self.memberId,
		isPrimary: false,
	},
	agent: { ...conversation, id: "agent-chat", members: [self, bot] },
} satisfies Record<string, Conversation>;

function from(chat: Conversation, sender: ConversationMember, n: number, body: string | null) {
	return {
		...message(`message-0${n}`, body),
		conversationId: chat.id,
		senderId: sender.memberId,
		senderKind: sender.kind,
	};
}

const reply = from(chats.agent, bot, 2, "好，我先核对会上确认的事项，再把各项待办和负责人列出来。");
const run: Run = {
	id: "review-run",
	conversationId: chats.agent.id,
	messageId: reply.id,
	userMessageId: "message-01",
	status: "queued",
};
const items = {
	person: [
		from(chats.person, friend, 1, "明天下午想看一下发布页，你有空一起走一遍吗？"),
		from(chats.person, self, 2, "可以，三点见。我会先把手机端也跑一遍。"),
		from(chats.person, friend, 3, "好，我提前把这次要看的几处整理出来。"),
	],
	group: [
		from(chats.group, friend, 1, "明天的评审还是下午三点，先看新版会话页。"),
		from(chats.group, teammate, 2, "我会带上桌面和手机的对照图。"),
		from(chats.group, self, 3, "群资料和选人流程也一起过一下。"),
		from(chats.group, bot, 4, "我会在会后按讨论主题整理要点。"),
	],
	agent: [from(chats.agent, self, 1, "明天评审前，帮我把会议纪要里的待办归整一下。"), reply],
};

for (const viewport of ["desktop", "phone"] as const) {
	test.describe(viewport, () => {
		const phone = viewport === "phone";
		test.use(
			phone
				? {
						viewport: { width: 390, height: 844 },
						userAgent:
							"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
						isMobile: true,
						hasTouch: true,
						reducedMotion: "reduce",
					}
				: { viewport: { width: 1440, height: 900 } },
		);
		for (const mode of ["person", "group", "agent"] as const) {
			test(`${mode} heading and message identities`, async ({ page }, info) => {
				const chat = chats[mode];
				const mobileBotHome = phone && mode === "agent";
				const api = await isolateChat(page, { items: items[mode] });
				await page.route("**/v1/me", (route) =>
					route.fulfill({
						json: {
							member: person,
							bot: { ...accountBot, displayName: bot.displayName, isDefault: true },
							settings: { locale: "zh-CN", theme: "light" },
						},
					}),
				);
				await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: Object.values(chats) } }));
				await page.goto(`/messages/${mobileBotHome ? "main" : chat.id}`);
				const detail = page.locator('[data-page-layer="detail"]');
				const topbar = detail.locator("[data-shell-topbar]");
				const log = detail.getByRole("log");
				await expect(log).toBeVisible();
				await expect
					.poll(() => detail.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))
					.toBeCloseTo(0, 2);
				const more = topbar.getByRole("button", { name: "聊天设置", exact: true });
				const header = detail.locator(mobileBotHome ? "[data-floating-frame-header]" : "[data-shell-topbar]");
				const accountSettings = header.getByRole("button", { name: "设置", exact: true });
				if (mobileBotHome) {
					await expect(topbar).toHaveCount(0);
					await expect(accountSettings).toBeInViewport();
					await expect(accountSettings).toBeEmpty();
				} else await expect(more).toBeInViewport();
				const avatars = log.locator("[data-message-sender-avatar]");
				const senderNames = log.locator("[data-message-sender-name]");
				if (mode === "agent") {
					const heading = detail.getByRole("region", { name: bot.displayName, exact: true });
					await expect(topbar.locator("[data-chat-agent-title]")).toHaveCount(0);
					await expect(topbar.getByText(bot.displayName, { exact: true })).toHaveCount(0);
					const avatar = heading.locator("[data-avatar-fallback]");
					await expect(avatar).toBeVisible();
					const botSettings = heading.getByRole("button", { name: "Bot 设置", exact: true });
					if (mobileBotHome) await expect(botSettings.locator("[data-avatar-fallback]")).toBeVisible();
					else await expect(botSettings).toHaveCount(0);
					await expect(avatars).toHaveCount(0);
					await expect(senderNames).toHaveCount(0);
					const name = heading.getByText(bot.displayName, { exact: true });
					const status = heading.getByRole("status");
					await expect(name).toBeVisible();
					await expect(status).toHaveCount(0);
					const [headerBox, avatarBox, nameBox, logBox] = await Promise.all([
						header.boundingBox(),
						avatar.boundingBox(),
						name.boundingBox(),
						log.boundingBox(),
					]);
					if (!headerBox || !avatarBox || !nameBox || !logBox) throw new Error("Expected a visible Agent identity");
					const center = headerBox.x + headerBox.width / 2;
					expect(avatarBox.x + avatarBox.width / 2).toBeCloseTo(center, 0);
					expect(nameBox.x + nameBox.width / 2).toBeCloseTo(center, 0);
					expect(avatarBox.y - headerBox.y).toBeGreaterThanOrEqual(mobileBotHome ? 0 : headerBox.height);
					expect(nameBox.y).toBeGreaterThanOrEqual(avatarBox.y + avatarBox.height);
					expect(logBox.y).toBeGreaterThan(nameBox.y + nameBox.height);
					await page.screenshot({ path: info.outputPath(`${viewport}-agent-idle.png`), animations: "disabled" });
					api.update({ ...reply, streaming: true, version: 2, run: { ...run, status: "running" } });
					await expect(status).toHaveText("正在输入");
					await expect(name).toBeVisible();
					await expect(status.locator("[aria-hidden=true]")).toHaveCount(0);
					expect((await status.boundingBox())?.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
					await expect(mobileBotHome ? botSettings : more).toBeInViewport();
					await page.screenshot({ path: info.outputPath(`${viewport}-agent.png`), animations: "disabled" });
					api.updateRun({ ...run, status: "completed" });
					await expect(status).toHaveCount(0);
					if (mobileBotHome) {
						await accountSettings.click();
						await expect(page).toHaveURL(/\/me$/);
						const me = page.getByRole("dialog", { name: "我", exact: true });
						await expect(me.getByRole("button", { name: "账号与安全", exact: true })).toBeVisible();
						const accountBack = me.getByRole("button", { name: "返回", exact: true });
						await expect(accountBack).toHaveText("");
						await page.screenshot({
							path: info.outputPath("phone-agent-account-settings.png"),
							animations: "disabled",
						});
						await accountBack.click();
						await expect(page).toHaveURL(/\/messages\/main$/);
						await botSettings.click();
						const botDetail = page.getByRole("dialog", { name: bot.displayName, exact: true });
						await expect(botDetail.getByText(`@${bot.handle}`, { exact: true })).toBeVisible();
						const botBack = botDetail.getByRole("button", { name: "返回", exact: true });
						await expect(botBack).toHaveText("");
						await page.screenshot({ path: info.outputPath("phone-agent-bot-settings.png"), animations: "disabled" });
						await botBack.click();
						await expect(botDetail).toHaveCount(0);
						await expect(page).toHaveURL(/\/messages\/main$/);
						await expect(name).toBeVisible();
						await expect(status).toHaveCount(0);
					}
				} else {
					const title = topbar.getByText(chat.title ?? friend.displayName, { exact: true });
					await expect(title).toBeVisible();
					const leading = phone ? topbar.getByRole("button", { name: "返回", exact: true }) : topbar;
					if (phone) await expect(leading).toHaveText("");
					const [leadingBox, titleBox] = await Promise.all([leading.boundingBox(), title.boundingBox()]);
					if (!leadingBox || !titleBox) throw new Error("Expected a visible leading title");
					const start = phone ? leadingBox.x + leadingBox.width : leadingBox.x;
					expect(titleBox.x - start).toBeGreaterThanOrEqual(0);
					expect(titleBox.x - start).toBeLessThanOrEqual(16);
					await expect(topbar.locator("[data-avatar-fallback], img")).toHaveCount(0);
					await expect(avatars).toHaveCount(mode === "group" ? 4 : 3);
					await expect(senderNames).toHaveText(
						mode === "group" ? [friend.displayName, teammate.displayName, self.displayName, bot.displayName] : [],
					);
					const incoming = log.locator('[data-run-sender="other"] [data-message-sender-avatar]').first();
					const outgoing = log.locator('[data-run-sender="self"] [data-message-sender-avatar]');
					const [logBox, incomingBox, outgoingBox] = await Promise.all([
						log.boundingBox(),
						incoming.boundingBox(),
						outgoing.boundingBox(),
					]);
					if (!logBox || !incomingBox || !outgoingBox) throw new Error("Both message directions need visible avatars");
					expect(incomingBox.x).toBeCloseTo(logBox.x, 0);
					expect(outgoingBox.x + outgoingBox.width).toBeCloseTo(logBox.x + logBox.width, 0);
					await page.screenshot({ path: info.outputPath(`${viewport}-${mode}.png`), animations: "disabled" });
				}
			});
		}
	});
}

test("The empty Agent conversation retains its label and one avatar", async ({ page }) => {
	await isolateChat(page, { items: [] });
	await page.goto(`/messages/${conversation.id}`);
	const detail = page.locator('[data-page-layer="detail"]');
	await expect(detail.getByText("还没有消息", { exact: true })).toBeVisible();
	await expect(detail.locator("[data-chat-agent-title] [data-avatar-fallback]")).toHaveCount(1);
	await expect(detail.locator("[data-frame-scroll] [data-avatar-fallback]")).toHaveCount(0);
});

test("Agent visit with an owner keeps participant avatars", async ({ page }) => {
	const visit: Conversation = {
		...chats.agent,
		members: [self, bot, teammate],
		visit: { id: "visit", role: "visitor", state: "open", trialSent: 0, trialLimit: 3, botId: bot.memberId },
	};
	await isolateChat(page, {
		items: [
			from(visit, self, 1, "请确认这份材料。"),
			from(visit, bot, 2, "好的，我来帮你核对。"),
			from(visit, teammate, 3, "这一条由我补充。"),
		],
	});
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [visit] } }));
	await page.goto(`/messages/${visit.id}`);
	await expect(page.locator("[data-chat-agent-title]")).toHaveText(bot.displayName);
	await expect(page.getByRole("log").locator("[data-message-sender-avatar]")).toHaveCount(3);
});

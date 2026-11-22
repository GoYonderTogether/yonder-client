import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { bot, conversation, isolateChat, person } from "./chat-fixture.ts";

const recent = { ...person, id: "recent-contact", handle: "recentfriend", displayName: "最近聊过的好友" };
const botContact = {
	...person,
	id: "other-bot",
	kind: "bot",
	handle: "remotehelper",
	displayName: "可邀请的 Bot",
	ownerId: recent.id,
	isDefault: true,
} satisfies Member;

function participant(member: Member): ConversationMember {
	return {
		memberId: member.id,
		kind: member.kind,
		displayName: member.displayName,
		handle: member.handle,
		avatarUrl: member.avatarUrl,
	};
}

const recentChat: Conversation = {
	...conversation,
	id: "recent-direct",
	isPrimary: false,
	members: [person, recent].map(participant),
	lastMessageAt: "2026-11-18T14:00:00Z",
};

async function openGroupChat(page: Page, title = "聊天设置验收群") {
	await isolateChat(page, { items: [] });
	let group: Conversation = {
		...conversation,
		kind: "group",
		title,
		isPrimary: false,
		ownerId: person.id,
		groupBotPayer: "mentioner",
	};
	await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [group, recentChat] } }));
	await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [person, bot, recent, botContact] } }));
	const added: string[][] = [];
	await page.route(`**/v1/conversations/${group.id}/members`, (route) => {
		const { memberIds } = route.request().postDataJSON() as { memberIds: string[] };
		added.push(memberIds);
		group = {
			...group,
			members: [
				...group.members,
				...[recent, botContact].filter((member) => memberIds.includes(member.id)).map(participant),
			],
			version: group.version + 1,
		};
		return route.fulfill({ json: group });
	});
	await page.goto(`/messages/${group.id}`);
	return added;
}

const settingsButton = (page: Page) => page.getByRole("button", { name: "聊天设置", exact: true });
const groupInfo = (page: Page) => page.getByRole("dialog", { name: "群资料", exact: true });
const memberPicker = (page: Page) => page.getByRole("dialog", { name: "添加成员", exact: true });

async function expectBottomAction(panel: Locator) {
	const footer = panel.getByRole("button", { name: "解散群聊", exact: true });
	await expect(footer).toBeInViewport();
	const panelBox = await panel.boundingBox();
	const footerBox = await footer.boundingBox();
	if (!panelBox || !footerBox) throw new Error("The group view and its dissolve action must be visible");
	expect(panelBox.y + panelBox.height - footerBox.y - footerBox.height).toBeLessThanOrEqual(48);
}

test("private chat ellipsis opens the peer card and Bot details with separate settings pages", async ({
	page,
}, info) => {
	await isolateChat(page, { items: [] });
	let ownBot: Member = { ...bot, ownerId: person.id, isDefault: true };
	await page.route("**/v1/me", (route) =>
		route.fulfill({ json: { member: person, bot: ownBot, settings: { locale: "zh-CN", theme: "light" } } }),
	);
	const rename = "栗子助理";
	await page.route(`**/v1/bots/${bot.id}`, (route) => {
		expect(route.request().method()).toBe("PATCH");
		expect(route.request().postDataJSON()).toEqual({ displayName: rename, avatarColor: "3" });
		ownBot = { ...ownBot, displayName: rename, avatarColor: "3", version: 2 };
		return route.fulfill({ json: ownBot });
	});
	let channelReads = 0;
	await page.route("**/v1/channels", (route) => {
		channelReads++;
		return route.fulfill({ json: { available: true, wechatAvailable: true, items: [] } });
	});
	const capture = async (panel: Locator, name: string) => {
		await expect
			.poll(() => panel.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41))
			.toBeCloseTo(0, 0);
		await page.screenshot({ path: info.outputPath(name) });
	};
	const visitChat: Conversation = {
		...recentChat,
		id: "remote-bot-visit",
		members: [person, recent, botContact].map(participant),
		visit: { id: "remote-visit", role: "visitor", state: "open", trialSent: 0, trialLimit: 5, botId: botContact.id },
	};
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({ json: { items: [conversation, recentChat, visitChat] } }),
	);
	await page.route(`**/v1/members/${recent.handle}`, (route) =>
		route.fulfill({ json: { card: { ...recent, owner: null }, relation: "contact", conversationId: recentChat.id } }),
	);
	await page.route(`**/v1/members/${botContact.handle}`, (route) =>
		route.fulfill({ json: { card: { ...botContact, owner: null }, relation: "none", conversationId: visitChat.id } }),
	);
	await page.goto(`/messages/${recentChat.id}`);
	await settingsButton(page).click();
	const card = page.getByRole("dialog", { name: "资料", exact: true });
	await expect(card.getByRole("heading", { name: recent.displayName })).toBeVisible();
	await card.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(card).toHaveCount(0);
	await page.goto("/messages/main");
	await settingsButton(page).click();
	const detail = page.locator('[data-page-layer="side"]').filter({ visible: true });
	await expect(detail.getByText(`@${bot.handle}`, { exact: true })).toBeVisible();
	await expect(detail.getByRole("textbox")).toHaveCount(0);
	await expect(detail.getByRole("button", { name: "删除 Bot" })).toHaveCount(0);
	expect(channelReads).toBe(0);
	await capture(detail, "desktop-bot-detail.png");
	await detail.getByRole("button", { name: /^基本资料/ }).click();
	const edit = page.getByRole("dialog", { name: "基本资料" });
	await expect(edit.getByRole("textbox", { name: "名字", exact: true })).toHaveValue(bot.displayName);
	await capture(edit, "desktop-bot-edit.png");
	await edit.getByRole("textbox", { name: "名字", exact: true }).fill("未提交的名字");
	const discard = page.getByRole("dialog", { name: "放弃更改", exact: true });
	await page.goBack();
	await discard.getByRole("button", { name: "取消" }).click();
	await expect(edit.getByRole("textbox", { name: "名字", exact: true })).toHaveValue("未提交的名字");
	await page.goBack();
	await discard.getByRole("button", { name: "放弃更改" }).click();
	await expect(edit).toHaveCount(0);
	await expect(page).toHaveURL(/\/messages\/main$/);
	await detail.getByRole("button", { name: /^基本资料/ }).click();
	await expect(edit.getByRole("textbox", { name: "名字", exact: true })).toHaveValue(bot.displayName);
	await edit.getByRole("textbox", { name: "名字", exact: true }).fill(rename);
	await edit.getByRole("button", { name: "沙色" }).click();
	await edit.getByRole("button", { name: "保存资料", exact: true }).click();
	await expect(edit).toHaveCount(0);
	await expect(detail).toHaveAttribute("aria-label", rename);
	await detail.getByRole("button", { name: /^渠道/ }).click();
	const channels = page.getByRole("dialog", { name: "消息渠道" });
	const feishu = channels.getByRole("button", { name: "飞书 连接", exact: true });
	await expect(feishu).toBeVisible();
	await expect(channels.getByRole("button", { name: "微信 iLink 连接", exact: true })).toBeVisible();
	await expect(channels.getByRole("button", { name: "QQ 暂不可用", exact: true })).toBeVisible();
	await capture(channels, "desktop-bot-channels.png");
	await feishu.click();
	const channel = page.getByRole("dialog", { name: "飞书", exact: true });
	await expect(channel.getByRole("button", { name: "连接飞书", exact: true })).toBeVisible();
	await page.goBack();
	await expect(channel).toHaveCount(0);
	await expect(feishu).toBeFocused();
	await page.goBack();
	await expect(channels).toHaveCount(0);
	await expect(detail.getByRole("button", { name: /^渠道/ })).toBeFocused();
	await page.goto(`/messages/${visitChat.id}`);
	await settingsButton(page).click();
	await expect(card.getByRole("heading", { name: botContact.displayName })).toBeVisible();
});

for (const width of [1440, 600]) {
	test(`desktop ${width}px keeps a right drawer and a centered contact picker`, async ({ page }, info) => {
		await page.setViewportSize({ width, height: 900 });
		await openGroupChat(page);
		await expect(settingsButton(page)).toBeVisible();
		if (width === 1440) await page.screenshot({ path: info.outputPath("desktop-chat-header.png") });
		await settingsButton(page).click();
		const panel = groupInfo(page);
		await expect(panel).toBeVisible();
		await expect.poll(() => panel.evaluate((node) => Math.round(node.getBoundingClientRect().right))).toBe(width);
		await expect(panel.getByRole("button", { name: "修改群名" }).locator("[data-avatar-fallback]")).toHaveCount(2);
		await expectBottomAction(panel);
		if (width === 1440) await page.screenshot({ path: info.outputPath("desktop-group-settings.png") });

		await panel.getByRole("button", { name: "添加成员", exact: true }).click();
		const picker = memberPicker(page);
		await expect(picker.getByRole("heading", { name: "添加成员", exact: true })).toBeVisible();
		const center = await picker.evaluate((node) => {
			const { left, right } = node.getBoundingClientRect();
			return (left + right) / 2;
		});
		expect(center).toBeCloseTo(width / 2, 0);
		await expect(picker.getByRole("group", { name: "最近联系人" }).getByText(recent.displayName)).toBeVisible();
		await expect(picker.getByRole("group", { name: "全部联系人" }).getByText(botContact.displayName)).toBeVisible();
		await expect(picker.getByText(bot.displayName, { exact: true })).toHaveCount(0);
		if (width === 1440) await page.screenshot({ path: info.outputPath("desktop-add-members.png") });

		await picker.getByRole("button", { name: "关闭", exact: true }).click();
		await expect(picker).toHaveCount(0);
		const box = await panel.boundingBox();
		if (!box) throw new Error("The drawer should stay open after the picker closes");
		await page.mouse.click(box.x - 16, 125);
		await expect(panel).toHaveCount(0);
	});
}

test.describe("phone chat settings", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});

	test("long title, shared page back, and selection from recent and full contact lists", async ({ page }, info) => {
		const title = "一段很长的中文群聊名称用于检查标题与两个导航按钮".repeat(3);
		const added = await openGroupChat(page, title);
		const more = settingsButton(page);
		await expect(more).toBeVisible();
		const detail = page.locator('[data-page-layer="detail"]');
		await expect
			.poll(() => detail.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41))
			.toBeCloseTo(0, 2);
		const header = detail.locator("[data-shell-topbar]");
		const backBox = await header.getByRole("button", { name: "返回", exact: true }).boundingBox();
		const moreBox = await more.boundingBox();
		const titleBox = await header.getByText(title, { exact: true }).boundingBox();
		if (!backBox || !moreBox || !titleBox) throw new Error("The top bar should show its title and both controls");
		expect(backBox.x).toBeGreaterThanOrEqual(0);
		expect(backBox.x + backBox.width).toBeLessThanOrEqual(titleBox.x);
		expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(moreBox.x);
		expect(moreBox.x + moreBox.width).toBeLessThanOrEqual(390);
		await more.press("Enter");

		const panel = groupInfo(page);
		await expect(panel).toHaveAttribute("data-page-side", "right");
		await expect.poll(() => panel.evaluate((node) => Math.round(node.getBoundingClientRect().left))).toBe(0);
		await expect(panel.getByRole("button", { name: "修改群名" }).locator("[data-avatar-fallback]")).toHaveCount(2);
		await expectBottomAction(panel);
		await page.screenshot({ path: info.outputPath("phone-group-settings.png") });
		const add = panel.getByRole("button", { name: "添加成员", exact: true });
		await add.press("Enter");
		const picker = memberPicker(page);
		await expect(picker).toHaveAttribute("data-page-side", "right");
		await expect.poll(() => picker.evaluate((node) => Math.round(node.getBoundingClientRect().left))).toBe(0);
		await expect(picker).toBeFocused();
		await picker.getByRole("button", { name: "返回", exact: true }).click();
		await expect(picker).toHaveCount(0);
		await expect(add).toBeFocused();
		await add.press("Enter");

		const recentList = picker.getByRole("group", { name: "最近联系人" });
		const all = picker.getByRole("group", { name: "全部联系人" });
		await expect(recentList.getByRole("checkbox", { name: recent.displayName })).toBeVisible();
		await expect.poll(() => picker.evaluate((node) => Math.round(node.getBoundingClientRect().left))).toBe(0);
		await page.screenshot({ path: info.outputPath("phone-add-members.png") });
		await recentList.getByText(recent.displayName).click();
		await expect(all.getByRole("checkbox", { name: recent.displayName })).toBeChecked();
		await all.getByText(botContact.displayName).click();
		await picker.getByRole("button", { name: "添加", exact: true }).click();
		expect(added).toEqual([[recent.id, botContact.id]]);
		await expect(picker).toHaveCount(0);
		await expect(panel).toBeVisible();
		await panel.getByRole("button", { name: "返回", exact: true }).click();
		await expect(panel).toHaveCount(0);
		await expect(more).toBeFocused();
	});
});

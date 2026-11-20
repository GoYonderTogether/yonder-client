import { expect, test } from "@playwright/test";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

test.use({
	viewport: { width: 320, height: 740 },
	isMobile: true,
	hasTouch: true,
	timezoneId: "Asia/Singapore",
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});

test("Bot list prioritizes duty while preserving identity, time and external owner", async ({ page }, info) => {
	const self = conversation.members.find(({ memberId }) => memberId === person.id) as ConversationMember;
	const original = conversation.members.find(({ memberId }) => memberId === bot.id) as ConversationMember;
	const owner = { handle: "owner-name", displayName: "非常长的拥有者姓名及其完整名称".repeat(2) };
	const role = "负责团队每周日程与会议资料整理并跟踪事项落实进度";
	const ordinaryRole = "整理会议资料";
	const main = { ...original, displayName: "个人事务和研究工作的协作助手" };
	const ordinary = { ...original, memberId: "owned-bot", displayName: "跨项目资料整理与研究协作助手" };
	const external = {
		...original,
		memberId: "external-bot",
		displayName: "来访助手的长名称".repeat(3),
		botOwner: owner,
	};
	const typing = { ...message("message-01", "正在根据会话内容整理答复。", false, true), senderId: external.memberId };
	await isolateChat(page, { items: [typing] });
	await page.route("**/v1/me", (route) =>
		route.fulfill({ json: { member: person, bot: { ...bot, displayName: main.displayName, botRoleLabel: role } } }),
	);
	await page.route("**/v1/contacts", (route) =>
		route.fulfill({
			json: {
				items: [
					{
						...bot,
						id: ordinary.memberId,
						displayName: ordinary.displayName,
						isDefault: false,
						botRoleLabel: ordinaryRole,
					},
				],
			},
		}),
	);
	const foreignChat: Conversation = {
		...conversation,
		id: "foreign-chat",
		members: [self, external],
		isPrimary: false,
		visit: { id: "visit", role: "visitor", state: "trial", trialSent: 1, trialLimit: 3, botId: external.memberId },
	};
	const lastMessage = { ...typing, createdAt: "2026-11-15T00:07:00Z" };
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({
			json: {
				items: [
					{ ...conversation, members: [self, main], lastMessage },
					{ ...conversation, id: "own-chat", members: [self, ordinary], isPrimary: false, lastMessage },
					{ ...foreignChat, lastMessage },
				],
			},
		}),
	);
	await page.goto("/messages");
	const list = page.getByRole("list", { name: "消息" });
	const ownRow = list.getByRole("button", { name: new RegExp(main.displayName) });
	const ordinaryRow = list.getByRole("button", { name: new RegExp(ordinary.displayName) });
	const foreignRow = list.getByRole("button", { name: new RegExp(external.displayName) });
	await expect(ownRow).toBeVisible({ timeout: 20_000 });
	await expect(ownRow.locator("[data-bot-label]")).toHaveText("主 Bot");
	await expect(ownRow.locator("[data-bot-duty]")).toHaveAttribute("title", role);
	await expect(ordinaryRow.locator("[data-bot-label]")).toHaveText("AI");
	await expect(ordinaryRow.locator("[data-bot-duty]")).toHaveText(ordinaryRole);
	await expect(foreignRow.locator("[data-bot-label]")).toHaveText("AI");
	await expect(foreignRow.locator("[data-bot-duty]")).toHaveCount(0);
	const ownerText = foreignRow.locator("[data-bot-owner]");
	await expect(ownerText).toHaveAttribute("title", `@${owner.displayName} (@${owner.handle})`);
	await expect(ownerText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(ownRow.locator("[data-bot-duty]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	const pillFill = (row: typeof ownRow) =>
		row.locator("[data-bot-label]").evaluate((pill) => getComputedStyle(pill).backgroundColor);
	expect(await pillFill(ownRow)).not.toBe(await pillFill(ordinaryRow));
	expect(await pillFill(ordinaryRow)).toBe(await pillFill(foreignRow));
	for (const row of [ownRow, ordinaryRow, foreignRow]) {
		const pill = row.locator("[data-bot-label]");
		await expect(pill).toHaveCSS("height", "20px");
		await expect(pill).toHaveCSS("border-radius", "9999px");
		await expect(pill).toHaveCSS("flex-shrink", "0");
		await expect(pill).toHaveCSS("align-items", "center");
		await expect(pill).toHaveCSS("justify-content", "center");
		const timestamp = row.getByText("8:07", { exact: true });
		await expect(timestamp).toBeInViewport();
		await expect(timestamp).toHaveCSS("flex-shrink", "0");
		const boxes = await row
			.locator("[data-bot-display-name], [data-bot-owner], [data-bot-label], [data-bot-duty]")
			.evaluateAll((pieces) =>
				pieces.map((piece) => {
					const { top, height, right, left, width } = piece.getBoundingClientRect();
					const style = getComputedStyle(piece);
					return {
						middle: top + height / 2,
						right,
						left,
						width,
						overflow: style.textOverflow,
						pill: piece.hasAttribute("data-bot-label"),
					};
				}),
			);
		const time = await timestamp.boundingBox();
		if (!time) throw new Error("Expected a visible time");
		for (const [index, box] of boxes.entries()) {
			expect(box.width).toBeGreaterThan(0);
			if (!box.pill) expect(box.overflow).toBe("ellipsis");
			expect(box.right).toBeLessThanOrEqual(boxes[index + 1]?.left ?? time.x);
			expect(Math.abs(box.middle - boxes[0].middle)).toBeLessThanOrEqual(1);
		}
	}
	const overflows = (element: typeof ownRow) => element.evaluate((node) => node.scrollWidth > node.clientWidth);
	expect(await overflows(ordinaryRow.locator("[data-bot-display-name]"))).toBe(true);
	const dutyWidth = await ordinaryRow.locator("[data-bot-duty]").evaluate((node) => ({
		full: node.scrollWidth,
		available: node.clientWidth,
	}));
	expect(dutyWidth.full).toBeLessThanOrEqual(dutyWidth.available);
	expect(await overflows(ownRow.locator("[data-bot-display-name]"))).toBe(true);
	expect(await overflows(ownRow.locator("[data-bot-duty]"))).toBe(true);
	await page.screenshot({ path: info.outputPath("duty-priority-320.png"), scale: "css" });

	await foreignRow.click();
	const header = page.locator("[data-chat-agent-title]");
	await expect(header.locator("[data-bot-owner]")).toBeVisible();
	await expect(header.getByRole("status")).toHaveText("正在输入");
	await expect(header.locator("[data-bot-label]")).toHaveText("AI");
});

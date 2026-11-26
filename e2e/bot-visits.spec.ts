import { expect, test } from "@playwright/test";
import type { Conversation, ConversationMember, OutwardRequestCard } from "@yonder/protocol";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const visitor: ConversationMember = {
	memberId: "member-visitor",
	kind: "person",
	handle: "zoran",
	displayName: "Zoran",
	avatarUrl: null,
};
const owner = { ...person, memberId: person.id } satisfies ConversationMember;
const friend: Conversation = {
	...conversation,
	id: "friend-direct",
	isPrimary: false,
	members: [owner, visitor],
	unreadCount: 2,
	pinned: false,
};
const incoming = {
	...friend,
	id: "visit-incoming",
	members: [...conversation.members, visitor],
	unreadCount: 5,
	visit: { id: "visit-host", role: "host", state: "open", trialSent: 0, trialLimit: 3, botId: bot.id },
} satisfies Conversation;
const externalBot: ConversationMember = {
	...bot,
	memberId: "member-external-bot",
	displayName: "Yonder",
	botOwner: { handle: "jiajia", displayName: "佳佳", avatarUrl: null },
};
const outgoing: Conversation = {
	...friend,
	id: "visit-outgoing",
	members: [owner, externalBot],
	unreadCount: 0,
	visit: { ...incoming.visit, id: "visit-visitor", role: "visitor", botId: externalBot.memberId },
};

for (const phone of [false, true]) {
	test(`incoming visits fold and the composer relays on ${phone ? "mobile" : "desktop"}`, async ({ page }, info) => {
		await page.setViewportSize({ width: phone ? 390 : 1440, height: 844 });
		if (phone)
			await page.addInitScript(() => {
				Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Linux; Android 14) Mobile" });
			});
		await isolateChat(page, { items: [] });
		await page.route("**/v1/conversations", (route) =>
			route.fulfill({ json: { items: [conversation, incoming, friend, outgoing] } }),
		);
		const body = "能帮我确认一下周五的场地吗？";
		const saved = { ...message("message-01", body, true), conversationId: outgoing.id };
		await page.route(`**/v1/conversations/${outgoing.id}/messages*`, (route) =>
			route.fulfill({ json: { items: [saved], nextCursor: null, hasMore: false } }),
		);
		await page.route(`**/v1/messages/${saved.id}/ask-owner`, (route) => {
			expect(route.request().method()).toBe("POST");
			const card: OutwardRequestCard = { id: "owr-visit", state: "open", expiresAt: "2026-11-27T00:00:00Z" };
			return route.fulfill({ json: card });
		});
		await page.goto("/messages");

		const list = page.getByRole("list", { name: "消息", exact: true });
		const folder = list.getByRole("button", { name: /^Bot 来访/ });
		const visitorRow = list.getByRole("button", { name: /^Zoran/ });
		await expect(folder).toHaveAttribute("aria-expanded", "false");
		await expect(folder.getByRole("img", { name: "有新的 Bot 来访" })).toBeVisible();
		await expect(visitorRow).toHaveCount(1);
		await expect(page.getByRole("button", { name: "消息", exact: true })).toHaveAccessibleDescription("2 条未读消息");
		await page.screenshot({ path: info.outputPath("bot-visits-collapsed.png"), animations: "disabled" });

		await folder.click();
		const incomingRow = list.getByRole("button", { name: /找你的 界面验收 BOT/ });
		await expect(folder).toHaveAttribute("aria-expanded", "true");
		await expect(visitorRow).toHaveCount(2);
		await expect(incomingRow.locator("[data-visit-avatar-overlay]")).toBeVisible();
		await page.screenshot({ path: info.outputPath("bot-visits-expanded.png"), animations: "disabled" });
		await incomingRow.click();
		await expect(page).toHaveURL(/\/messages\/visit-incoming$/);
		await expect(page.getByRole("button", { name: "请 Bot 转达" })).toHaveCount(0);
		if (phone) await page.goto("/messages");

		const externalRow = list.getByRole("button", { name: /Yonder.*佳佳/ });
		await expect(externalRow.locator("[data-visit-avatar-overlay]")).toBeVisible();
		await externalRow.click();
		await expect(page.getByText(body, { exact: true })).toBeVisible();
		const relay = page.getByRole("button", { name: "请 Bot 转达" });
		await expect(relay).toBeEnabled();
		const composer = page.locator("textarea").first();
		const [actionBounds, composerBounds] = await Promise.all([relay.boundingBox(), composer.boundingBox()]);
		expect(actionBounds && composerBounds && actionBounds.y < composerBounds.y).toBe(true);
		await relay.click();
		await expect(relay).toBeDisabled();
		await expect(page.getByText("已交给主 Bot", { exact: true })).toBeVisible();
		await page.screenshot({ path: info.outputPath("bot-visits-relay.png"), animations: "disabled" });
	});
}

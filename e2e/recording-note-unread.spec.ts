import { expect, test } from "@playwright/test";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});

test("opening the owning Bot chat reads the recording capsule and leaves later unread intact", async ({
	page,
}, testInfo) => {
	const older = message("message-01", "旧的回复");
	// Actual API shape from toChatMessage: a recording row is exposed as blank text with a meeting.
	const recording = {
		...message("message-02", ""),
		meeting: { id: "mtg_test", title: "周五评审录音", startedAt: 10000, endedAt: 11000, durationMs: 1000 },
	};
	const next = message("message-03", "稍后发来的回复");
	const items = [older, recording];
	const group = {
		...conversation,
		id: "another-chat",
		kind: "group",
		isPrimary: false,
		title: "其他群聊",
		unreadCount: 2,
	};
	await isolateChat(page, { items });
	let readThrough = 0;
	const reads: string[] = [];
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({ json: { items: [{ ...conversation, unreadCount: items.length - readThrough - 1 }, group] } }),
	);
	await page.route(`**/v1/conversations/${conversation.id}/read`, (route) => {
		const { messageId } = route.request().postDataJSON();
		reads.push(messageId);
		readThrough = Math.max(
			readThrough,
			items.findIndex((item) => item.id === messageId),
		);
		return route.fulfill({ json: { ok: true } });
	});

	await page.goto("/messages");
	const nav = page.getByRole("navigation", { name: "主导航" });
	const mainBot = nav.getByRole("button", { name: bot.displayName, exact: true });
	const messages = nav.getByRole("button", { name: "消息", exact: true });
	const badge = (container: typeof nav) => container.getByRole("img", { name: /未读消息/ });
	const row = page.getByRole("list", { name: "消息" }).getByRole("button", { name: new RegExp(bot.displayName) });
	await expect(badge(mainBot)).toBeVisible();
	await expect(badge(row)).toBeVisible();
	expect(reads).toEqual([]);
	await page.screenshot({ path: testInfo.outputPath("recording-unread-before-opening.png") });

	await mainBot.click();
	await expect(page.getByRole("button", { name: /周五评审录音/ })).toBeVisible();
	await expect.poll(() => reads[0]).toBe(recording.id);
	await expect(badge(mainBot)).toHaveCount(0);
	await expect(badge(messages)).toHaveAccessibleName("2 条未读消息");
	await page.screenshot({ path: testInfo.outputPath("recording-unread-after-opening.png") });

	await messages.click();
	await expect(badge(row)).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("recording-list-after-opening.png") });
	await mainBot.click();
	await expect(page.getByRole("button", { name: /周五评审录音/ })).toBeVisible();
	await expect(badge(mainBot)).toHaveCount(0);
	await messages.click();
	await expect(badge(row)).toHaveCount(0);

	items.push(next);
	await page.reload();
	await expect(badge(mainBot)).toBeVisible();
	await expect(badge(row)).toBeVisible();
	await mainBot.click();
	await expect(page.getByText(next.body ?? "")).toBeVisible();
	await expect.poll(() => reads.at(-1)).toBe(next.id);
	await expect(badge(mainBot)).toHaveCount(0);
	await expect(badge(messages)).toHaveAccessibleName("2 条未读消息");
});

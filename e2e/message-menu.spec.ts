import { expect, type Page, test } from "@playwright/test";
import type { ConversationMember, Message } from "@yonder/protocol";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

/**
 * The founder's 11-25/11-26 rules for the message list, end to end:
 *
 *   - both sides show the sender's avatar in every conversation, one per run;
 *   - a long bubble still fills its row and every bubble is a whole rectangle under the cap;
 *   - the avatar, the name and a Bot's tag are one hit area that opens the profile, and @ is separate;
 *   - the desktop @ control appears on the sender's name and only asks for that member;
 *   - a long press on a touch avatar is the way to @;
 *   - a message's own menu offers copy and @Ta, and nothing it cannot do.
 */

const a: ConversationMember = {
	memberId: "group-person-a",
	kind: "person",
	handle: "groupa",
	displayName: "林知夏",
	avatarUrl: "/files/group-a.svg",
};
const b: ConversationMember = {
	...a,
	memberId: "group-person-b",
	handle: "groupb",
	displayName: "周予安",
	avatarUrl: null,
};
const self = conversation.members.find((member) => member.memberId === person.id) as ConversationMember;
const assistant = conversation.members.find((member) => member.memberId === bot.id) as ConversationMember;
const members = [self, a, b, assistant];

function from(sender: ConversationMember, index: number, body: string | null, streaming = false): Message {
	return {
		...message(`menu-${String(index).padStart(2, "0")}`, body, false, streaming),
		senderId: sender.memberId,
		senderKind: sender.kind,
	};
}

const long =
	"这是一段足够长的中文，用来确认聊天气泡的正文会排满自己的行，并且多行气泡仍然是一个完整矩形，不会因为头像而变窄或被切断。";
const sequence = () => [
	from(a, 1, "先看这一段。"),
	from(a, 2, "这条仍由我发送。"),
	from(self, 3, "我这边看到了。"),
	from(self, 4, long.repeat(2)),
	from(assistant, 5, "收到，我来整理这份比较长的回复，确认气泡在多行时仍然完整。"),
];

async function openGroup(page: Page, options: { items?: Message[]; width?: number } = {}) {
	await page.route("**/files/group-a.svg", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#d4dfed"/></svg>',
		}),
	);
	const api = await isolateChat(page, {
		group: true,
		members,
		items: options.items ?? sequence(),
		ownerId: a.memberId,
	});
	// A profile opens the member card; the isolated API answers it like any other card.
	for (const member of [a, b])
		await page.route(`**/v1/members/${member.handle}`, (route) =>
			route.fulfill({
				json: { card: { ...member, owner: null }, relation: "contact", conversationId: conversation.id },
			}),
		);
	if (options.width) await page.setViewportSize({ width: options.width, height: 900 });
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.locator("[data-message-run]")).toHaveCount(3);
	return api;
}

test("both sides show one avatar per run, and a wrapped bubble stays a whole rectangle", async ({ page }) => {
	await openGroup(page, { width: 1280 });
	const log = page.getByRole("log");
	const runs = log.locator("[data-message-run]");
	for (let index = 0; index < 3; index++)
		await expect(runs.nth(index).locator("[data-message-sender-avatar]")).toHaveCount(1);
	const outgoing = runs.nth(1).locator("[data-message-sender-avatar]");
	const incoming = runs.nth(0).locator("[data-message-sender-avatar]");
	const geometry = await log.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const longBubble = element.querySelector<HTMLElement>('[data-message-id="menu-04"] .message-bubble');
		if (!longBubble) throw new Error("Expected the long outgoing bubble");
		const run = longBubble.closest<HTMLElement>(".message-run");
		if (!run) throw new Error("Expected the run");
		const style = getComputedStyle(longBubble);
		const range = document.createRange();
		range.selectNodeContents(longBubble.querySelector(".message-content") ?? longBubble);
		const lines = new Set([...range.getClientRects()].map((rect) => rect.top));
		return {
			logWidth: box.width,
			runWidth: run.getBoundingClientRect().width,
			bubbleWidth: longBubble.getBoundingClientRect().width,
			left: style.borderTopLeftRadius,
			top: style.borderTopRightRadius,
			right: style.borderBottomRightRadius,
			bottomLeft: style.borderBottomLeftRadius,
			lines: lines.size,
		};
	});
	expect(geometry.lines).toBeGreaterThan(1);
	// 90% of the run, less the avatar and its gap, is the cap; the bubble takes 90% minus 4.
	expect(geometry.bubbleWidth).toBeLessThanOrEqual(geometry.runWidth * 0.9 + 1);
	expect(geometry.bubbleWidth).toBeGreaterThan(geometry.runWidth * 0.6);
	// A whole rectangle: three corners share one radius, and only the tail's own corner is square.
	expect(geometry.left).toBe(geometry.top);
	expect(geometry.left).toBe(geometry.bottomLeft);
	expect(geometry.right).toBe("0px");
	await expect(incoming).toBeVisible();
	await expect(outgoing).toBeVisible();
});

test("the avatar, the name and the Bot tag open one profile; @ is its own control", async ({ page }) => {
	await openGroup(page, { width: 1280 });
	const log = page.getByRole("log");
	const run = log.locator(`[data-message-run="${a.memberId}"]`);
	await run.scrollIntoViewIfNeeded();
	await run.hover();
	const mention = page.locator(`[data-message-mention="${a.memberId}"]`).first();
	await expect(mention).toBeVisible({ timeout: 300 });
	const profile = page.locator('[data-page-layer="side"]').filter({ visible: true });
	const input = page.getByRole("textbox", { name: /^对 / });
	// The name is a profile hit area, not an @ control: it opens the card and inserts nothing.
	await run.locator("[data-message-sender-header] button").first().click();
	await expect(profile.getByRole("heading", { name: a.displayName })).toBeVisible();
	// The side panel takes the composer's place, so the draft is checked once the chat is back.
	await profile.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(profile).toHaveCount(0);
	await expect(input).toHaveValue("");
	// The @ control is separate and only asks for that member: no card, nothing sent.
	await run.hover();
	await mention.click();
	await expect(input).toHaveValue(`@${a.displayName} `);
	await expect(input).toBeFocused();
	await expect(profile).toHaveCount(0);
	const value = await input.evaluate((field: HTMLTextAreaElement) => ({
		value: field.value,
		caret: field.selectionStart,
	}));
	expect(value.caret).toBe(value.value.length);
	// The avatar is the same hit area as the name: it opens the card and leaves the draft alone.
	await run.locator("[data-message-sender-avatar] button").first().click();
	await expect(profile.getByRole("heading", { name: a.displayName })).toBeVisible();
	await profile.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(input).toHaveValue(`@${a.displayName} `);
});

test("sending right after an @ carries that member in mentionedMemberIds", async ({ page }) => {
	const api = await openGroup(page, { width: 1280 });
	const run = page.locator(`[data-message-run="${a.memberId}"]`);
	await run.scrollIntoViewIfNeeded();
	await run.hover();
	await page.locator(`[data-message-mention="${a.memberId}"]`).first().click();
	const input = page.getByRole("textbox", { name: /^对 / });
	await input.press("Enter");
	await expect.poll(() => api.sent.at(-1)).toBeTruthy();
	const payload = api.sent.at(-1) as { body: string; mentionedMemberIds?: string[] };
	// The send trims the trailing space; the binding is what carries the member.
	expect(payload.body).toBe(`@${a.displayName}`);
	expect(payload.mentionedMemberIds).toEqual([a.memberId]);
});

test("a message's menu offers copy and @Ta on someone else's message, and copy alone on your own", async ({ page }) => {
	await openGroup(page, { width: 1280 });
	const log = page.getByRole("log");
	const incoming = log.locator('[data-message-id="menu-01"]');
	await incoming.scrollIntoViewIfNeeded();
	await incoming.click({ button: "right" });
	const menu = page.getByRole("menu", { name: "消息菜单" });
	await expect(menu).toBeVisible();
	await expect(menu.getByRole("menuitem")).toHaveText(["复制", "@Ta"]);
	await menu.getByRole("menuitem", { name: "@Ta" }).click();
	await expect(page.getByRole("textbox", { name: /^对 / })).toHaveValue(`@${a.displayName} `);
	await page.getByRole("textbox", { name: /^对 / }).fill("");
	const own = log.locator('[data-message-id="menu-03"]');
	await own.scrollIntoViewIfNeeded();
	await own.click({ button: "right" });
	await expect(page.getByRole("menu")).toBeVisible();
	await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["复制"]);
	await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("menu")).toHaveCount(0);
	await expect(own).toBeFocused();
});

test("the menu's copy row puts the message's words on the clipboard", async ({ page }) => {
	// WebKit has no clipboard permission to grant, so the page records what it was asked to write.
	await page.addInitScript(() => {
		const written: string[] = [];
		Object.defineProperty(window, "__copied", { value: written });
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: async (value: string) => void written.push(value) },
		});
	});
	await openGroup(page, { width: 1280 });
	const row = page.locator('[data-message-id="menu-01"]');
	await row.scrollIntoViewIfNeeded();
	await row.click({ button: "right" });
	await page.getByRole("menu").getByRole("menuitem", { name: "复制" }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied))
		.toEqual(["先看这一段。"]);
});

test.describe("touch", () => {
	test.use({
		viewport: { width: 375, height: 812 },
		hasTouch: true,
		isMobile: true,
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
	});
	test("a phone shows both avatars, a tap opens the profile and a long press asks for that member", async ({
		page,
	}, info) => {
		await openGroup(page, {});
		const log = page.getByRole("log");
		await expect(log.locator('[data-message-id="menu-04"] .message-bubble')).toBeVisible();
		// Both sides carry a face on a phone too, one per run.
		for (const sender of [a.memberId, person.id]) {
			await expect(log.locator(`[data-message-run="${sender}"] [data-message-sender-avatar]`)).toHaveCount(1);
		}
		await page.screenshot({ path: info.outputPath("touch-chat.png"), animations: "disabled" });
		const avatar = log.locator(`[data-message-run="${a.memberId}"] [data-message-sender-avatar]`).first();
		await avatar.scrollIntoViewIfNeeded();
		const box = await avatar.boundingBox();
		if (!box) throw new Error("Expected a touch avatar");
		const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		// A tap opens who they are, as in WeChat; nothing is inserted. On a phone the card is a page.
		await page.touchscreen.tap(center.x, center.y);
		const profile = page.getByRole("dialog", { name: "资料" });
		await expect(profile.getByRole("heading", { name: a.displayName })).toBeVisible();
		await profile.getByRole("button", { name: "返回", exact: true }).click();
		await expect(profile).toHaveCount(0);
		await expect(page.getByRole("textbox", { name: /^对 / })).toHaveValue("");
		// A still press held past the hold delay asks for that member, and the click it becomes is eaten.
		const press = page.locator(`[data-message-run="${a.memberId}"] [data-message-sender-avatar] button`).first();
		await press.hover();
		await page.mouse.move(center.x, center.y);
		await press.dispatchEvent("pointerdown", {
			pointerType: "touch",
			pointerId: 1,
			isPrimary: true,
			clientX: center.x,
			clientY: center.y,
		});
		await page.waitForTimeout(700);
		await press.dispatchEvent("pointerup", {
			pointerType: "touch",
			pointerId: 1,
			isPrimary: true,
			clientX: center.x,
			clientY: center.y,
		});
		await expect(page.getByRole("textbox", { name: /^对 / })).toHaveValue(`@${a.displayName} `);
	});
});

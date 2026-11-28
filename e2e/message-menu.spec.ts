import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import type { ConversationMember, Message } from "@yonder/protocol";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({ screenshot: "off", trace: "off" });

const member: ConversationMember = {
	memberId: "group-person-a",
	kind: "person",
	handle: "groupa",
	displayName: "林知夏",
	avatarUrl: null,
};
const members = [...conversation.members, member];
const incomingText = "先看这一段。";
const longText =
	"这是一段足够长的中文，用来确认聊天气泡的正文会排满自己的行，并且多行气泡仍然是一个完整矩形，不会因为头像而变窄或被切断。";
const messageMenu = (page: Page) => page.getByRole("menu", { name: "消息菜单" });
const composer = (page: Page) => page.getByRole("textbox", { name: /^对 / });
const desktopProfile = (page: Page) => page.locator("[data-detail-pane]");

function fromMember(id: string, body: string): Message {
	return { ...message(id, body), senderId: member.memberId, senderKind: member.kind };
}

async function openGroup(page: Page) {
	await page.emulateMedia({ reducedMotion: "reduce" });
	const api = await isolateChat(page, {
		group: true,
		members,
		ownerId: member.memberId,
		items: [
			fromMember("menu-01", incomingText),
			fromMember("menu-02", "这条仍由我发送。"),
			message("menu-03", "我这边看到了。", true),
			message("menu-04", longText.repeat(2), true),
			message("menu-05", "收到，我来整理。"),
		],
	});
	await page.route(`**/v1/members/${member.handle}`, (route) =>
		route.fulfill({
			json: {
				card: { ...member, owner: null },
				memberId: member.memberId,
				relation: "contact",
				conversationId: null,
			},
		}),
	);
	await page.goto(`/messages/${conversation.id}`);
	const runs = page.getByRole("log").locator("[data-message-run]");
	await expect(runs).toHaveCount(3);
	const run = (sender: string) => runs.and(page.locator(`[data-message-run="${sender}"]`));
	const own = page.locator('[data-message-id="menu-03"]');
	const incoming = page.locator('[data-message-id="menu-01"]');
	return { api, runs, run, own, incoming };
}

test("both sides show one avatar per sender run, and a long bubble wraps inside its column", async ({ page }) => {
	const { runs } = await openGroup(page);
	const log = page.getByRole("log");
	for (const run of await runs.all()) await expect(run.locator("[data-message-sender-avatar]")).toBeVisible();
	await expect(log.locator("[data-message-sender-avatar]")).toHaveCount(3);

	const bubble = log.locator('[data-message-id="menu-04"] .message-bubble');
	const geometry = await bubble.evaluate((element) => {
		const column = element.closest(".message-run-messages");
		if (!column) throw new Error("Expected a message column");
		const style = getComputedStyle(element);
		const text = document.createRange();
		text.selectNodeContents(element.querySelector(".message-content") ?? element);
		return {
			columnWidth: column.getBoundingClientRect().width,
			width: element.getBoundingClientRect().width,
			lines: new Set([...text.getClientRects()].map((line) => line.top)).size,
			radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius],
		};
	});
	expect(geometry.lines).toBeGreaterThan(1);
	expect(geometry.width).toBeLessThanOrEqual(geometry.columnWidth + 1);
	expect(new Set(geometry.radii).size).toBe(1);
});

test("the name, avatar and Bot tag open the profile or the owner's Bot settings", async ({ page }) => {
	const { run } = await openGroup(page);
	const other = run(member.memberId);
	const menuTarget = other.locator("[data-message-avatar-button]");
	await expect(menuTarget.locator("[data-message-sender-name]")).toHaveText(member.displayName);
	await expect(menuTarget.locator("[data-message-sender-avatar]")).toBeVisible();
	await other.locator("[data-message-sender-name]").click();
	const card = desktopProfile(page);
	await expect(card.getByRole("tab", { name: member.displayName })).toHaveAttribute("aria-selected", "true");
	await expect(card.getByRole("heading", { name: member.displayName })).toBeVisible();
	await card.getByRole("button", { name: "关闭全部", exact: true }).click();
	await expect(card.getByRole("tab", { name: member.displayName })).toHaveCount(0);
	await expect(composer(page)).toHaveValue("");

	const botRun = run(bot.id);
	await expect(botRun.locator("[data-message-avatar-button] [data-bot-label]")).toBeVisible();
	await botRun.locator("[data-bot-label]").click();
	const settings = desktopProfile(page);
	await expect(settings.getByRole("tab", { name: bot.displayName })).toHaveAttribute("aria-selected", "true");
	await expect(settings.getByRole("button", { name: /^基本资料/ })).toBeVisible();
	await settings.getByRole("button", { name: "关闭全部", exact: true }).click();
	await botRun.locator("[data-message-sender-avatar]").click({ button: "right" });
	await messageMenu(page).getByRole("menuitem", { name: "查看资料" }).click();
	await expect(settings.getByRole("button", { name: /^基本资料/ })).toBeVisible();
});

test("right-clicking another group member's avatar offers profile and a bound @ mention", async ({ page }) => {
	const { api, run } = await openGroup(page);
	const avatar = run(member.memberId).locator("[data-message-sender-avatar]");
	const menu = messageMenu(page);
	await avatar.click({ button: "right" });
	await expect(menu.getByRole("menuitem")).toHaveText(["查看资料", "@Ta"]);
	await menu.getByRole("menuitem", { name: "查看资料" }).click();
	const card = desktopProfile(page);
	await expect(card.getByRole("tab", { name: member.displayName })).toHaveAttribute("aria-selected", "true");
	await expect(card.getByRole("heading", { name: member.displayName })).toBeVisible();
	await card.getByRole("button", { name: "关闭全部", exact: true }).click();

	await avatar.click({ button: "right" });
	await menu.getByRole("menuitem", { name: "@Ta" }).click();
	const input = composer(page);
	await expect(input).toHaveValue(`@${member.displayName} `);
	await expect(input).toBeFocused();
	expect(api.sent).toHaveLength(0);
	await input.press("Enter");
	await expect
		.poll(() => api.sent.at(-1))
		.toMatchObject({
			body: `@${member.displayName}`,
			mentionedMemberIds: [member.memberId],
		});
});

test("the message menu offers @Ta only on someone else's message and never on your own", async ({ page }) => {
	const { incoming, own } = await openGroup(page);
	const menu = messageMenu(page);
	await incoming.locator(".message-bubble").click({ button: "right" });
	await expect(menu.getByRole("menuitem")).toHaveText(["复制", "引用", "转发", "@Ta", "仅为我删除"]);
	await menu.getByRole("menuitem", { name: "@Ta" }).click();
	await expect(composer(page)).toHaveValue(`@${member.displayName} `);

	await own.click({ button: "right" });
	await expect(menu.getByRole("menuitem", { name: "复制" })).toHaveCount(1);
	await expect(menu.getByRole("menuitem", { name: "@Ta" })).toHaveCount(0);
});

test("copy writes the selected message text to the clipboard", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText: async (value: string) => document.body.setAttribute("data-copied-text", value) },
		});
	});
	const { incoming } = await openGroup(page);
	await incoming.locator(".message-bubble").click({ button: "right" });
	await messageMenu(page).getByRole("menuitem", { name: "复制" }).click();
	await expect(page.locator("body")).toHaveAttribute("data-copied-text", incomingText);
});

test("system lines, question cards and failure notices have no message menu", async ({ page }) => {
	await isolateChat(page, {
		items: [
			{
				...message("menu-11", null),
				type: "system",
				system: { event: "joined", actorName: null, targetNames: [member.displayName] },
			},
			{
				...message("menu-12", "计划怎么写？"),
				questionCard: {
					state: "open",
					version: 1,
					questions: [{ id: "plan", kind: "text", question: "计划怎么写？" }],
				},
			},
			{
				...message("menu-13", null),
				run: {
					id: "failed-run",
					conversationId: conversation.id,
					messageId: "menu-13",
					userMessageId: "menu-10",
					status: "failed",
				},
			},
		],
	});
	await page.goto("/messages/main");
	for (const id of ["menu-11", "menu-12", "menu-13"]) {
		await page.locator(`[data-message-id="${id}"]`).click({ button: "right" });
		await expect(messageMenu(page)).toBeHidden();
	}
});

test("Shift+F10 and the Menu key open focused menus and Escape restores the trigger", async ({ page }) => {
	const { incoming, run } = await openGroup(page);
	const menu = messageMenu(page);
	const rows = menu.getByRole("menuitem");
	await incoming.press("Shift+F10");
	await expect(rows.first()).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(rows.nth(1)).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(incoming).toBeFocused();

	const avatar = run(member.memberId).locator("[data-message-avatar-button]");
	await avatar.press("ContextMenu");
	await expect(menu.getByRole("menuitem", { name: "查看资料" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await expect(avatar).toBeFocused();
});

async function beginTouch(page: Page, target: Locator) {
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	if (!box) throw new Error("Expected a visible touch target");
	const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const session = await page.context().newCDPSession(page);
	await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
	return { session, point };
}

async function expectInsideViewport(menu: Locator, page: Page) {
	await expect(menu).toBeVisible();
	const box = await menu.boundingBox();
	const viewport = page.viewportSize();
	if (!box || !viewport) throw new Error("Expected a menu and viewport");
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test.describe("touch", () => {
	const { viewport, userAgent } = devices["iPhone 15"];
	test.use({ viewport, userAgent, hasTouch: true, isMobile: true });

	test.beforeEach(async ({ page }) => {
		// Real CDP touch enters through pointer events. Suppress browser contextmenu early so it cannot open the app menu.
		await page.addInitScript(() => {
			document.addEventListener(
				"contextmenu",
				(event) => {
					event.preventDefault();
					event.stopPropagation();
				},
				{ capture: true },
			);
		});
	});

	test("an avatar tap opens its profile and a long press opens its menu without activating the profile", async ({
		page,
	}) => {
		const { run } = await openGroup(page);
		const sender = run(member.memberId);
		const avatar = sender.locator("[data-message-sender-avatar]");
		const card = page.getByRole("dialog", { name: member.displayName, exact: true });
		await avatar.tap();
		await expect(card.getByRole("heading", { name: member.displayName })).toBeVisible();
		await card.getByRole("button", { name: "返回", exact: true }).click();
		await expect(card).toBeHidden();

		await sender.evaluate((element) => {
			document.addEventListener(
				"click",
				(event) => {
					if (event.isTrusted && event instanceof PointerEvent && event.pointerType === "touch")
						setTimeout(() => element.setAttribute("data-test-touch-click", String(event.defaultPrevented)), 0);
				},
				{ capture: true, once: true },
			);
		});
		const { session } = await beginTouch(page, avatar);
		const menu = messageMenu(page);
		try {
			await expect(menu.getByRole("menuitem")).toHaveText(["查看资料", "@Ta"]);
			await expectInsideViewport(menu, page);
		} finally {
			await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
		await expect(sender).toHaveAttribute("data-test-touch-click", "true");
		await expect(menu).toBeVisible();
		await expect(card).toBeHidden();
		await menu.getByRole("menuitem", { name: "@Ta" }).tap();
		await expect(composer(page)).toHaveValue(`@${member.displayName} `);
	});

	test("holding a message bubble opens the same menu before the finger lifts", async ({ page }) => {
		const { incoming } = await openGroup(page);
		const { session } = await beginTouch(page, incoming.locator(".message-bubble"));
		const menu = messageMenu(page);
		try {
			await expect(menu.getByRole("menuitem")).toHaveText(["复制", "引用", "转发", "@Ta", "仅为我删除"]);
			await expectInsideViewport(menu, page);
		} finally {
			await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
		await expect(menu).toBeVisible();
	});

	test("moving more than 8px cancels a pending message long press", async ({ page }) => {
		const { incoming } = await openGroup(page);
		const { session, point } = await beginTouch(page, incoming.locator(".message-bubble"));
		try {
			await session.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: point.x, y: point.y + 12 }],
			});
			// Verify absence after the 450ms threshold while the finger is still down.
			await page.waitForTimeout(500);
			await expect(messageMenu(page)).toBeHidden();
		} finally {
			await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
	});
});

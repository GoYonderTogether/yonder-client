import { expect, type Page, test } from "@playwright/test";
import type { Message } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

/**
 * The reading rules a chat list follows, checked against the built product route in a real browser:
 * the reader's own message always reaches the end, someone else's only when the reader is already
 * close to it, and leaving the end never moves their place.
 */
const path = `/messages/${conversation.id}`;
const paragraph = "一段足够长的消息，用来把这一屏撑满。\n\n";
const history: Message[] = Array.from({ length: 60 }, (_, index) => {
	const number = String(index).padStart(2, "0");
	return message(`message-${number}`, `${paragraph}第 ${number} 条。`, index % 2 === 0);
});

/** The account has to be loaded before the composer will send; a real reader always has it. */
async function openChat(page: Page, { english = false } = {}) {
	const account = page.waitForResponse((response) => new URL(response.url()).pathname === "/v1/me" && response.ok());
	await page.goto(path);
	await account;
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.getByRole("textbox", { name: english ? /^Message 界面验收/ : /^对 界面验收/ })).toBeVisible();
}
function scroller(page: Page) {
	return page.getByRole("log").locator("xpath=../..");
}
function gap(page: Page) {
	return scroller(page).evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
}
function scrollTop(page: Page) {
	return scroller(page).evaluate((element) => element.scrollTop);
}
async function expectAtEnd(page: Page) {
	await expect.poll(() => gap(page)).toBeLessThanOrEqual(2);
}
/** Leaves the end the way a reader does: a wheel gesture, then the position it produces. */
async function leaveTheEnd(page: Page, distance = 300) {
	await scroller(page).evaluate((element, amount) => {
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -amount, bubbles: true }));
		element.scrollTop = element.scrollTop - amount;
	}, distance);
	// A real wheel produces its scroll event at once; dispatch it so the hook sees the same order.
	await scroller(page).dispatchEvent("scroll");
	await expect.poll(() => gap(page)).toBeGreaterThan(48);
}
const jump = (page: Page) => page.locator("[data-chat-jump-latest]");

/**
 * The shared fixture derives a saved message's `createdAt` from its id, which puts a send back in the
 * middle of this 60-message history. A real server stamps it now, so this spec does the same.
 */
async function stampSends(page: Page) {
	const sent: { body: string }[] = [];
	await page.route(new RegExp(`/v1/conversations/${conversation.id}/messages(\\?.*)?$`), async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		const payload = route.request().postDataJSON() as { body?: string; clientNonce?: string; type?: string };
		const saved = {
			...message("message-sent-now", payload.body ?? "", true),
			type: payload.type ?? "text",
			createdAt: new Date().toISOString(),
			clientNonce: payload.clientNonce ?? "",
		};
		sent.push({ body: payload.body ?? "" });
		await route.fulfill({ json: { message: saved, clientNonce: payload.clientNonce } });
	});
	return sent;
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1000, height: 640 }));

test("sending from the top of the history lands on the new bubble in the same commit", async ({ page }) => {
	const api = await isolateChat(page, { items: history });
	const sent = await stampSends(page);
	await openChat(page);
	await expectAtEnd(page);
	await scroller(page).evaluate((element) => {
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -6000, bubbles: true }));
		element.scrollTop = 0;
	});
	await expect.poll(() => scrollTop(page)).toBe(0);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.fill("翻上去以后我自己发的这一条");
	// Read the gap as soon as the outgoing bubble exists, before any later scroll event or frame.
	await page.evaluate(() => {
		const log = document.querySelector('[role="log"]');
		const frame = log?.parentElement?.parentElement;
		const record = () => {
			if (!log?.querySelector(".message-bubble-outgoing")) return;
			if (!frame) return;
			(window as unknown as { scrollGap?: number }).scrollGap =
				frame.scrollHeight - frame.clientHeight - frame.scrollTop;
			observer.disconnect();
		};
		const observer = new MutationObserver(record);
		if (log) observer.observe(log, { childList: true, subtree: true });
	});
	// The send button, not Enter: fb-composer owns how each engine and phone treats Enter.
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect.poll(() => sent.length).toBe(1);
	await expect(page.locator(".message-bubble-outgoing", { hasText: "翻上去以后我自己发的这一条" })).toBeInViewport();
	const sameCommit = await page.evaluate(() => (window as unknown as { scrollGap?: number }).scrollGap);
	expect(sameCommit).toBeDefined();
	expect(sameCommit ?? 99).toBeLessThanOrEqual(2);
	// Following continued, so the next arrival is still pinned to the end.
	api.create(message("message-90", "我发完以后对方来的"));
	await expect(page.getByRole("log").getByText("我发完以后对方来的")).toBeAttached();
	await expectAtEnd(page);
});

test("someone else's message follows at the end and never moves a reader above it", async ({ page }) => {
	const api = await isolateChat(page, { items: history });
	await openChat(page);
	await expectAtEnd(page);
	api.create(message("message-70", "贴底时收到的第一条"));
	await expect(page.getByRole("log").getByText("贴底时收到的第一条")).toBeAttached();
	await expectAtEnd(page);

	await leaveTheEnd(page);
	const held = await scrollTop(page);
	api.create(message("message-71", "离开底部后收到的第一条"));
	await expect(page.getByRole("log").getByText("离开底部后收到的第一条")).toBeAttached();
	expect(await scrollTop(page)).toBeCloseTo(held, 0);
	await expect(jump(page)).toBeVisible();
	await expect(jump(page)).toContainText("1 条新消息");
	api.create(message("message-72", "离开底部后收到的第二条"));
	await expect(page.getByRole("log").getByText("离开底部后收到的第二条")).toBeAttached();
	await expect(jump(page)).toContainText("2 条新消息");
	expect(await scrollTop(page)).toBeCloseTo(held, 0);
	await jump(page).click();
	await expectAtEnd(page);
	await expect(jump(page)).toHaveCount(0);
});

test("a streaming reply is followed at the end, stops when the reader scrolls up, and resumes at the end", async ({
	page,
}) => {
	const api = await isolateChat(page, { items: history });
	await openChat(page);
	await expectAtEnd(page);
	const streamed = (body: string, version: number): Message => ({
		...message("message-80", body),
		streaming: true,
		version,
	});
	api.create(streamed(`${paragraph}${paragraph}流式回答第一段`, 1));
	await expect(page.getByRole("log").getByText("流式回答第一段")).toBeAttached();
	await expectAtEnd(page);
	api.update(streamed(`${paragraph.repeat(4)}流式回答第一段第二块`, 2));
	await expect(page.getByRole("log").getByText("第二块")).toBeAttached();
	await expectAtEnd(page);

	await leaveTheEnd(page);
	const held = await scrollTop(page);
	api.update(streamed(`${paragraph.repeat(6)}流式回答第一段第二块第三块`, 3));
	await expect(page.getByRole("log").getByText("第三块")).toBeAttached();
	expect(await scrollTop(page)).toBeCloseTo(held, 0);

	await jump(page).click();
	await expectAtEnd(page);
	api.update(streamed(`${paragraph.repeat(8)}流式回答第一段第二块第三块第四块`, 4));
	await expect(page.getByRole("log").getByText("第四块")).toBeAttached();
	await expectAtEnd(page);
});

test("a message arriving while the reader is 40px above the end is still followed", async ({ page }) => {
	const api = await isolateChat(page, { items: history });
	await openChat(page);
	await expectAtEnd(page);
	// 40px from the end is inside the stick band, which is how a late image or a rounded layout leaves it.
	await scroller(page).evaluate((element) => {
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true }));
		element.scrollTop = element.scrollTop - 40;
	});
	expect(await gap(page)).toBeCloseTo(40, -1);
	// The hook starts following again on the scroll event that follows the gesture; make sure it has
	// arrived before the next message, as it would in a real wheel scroll.
	await scroller(page).dispatchEvent("scroll");
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
	api.create(message("message-61", "图片加载完之后来的消息"));
	await expect(page.getByRole("log").getByText("图片加载完之后来的消息")).toBeAttached();
	await expectAtEnd(page);
});

test("a taller composer keeps the end at the end for a reader who was already there", async ({ page }) => {
	await isolateChat(page, { items: history });
	await openChat(page);
	await expectAtEnd(page);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.fill("第一行\n第二行\n第三行");
	await expect.poll(() => gap(page)).toBeLessThanOrEqual(2);
	await leaveTheEnd(page);
	const held = await scrollTop(page);
	await input.fill("第一行\n第二行\n第三行\n第四行\n第五行");
	await page.waitForTimeout(150);
	expect(await scrollTop(page)).toBeCloseTo(held, 0);
	await jump(page).click();
	await expectAtEnd(page);
});

test("switching to another conversation opens at its end", async ({ page }) => {
	await isolateChat(page, { items: history });
	await openChat(page);
	await expectAtEnd(page);
	await page.goto(path);
	await expect(page.getByRole("log")).toBeVisible();
	await expectAtEnd(page);
});

test("English readers see the same count in their own words", async ({ page }) => {
	const api = await isolateChat(page, { items: history, locale: "en" });
	await openChat(page, { english: true });
	await expectAtEnd(page);
	await leaveTheEnd(page);
	api.create(message("message-75", "a message while away"));
	await expect(page.getByRole("log").getByText("a message while away")).toBeAttached();
	await expect(jump(page)).toContainText("1 new message");
	api.create(message("message-76", "another message while away"));
	await expect(jump(page)).toContainText("2 new messages");
});

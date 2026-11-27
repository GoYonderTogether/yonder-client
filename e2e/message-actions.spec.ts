import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import type { Conversation, Message, SendMessageRequest, SendMessageResponse } from "@yonder/protocol";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

const quoteSource = message("actions-01", "请把这条 Bot 消息引用进回复。");
const recallSource = message("actions-02", "这条消息需要撤回。", true);
const deleteSource = message("actions-03", "这条消息只从我的视图删除。");
const forwardSource = message("actions-04", "这条消息将转发给两个会话。", true);
const feedbackSource = message("actions-05", "这条 Bot 回复可以点赞。");
const replyText = "这是带引用的回复。";
const replyId = "actions-06";
const forwarded = [
	{ ...conversation, id: "forward-first", kind: "group", isPrimary: false, title: "设计评审群" },
	{ ...conversation, id: "forward-second", kind: "group", isPrimary: false, title: "下次会议群" },
] satisfies Conversation[];

const entry = (page: Page, id: string) => page.getByRole("log").locator(`[data-message-id="${id}"]`);
const decorated = (page: Page, id: string) => page.getByRole("log").locator(`[data-message-decorated="${id}"]`);
const messageMenu = (page: Page) => page.getByRole("menu", { name: "消息菜单" });

async function mockActions(page: Page) {
	const items = [
		quoteSource,
		{ ...recallSource, createdAt: new Date().toISOString() },
		deleteSource,
		forwardSource,
		feedbackSource,
	];
	const sent: SendMessageRequest[] = [];
	const recalls: string[] = [];
	const deletes: string[] = [];
	const feedback: Array<"up" | "down" | null> = [];
	const forwards: { conversationId: string; clientNonce: string }[] = [];
	const replace = (updated: Message) => {
		const index = items.findIndex(({ id }) => id === updated.id);
		items[index] = updated;
		return updated;
	};

	await isolateChat(page, { group: true, ownerId: "another-member", items });
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({
			json: {
				items: [
					{
						...conversation,
						kind: "group",
						isPrimary: false,
						title: "聊天互动测试群",
						ownerId: "another-member",
					},
					...forwarded,
				],
			},
		}),
	);
	await page.route(`**/v1/conversations/${conversation.id}/messages`, (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		const payload = route.request().postDataJSON() as SendMessageRequest;
		sent.push(payload);
		const original = items.find(({ id }) => id === payload.replyToId);
		const saved: Message = {
			...message(replyId, payload.body, true),
			createdAt: new Date().toISOString(),
			clientNonce: payload.clientNonce,
			replyToId: payload.replyToId ?? null,
			...(original ? { replyTo: { id: original.id, senderId: original.senderId, snippet: original.body ?? "" } } : {}),
		};
		items.push(saved);
		return route.fulfill({ json: { message: saved, clientNonce: payload.clientNonce } satisfies SendMessageResponse });
	});
	await page.route(`**/v1/messages/${recallSource.id}/recall`, (route) => {
		expect(route.request().method()).toBe("POST");
		recalls.push(recallSource.id);
		const at = new Date().toISOString();
		const json = replace({
			...recallSource,
			createdAt: items.find(({ id }) => id === recallSource.id)?.createdAt ?? at,
			body: null,
			attachments: [],
			recalled: { at, by: "sender" },
			version: 2,
		});
		return route.fulfill({ json });
	});
	await page.route(`**/v1/messages/${deleteSource.id}`, (route) => {
		expect(route.request().method()).toBe("DELETE");
		deletes.push(deleteSource.id);
		items.splice(
			items.findIndex(({ id }) => id === deleteSource.id),
			1,
		);
		return route.fulfill({ json: { ok: true } });
	});
	await page.route(`**/v1/messages/${feedbackSource.id}/feedback`, (route) => {
		expect(route.request().method()).toBe("PUT");
		const { value } = route.request().postDataJSON() as { value: "up" | "down" | null };
		feedback.push(value);
		const json = replace({
			...feedbackSource,
			...(value ? { feedback: value } : {}),
			version: feedbackSource.version + feedback.length,
		});
		return route.fulfill({ json });
	});
	await page.route(`**/v1/messages/${forwardSource.id}/forward`, (route) => {
		expect(route.request().method()).toBe("POST");
		const payload = route.request().postDataJSON() as (typeof forwards)[number];
		const retry = forwards.some(({ conversationId }) => conversationId === payload.conversationId);
		forwards.push(payload);
		if (payload.conversationId === forwarded[1]?.id && !retry)
			return route.fulfill({ status: 403, json: { error: { code: "not_allowed" } } });
		const json: SendMessageResponse = {
			message: {
				...message("forwarded-07", forwardSource.body, true),
				conversationId: payload.conversationId,
				clientNonce: payload.clientNonce,
			},
			clientNonce: payload.clientNonce,
		};
		return route.fulfill({ json });
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`/messages/${conversation.id}`);
	return { sent, recalls, deletes, feedback, forwards };
}

async function longPress(page: Page, target: Locator) {
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	if (!box) throw new Error("Expected a visible message bubble");
	const session = await page.context().newCDPSession(page);
	try {
		await session.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
		});
		// The menu must appear from the pointer timer while the finger is still down.
		await expect(messageMenu(page)).toBeVisible();
	} finally {
		await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await session.detach();
	}
}

test.use({ screenshot: "off", trace: "off" });

for (const touch of [false, true]) {
	test.describe(touch ? "phone long press" : "desktop right click", () => {
		const { viewport, userAgent } = devices["iPhone 15"];
		if (touch) test.use({ viewport, userAgent, hasTouch: true, isMobile: true });

		test("quotes, forwards, recalls, deletes and rates chat messages", async ({ page }) => {
			test.setTimeout(30_000);
			if (touch) {
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
			}
			const api = await mockActions(page);
			const activate = (target: Locator) => (touch ? target.tap() : target.click());
			const choose = async (message: Message, name: string | RegExp) => {
				const target = entry(page, message.id).locator(".message-bubble");
				if (touch) await longPress(page, target);
				else await target.click({ button: "right" });
				await activate(messageMenu(page).getByRole("menuitem", { name, exact: true }));
			};

			await test.step("send a Bot quote, then jump to the original message", async () => {
				const draft = page.locator("[data-message-quote-draft]");
				await choose(quoteSource, "引用");
				await expect(draft).toContainText(bot.displayName);
				await expect(draft).toContainText(quoteSource.body ?? "");
				await activate(draft.getByRole("button", { name: "取消引用" }));
				await expect(draft).toBeHidden();
				await choose(quoteSource, "引用");
				await page.getByRole("textbox", { name: /^对 / }).fill(replyText);
				await activate(page.getByRole("button", { name: "发送", exact: true }));
				await expect.poll(() => api.sent).toHaveLength(1);
				expect(api.sent[0]).toMatchObject({ body: replyText, replyToId: quoteSource.id });
				expect(api.sent[0]?.mentionedMemberIds ?? []).toEqual([]);
				await expect(draft).toBeHidden();
				const reply = entry(page, replyId);
				await expect(reply).toContainText(replyText);
				const quote = decorated(page, replyId).locator("[data-message-quote]");
				await expect(quote).toContainText(bot.displayName);
				await expect(quote).toContainText(quoteSource.body ?? "");
				await activate(quote);
				await expect(entry(page, quoteSource.id)).toHaveAttribute("data-message-highlighted");
			});

			await test.step("forward to two conversations and retry only the failed target", async () => {
				await choose(forwardSource, "转发");
				const dialog = page.getByRole("dialog", { name: "转发消息" });
				for (const target of forwarded)
					await activate(dialog.getByRole("checkbox", { name: target.title, exact: true }));
				await activate(dialog.getByRole("button", { name: "转发", exact: true }));
				await expect(page.getByText("转发成功 1 条，失败 1 条。", { exact: true })).toBeVisible();
				expect(api.forwards.map(({ conversationId }) => conversationId).sort()).toEqual(
					forwarded.map(({ id }) => id).sort(),
				);
				expect(new Set(api.forwards.map(({ clientNonce }) => clientNonce)).size).toBe(2);
				expect(api.forwards.every(({ clientNonce }) => Boolean(clientNonce))).toBe(true);
				const failed = api.forwards.find(({ conversationId }) => conversationId === forwarded[1]?.id);
				await activate(dialog.getByRole("button", { name: "重试", exact: true }));
				await expect(dialog).toBeHidden();
				expect(api.forwards).toHaveLength(3);
				expect(api.forwards.at(-1)).toEqual(failed);
			});

			await test.step("recall a recent own message in a group", async () => {
				await choose(recallSource, "撤回");
				const line = entry(page, recallSource.id);
				await expect(line).toHaveText("你撤回了一条消息");
				await expect(line.locator(".message-bubble")).toHaveCount(0);
				await expect(line.locator("[data-message-sender-avatar]")).toHaveCount(0);
				expect(api.recalls).toEqual([recallSource.id]);
			});

			await test.step("cancel deletion, then confirm the local removal", async () => {
				await choose(deleteSource, "仅为我删除");
				const dialog = page.getByRole("dialog", { name: "删除消息？" });
				await expect(dialog).toContainText("只删除你这边的记录");
				await activate(dialog.getByRole("button", { name: "取消", exact: true }));
				await expect(dialog).toBeHidden();
				await expect(entry(page, deleteSource.id)).toBeVisible();
				expect(api.deletes).toEqual([]);

				await choose(deleteSource, "仅为我删除");
				await activate(dialog.getByRole("button", { name: "删除", exact: true }));
				await expect(entry(page, deleteSource.id)).toHaveCount(0);
				expect(api.deletes).toEqual([deleteSource.id]);
			});

			await test.step("like a Bot message, switch to dislike and clear feedback", async () => {
				const row = decorated(page, feedbackSource.id);
				const liked = row.getByRole("img", { name: "已点赞" });
				const disliked = row.getByRole("img", { name: "已点踩" });
				const vote = (label: string) =>
					Promise.all([
						page.waitForResponse((response) => response.url().endsWith(`/v1/messages/${feedbackSource.id}/feedback`)),
						choose(feedbackSource, label),
					]);
				await vote("点赞");
				await expect(liked).toBeVisible();
				await vote("点踩");
				await expect(liked).toBeHidden();
				await expect(disliked).toBeVisible();
				await vote("取消点踩");
				await expect(disliked).toBeHidden();
				await expect.poll(() => api.feedback).toEqual(["up", "down", null]);
			});
		});
	});
}

test("finds an older quote and shows the server's recall-window rejection", async ({ page }) => {
	test.setTimeout(20_000);
	const earlier = message("history-07", "这条 Bot 消息位于上一页。");
	const reference = {
		...message("history-40", "引用历史里的消息。", true),
		replyToId: earlier.id,
		replyTo: { id: earlier.id, senderId: earlier.senderId, snippet: earlier.body ?? "" },
	};
	const latest = Array.from({ length: 18 }, (_, index) =>
		message(`history-${index + 10}`, `历史消息 ${index + 1}`, index % 2 === 0),
	);
	latest.push(reference, { ...recallSource, createdAt: new Date().toISOString() });

	await isolateChat(page, { group: true, ownerId: "another-member", items: latest });
	let earlierRequests = 0;
	await page.route(`**/v1/conversations/${conversation.id}/messages*`, (route) => {
		if (route.request().method() !== "GET") return route.fallback();
		const cursor = new URL(route.request().url()).searchParams.get("cursor");
		if (!cursor) return route.fulfill({ json: { items: latest, nextCursor: "previous-actions", hasMore: true } });
		expect(cursor).toBe("previous-actions");
		earlierRequests++;
		return route.fulfill({ json: { items: [earlier], nextCursor: null, hasMore: false } });
	});
	await page.route(`**/v1/messages/${recallSource.id}/recall`, (route) => {
		expect(route.request().method()).toBe("POST");
		return route.fulfill({ status: 409, json: { error: { code: "recall_window_closed" } } });
	});

	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`/messages/${conversation.id}`);
	const quote = decorated(page, reference.id).locator("[data-message-quote]");
	const original = entry(page, earlier.id);
	await expect(quote).toContainText(earlier.body ?? "");
	await expect(original).toHaveCount(0);
	await quote.click();
	await expect(original).toHaveAttribute("data-message-highlighted");
	await expect(original).toBeInViewport();
	expect(earlierRequests).toBe(1);

	const recent = entry(page, recallSource.id).locator(".message-bubble");
	await recent.click({ button: "right" });
	await messageMenu(page).getByRole("menuitem", { name: "撤回", exact: true }).click();
	await expect(page.getByRole("status").getByText("撤回时间已过。", { exact: true })).toBeVisible();
	await expect(recent).toHaveText(recallSource.body ?? "");
});

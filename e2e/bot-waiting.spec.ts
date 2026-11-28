import { devices, expect, type Page, test } from "@playwright/test";
import type { ItemDetail, Message, Run } from "@yonder/protocol";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const question = "帮我整理这周的发布清单";
const primaryPath = `/messages/${conversation.id}`;
const dotsSelector = "[data-bot-waiting]";
const composer = (page: Page) => page.getByRole("textbox", { name: /^对 界面验收/ });

function waitingReply(input: Message, n: number, status: Run["status"] = "running"): Message & { run: Run } {
	const reply = message(`reply-${n}`, "", false, true);
	return {
		...reply,
		conversationId: input.conversationId,
		run: { id: `run-${n}`, userMessageId: input.id, messageId: reply.id, conversationId: input.conversationId, status },
	};
}

for (const [layout, viewport] of Object.entries({
	desktop: { width: 1180, height: 760 },
	phone: devices["iPhone 13"].viewport,
})) {
	test(`an owned secondary Bot shows the same waiting bubble on ${layout}`, async ({ page }, testInfo) => {
		await page.setViewportSize(viewport);
		const secondaryBot = { ...bot, id: "secondary-bot", displayName: "子 BOT", isDefault: false };
		const secondary = {
			...conversation,
			id: "secondary-chat",
			isPrimary: false,
			members: [
				{ memberId: person.id, ...person },
				{ memberId: secondaryBot.id, ...secondaryBot },
			],
		};
		const input = { ...message("ask-11", question, true), conversationId: secondary.id };
		const api = await isolateChat(page, { items: [input] });
		await page.route("**/v1/conversations", (route) => route.fulfill({ json: { items: [conversation, secondary] } }));
		await page.route("**/v1/contacts", (route) => route.fulfill({ json: { items: [secondaryBot] } }));
		await page.goto(`/messages/${secondary.id}`);
		await expect(page.getByRole("log").getByText(question, { exact: true })).toBeVisible();
		await expect.poll(api.connected).toBe(true);
		const waiting = page.locator(dotsSelector);
		await expect(waiting).toHaveCount(0);
		const reply = { ...waitingReply(input, 12), senderId: secondaryBot.id };
		api.create(reply);
		await expect(waiting).toBeInViewport();
		await expect(waiting.locator("i")).toHaveCount(3);
		await page.screenshot({ path: testInfo.outputPath(`${layout}-secondary-bot-waiting.png`) });
		const body = "第一项：确认本周的上线范围。";
		api.update({ ...reply, body, version: 2 });
		await expect(page.getByRole("log").getByText(body, { exact: true })).toBeVisible();
		await expect(waiting).toHaveCount(0);
	});
}

test("primary Bot shows three dots only for an accepted reply run, follows reconnect, and swaps for real text", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	const history = [message("previous-08", "昨天的发布记录已整理。")];
	const api = await isolateChat(page, { items: history });
	const accepted = Promise.withResolvers<void>();
	await page.route(`**/v1/conversations/${conversation.id}/messages`, async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		await accepted.promise;
		return route.fallback();
	});
	await page.goto(primaryPath);
	await expect(composer(page)).toBeVisible();
	await expect.poll(api.connected).toBe(true);
	await composer(page).fill(question);
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page.getByRole("log").getByText(question, { exact: true })).toBeVisible();
	await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
	const waiting = page.locator(dotsSelector);
	await expect(waiting).toHaveCount(0);
	accepted.resolve();
	await expect(page.locator('[data-message-id="sent-11"]')).toBeVisible();
	const input = history.at(1);
	if (!input) throw new Error("Expected the accepted user message");
	const reply = waitingReply(input, 12, "queued");
	history.push(reply);
	api.create(reply);
	await expect(waiting).toHaveCount(1);
	const running = { ...reply, run: { ...reply.run, status: "running" as const } };
	history[2] = running;
	api.updateRun(running.run);
	await expect(waiting.locator(".message-bubble-incoming")).toBeVisible();
	await expect(waiting.getByRole("status")).toHaveText("正在输入");
	await expect(waiting.locator("i")).toHaveCount(3);
	const dotSize = await waiting
		.locator("i")
		.first()
		.evaluate((dot) => {
			const style = getComputedStyle(dot);
			return {
				width: parseFloat(style.width),
				height: parseFloat(style.height),
				scale: parseFloat(style.getPropertyValue("--ui-scale")),
			};
		});
	expect(dotSize.width).toBeCloseTo(4 * dotSize.scale + 2, 1);
	expect(dotSize.height).toBeCloseTo(dotSize.width, 1);
	await expect(waiting.locator("i").first()).toHaveCSS("animation-name", "bot-waiting-pulse");
	await expect(waiting.locator("button, time, [data-message-id]")).toHaveCount(0);
	await expect(page.locator('[data-message-id="reply-12"]')).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath("primary-bot-waiting.png") });

	await api.disconnect();
	await expect(waiting).toHaveCount(1);
	await expect.poll(api.connected).toBe(true);
	await expect(waiting).toHaveCount(1);
	api.update({ ...running, body: "第一项：确认本周的上线范围。", version: 2 });
	await expect(page.getByRole("log").getByText("第一项：确认本周的上线范围。", { exact: true })).toBeVisible();
	await expect(waiting).toHaveCount(0);
});

test("task rows show independent timers and follow a recording item's private reply", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	const now = Date.now();
	const recording: ItemDetail = {
		id: "recording-item",
		title: "录音功能测试",
		source: "meeting",
		state: "completed",
		botMemberId: bot.id,
		conversationId: conversation.id,
		startedAt: new Date(now - 5 * 60_000).toISOString(),
		endedAt: new Date(now - 4 * 60_000).toISOString(),
		result: null,
		failureReason: null,
		instruction: null,
		steps: [],
		cancellable: false,
		pausable: false,
	};
	const running: ItemDetail = {
		...recording,
		id: "running-item",
		title: "定时执行每日邮件汇总和会议简报",
		source: "conversation",
		state: "running",
		conversationId: "running-item",
		startedAt: new Date(now - 75_000).toISOString(),
		endedAt: null,
	};
	const session = { ...conversation, id: "recording-session", isPrimary: false };
	const history: Message[] = [];
	const api = await isolateChat(page);
	await page.route("**/v1/items", (route) =>
		route.fulfill({ json: { items: [running, recording], nextCursor: null } }),
	);
	for (const [item, chat] of [
		[recording, session],
		[running, { ...session, id: running.id }],
	] as const) {
		await page.route(`**/v1/items/${item.id}`, (route) => route.fulfill({ json: item }));
		await page.route(`**/v1/items/${item.id}/session`, (route) => route.fulfill({ json: { conversation: chat } }));
		await page.route(`**/v1/conversations/${chat.id}/messages?**`, (route) =>
			route.fulfill({ json: { items: chat.id === session.id ? history : [], nextCursor: null, hasMore: false } }),
		);
	}
	await page.goto(`/tasks/${recording.id}`);
	await expect(page.getByRole("log")).toBeVisible();
	await expect.poll(api.connected).toBe(true);
	const recordingRow = page.getByRole("button", { name: /^录音功能测试/ });
	const runningRow = page.getByRole("button", { name: /^定时执行/ });
	const recordingTimer = recordingRow.getByText(/^已运行 0m\d{2}s$/);
	const otherTimer = runningRow.getByText(/^已运行 1m\d{2}s$/);
	await expect(recordingTimer).toHaveCount(0);
	await expect(otherTimer).toBeVisible();
	const input = {
		...message("ask-11", "为什么不入记忆呢", true),
		conversationId: session.id,
		createdAt: new Date().toISOString(),
	};
	history.push(input);
	api.create(input);
	await expect(page.getByRole("log").getByText(input.body ?? "", { exact: true })).toBeVisible();
	const reply = { ...waitingReply(input, 12), createdAt: input.createdAt };
	history.push(reply);
	api.create(reply);
	await expect(page.locator(dotsSelector)).toBeVisible();
	await expect(recordingTimer).toBeVisible();
	await expect(recordingRow.locator("svg.lucide-loader-circle")).toHaveCSS("animation-name", "spin");
	const firstTime = await recordingTimer.textContent();
	await expect(recordingTimer).not.toHaveText(firstTime ?? "");
	await page.screenshot({ path: testInfo.outputPath("task-list-running.png"), scale: "css" });

	await runningRow.click();
	await expect(page).toHaveURL(/\/tasks\/running-item$/);
	await expect(recordingTimer).toBeVisible();
	const finished = { ...reply.run, status: "completed" as const };
	history[1] = { ...reply, run: finished };
	api.updateRun(finished);
	await expect(recordingTimer).toHaveCount(0);
	await expect(otherTimer).toBeVisible();
});

test.describe("phone", () => {
	const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = devices["iPhone 13"];
	test.use({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor });
	test("private item chat restores one waiting bubble from history, including in reduced motion", async ({
		page,
	}, testInfo) => {
		const id = "private-item-01";
		const input = { ...message("ask-11", question, true), conversationId: id };
		const reply = waitingReply(input, 12);
		await isolateChat(page);
		const details: ItemDetail = {
			id,
			title: question,
			source: "conversation",
			state: "running",
			botMemberId: bot.id,
			conversationId: id,
			startedAt: input.createdAt,
			endedAt: null,
			result: null,
			failureReason: null,
			instruction: null,
			steps: [],
			cancellable: false,
			pausable: false,
		};
		await page.route(`**/v1/items/${id}`, (route) => route.fulfill({ json: details }));
		await page.route(`**/v1/items/${id}/session`, (route) =>
			route.fulfill({ json: { conversation: { ...conversation, id, isPrimary: false, pinned: false } } }),
		);
		await page.route(`**/v1/conversations/${id}/messages?**`, (route) =>
			route.fulfill({ json: { items: [input, reply, waitingReply(input, 13)], nextCursor: null, hasMore: false } }),
		);
		await page.goto(`/tasks/${id}`);
		const waiting = page.locator(dotsSelector);
		await expect(waiting).toHaveCount(1);
		await expect(waiting).toBeInViewport();
		await page.screenshot({ path: testInfo.outputPath("private-session-waiting.png") });
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(waiting.locator("i").first()).toHaveCSS("animation-name", "none");
		await page.screenshot({ path: testInfo.outputPath("private-session-reduced-motion.png") });
	});
});

test("terminal, background and other chats do not get dots; an active run does not drag an older scroll position", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	const input = message("ask-41", question, true);
	const reply = waitingReply(input, 42);
	const autonomous = waitingReply(input, 43);
	autonomous.run.userMessageId = "";
	const history = [
		...Array.from({ length: 38 }, (_, i) =>
			message(`prev-${String(i + 1).padStart(2, "0")}`, `历史消息 ${i + 1}`, i % 2 === 0),
		),
		input,
		autonomous,
	];
	const api = await isolateChat(page, { items: history });
	await page.goto(primaryPath);
	const waiting = page.locator(dotsSelector);
	await expect(page.getByText(question, { exact: true })).toBeVisible();
	await expect.poll(api.connected).toBe(true);
	await expect(waiting).toHaveCount(0);
	const viewport = page.getByRole("log").locator("xpath=ancestor::*[contains(@class,'overflow-y-auto')][1]");
	await viewport.evaluate((el) => {
		el.scrollTop = el.scrollHeight;
	});
	api.create(reply);
	await expect(waiting).toBeInViewport();
	await viewport.evaluate((el) => {
		el.scrollTop = 0;
	});
	await expect(page.locator("[data-chat-jump-latest]")).toBeVisible();
	api.updateRun({ ...reply.run, status: "completed" });
	await expect(waiting).toHaveCount(0);
	await expect(page.locator('[data-message-id="reply-42"]')).toHaveCount(0);
	api.create(waitingReply(input, 44));
	await expect(waiting).toHaveCount(1);
	await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
	api.updateRun({ ...waitingReply(input, 44).run, status: "cancelled" });
	await expect(waiting).toHaveCount(0);
	api.create(waitingReply(input, 45));
	await expect(waiting).toHaveCount(1);
	api.updateRun({ ...waitingReply(input, 45).run, status: "failed", canRetry: false });
	await expect(waiting).toHaveCount(0);
});

test("a group with a matching user-initiated Bot run stays unchanged", async ({ page }) => {
	const input = message("ask-21", question, true);
	await isolateChat(page, { group: true, items: [input, waitingReply(input, 22)] });
	await page.goto(primaryPath);
	await expect(page.getByText(question, { exact: true })).toBeVisible();
	await expect(page.locator(dotsSelector)).toHaveCount(0);
});

import { devices, expect, type Page, test } from "@playwright/test";
import type { Conversation, ItemDetail, MeetingRecord, Message, SendMessageRequest } from "@yonder/protocol";
import { bodies, bot, conversation, isolateChat, message } from "./chat-fixture.ts";

const meetingId = "mtg_01KB0ANQFMWYK4RG97RVMFE0YF";
const newItemId = "cnv_01KB0ARAWXPFTM03DCVG0SNB2H";
const recordedAt = "2026-11-19T01:24:00.000Z";
const endedAt = "2026-11-19T01:25:00.000Z";
const recording: MeetingRecord = {
	id: meetingId,
	clientRecordingId: "item-chat-recording",
	conversationId: conversation.id,
	title: "项目同步会",
	sourceState: "ended",
	startedAt: Date.parse(recordedAt),
	endedAt: Date.parse(recordedAt) + 20_000,
	durationMs: 20_000,
	uploadedDurationMs: 20_000,
	status: "completed",
	segments: [],
	batches: [],
	transcript: "00:03 发言人 1：周四前完成新版登录页的动效验收。\n00:12 发言人 2：我整理手机端的回归用例。",
	summary: "周四前完成登录页动效验收，并整理手机端回归用例。",
	summaryRunId: null,
	resultMessageId: null,
	failedStage: null,
	errorCode: null,
};
const meetingItem: ItemDetail = {
	id: meetingId,
	source: "meeting",
	title: recording.title,
	state: "completed",
	botMemberId: bot.id,
	conversationId: conversation.id,
	startedAt: recordedAt,
	endedAt,
	result: recording.summary,
	failureReason: null,
	instruction: null,
	steps: [{ kind: "internal_step_must_stay_hidden", detail: null, at: endedAt }],
	cancellable: false,
	pausable: false,
};
const meetingSession: Conversation = {
	...conversation,
	id: "cnv_01KB0BZ1VBT9GCRC19T7XB7J1X",
	isPrimary: false,
	pinned: false,
};
const newSession: Conversation = { ...conversation, id: newItemId, isPrimary: false, pinned: false };
const firstMessage = "帮我把下周的发布准备列成清单";
const firstReply = "可以。先确认上线范围，再检查回归、签名和发布顺序。";
const priorDraft = "主 Bot 的草稿";
const followUp = "这次会议定了哪一项截止时间？";
const followUpReply = "会议确定周四前完成登录页动效验收。";
const newItem = {
	...meetingItem,
	id: newItemId,
	source: "conversation" as const,
	title: firstMessage,
	conversationId: newSession.id,
	startedAt: "2026-11-19T02:10:00.000Z",
	endedAt: "2026-11-19T02:10:05.000Z",
	result: null,
	steps: [],
};

async function isolateItems(page: Page, taskOnlyRecording: boolean) {
	const api = await isolateChat(page);
	const meeting = taskOnlyRecording ? { ...recording, summary: null } : recording;
	const legacyItem = taskOnlyRecording ? { ...meetingItem, result: recording.transcript } : meetingItem;
	const sessionRequests: string[] = [];
	const newRequests: SendMessageRequest[] = [];
	const followUps: SendMessageRequest[] = [];
	const histories = new Map<string, Message[]>([
		[meetingSession.id, []],
		[newSession.id, []],
	]);
	await page.route(
		(url) => url.pathname.startsWith("/v1/items"),
		async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			if (url.pathname === "/v1/items") {
				if (request.method() === "POST") {
					const input: SendMessageRequest = request.postDataJSON();
					newRequests.push(input);
					histories.set(newSession.id, [
						{
							...message("item-msg-01", input.body, true),
							conversationId: newSession.id,
							clientNonce: input.clientNonce,
							createdAt: newItem.startedAt,
						},
					]);
					return route.fulfill({ json: { item: newItem, conversation: newSession } });
				}
				return route.fulfill({
					json: {
						items: url.searchParams.has("activeSubtasks")
							? []
							: newRequests.length
								? [newItem, legacyItem]
								: [legacyItem],
						nextCursor: null,
					},
				});
			}
			for (const [item, session] of [
				[legacyItem, meetingSession],
				[newItem, newSession],
			] as const) {
				if (url.pathname === `/v1/items/${item.id}` && request.method() === "GET") return route.fulfill({ json: item });
				if (url.pathname === `/v1/items/${item.id}/session` && request.method() === "POST") {
					sessionRequests.push(item.id);
					return route.fulfill({ json: { conversation: session } });
				}
			}
			return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
		},
	);
	await page.route(`**/v1/meetings/${meetingId}`, (route) => route.fulfill({ json: meeting }));
	await page.route(/\/v1\/conversations\/[^/]+\/messages(?:\?|$)/, async (route) => {
		const request = route.request();
		const [, , , id] = new URL(request.url()).pathname.split("/");
		const history = histories.get(id ?? "");
		if (!id || !history) return route.fallback();
		if (request.method() === "GET")
			return route.fulfill({ json: { items: history, nextCursor: null, hasMore: false } });
		const input: SendMessageRequest = request.postDataJSON();
		followUps.push(input);
		const user = {
			...message("follow-up-03", input.body, true),
			conversationId: id,
			clientNonce: input.clientNonce,
			createdAt: "2026-11-19T01:27:00.000Z",
		};
		const reply = {
			...message("follow-up-04", followUpReply),
			conversationId: id,
			createdAt: "2026-11-19T01:27:05.000Z",
		};
		history.push(user, reply);
		await route.fulfill({ json: { message: user, clientNonce: input.clientNonce } });
		api.create(reply);
	});
	return {
		...api,
		sessionRequests,
		newRequests,
		followUps,
		publishFirstReply: () => {
			const reply = {
				...message("item-msg-02", firstReply),
				conversationId: newSession.id,
				createdAt: newItem.endedAt,
			};
			histories.get(newSession.id)?.push(reply);
			api.create(reply);
		},
	};
}

const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
for (const layout of ["desktop", "mobile"] as const) {
	test.describe(layout, () => {
		test.use({
			...(layout === "mobile" ? phone : { viewport: { width: 1440, height: 900 } }),
			reducedMotion: "reduce",
			timezoneId: "Asia/Singapore",
		});

		test("a recording item folds its transcript and keeps the follow-up in the item", async ({ page }, info) => {
			const api = await isolateItems(page, layout === "mobile");
			await page.goto("/tasks");
			await page.getByRole("button", { name: new RegExp(recording.title) }).click();
			await expect(page).toHaveURL(new RegExp(`/tasks/${meetingId}$`));
			const title = page.getByRole("heading", { name: recording.title });
			await expect(title).toBeVisible();
			const header = page.locator("[data-frame-header]").filter({ has: title });
			await expect(header).toContainText("已完成");
			await expect(header).toContainText(/0?9:24/);
			await expect(header).toContainText(/0?9:25/);
			await expect(header).not.toContainText(bot.displayName);
			await expect(page.getByText("internal_step_must_stay_hidden")).toHaveCount(0);
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			await expect(input).toBeEditable();
			const card = page.locator("[data-item-recording]");
			await expect(card).toContainText("00:00:20");
			const transcript = card.getByText(recording.transcript, { exact: true });
			const expand = page.getByText("转写全文", { exact: true });
			await expect(expand).toBeVisible();
			await expect(transcript).toBeHidden();
			await page.screenshot({ path: info.outputPath(`recording-${layout}.png`), animations: "disabled", scale: "css" });
			await expand.click();
			await expect(transcript).toBeVisible();
			await page.screenshot({
				path: info.outputPath(`recording-expanded-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
			await expand.click();
			await expect(transcript).toBeHidden();

			await input.fill(followUp);
			await page.getByRole("button", { name: "发送", exact: true }).click();
			await expect(page.getByRole("log").getByText(followUp, { exact: true })).toBeVisible();
			await expect(page.getByRole("log").getByText(followUpReply, { exact: true })).toBeVisible();
			await expect(page).toHaveURL(new RegExp(`/tasks/${meetingId}$`));
			expect(api.followUps).toEqual([expect.objectContaining({ body: followUp, type: "text" })]);
			await page.reload();
			await expect(page.getByRole("log").getByText(followUpReply, { exact: true })).toBeVisible();
			expect(api.sessionRequests).toContain(meetingId);
			await page.goto("/messages/main");
			await expect(page.getByRole("log").getByText(bodies.question, { exact: true })).toBeVisible();
			await expect(page.getByText(followUp, { exact: true })).toHaveCount(0);
			expect(api.sent).toEqual([]);
		});

		test("adding an item opens a fresh composer and saves the first message under Tasks", async ({ page }, info) => {
			const api = await isolateItems(page, false);
			await page.goto("/messages/main");
			await page.getByRole("textbox", { name: /^对 界面验收/ }).fill(priorDraft);
			await page.getByRole("button", { name: "任务", exact: true }).click();
			await page.getByRole("button", { name: "新建事项" }).click();
			await expect(page).toHaveURL(/\/tasks\/new$/);
			await expect(page.getByRole("heading", { name: "新事项", exact: true })).toBeVisible();
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			await expect(input).toBeEditable();
			await expect(input).toBeInViewport({ ratio: 1 });
			await expect(input).toHaveAttribute("placeholder", /^对 界面验收/);
			await expect(input).toHaveValue("");
			await expect(page.getByText(bodies.question, { exact: true })).toHaveCount(0);
			expect(api.newRequests).toEqual([]);
			await page.screenshot({ path: info.outputPath(`new-item-${layout}.png`), animations: "disabled", scale: "css" });
			await expect(
				page.getByRole("button", { name: /帮我准备即将参加的会议|帮我做一份市场调研|帮我准备旅行行李清单/ }),
			).toHaveCount(0);

			await input.fill(firstMessage);
			await page.getByRole("button", { name: "发送", exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/tasks/${newItemId}$`));
			await expect(page.getByRole("log").getByText(firstMessage, { exact: true })).toBeVisible();
			expect(api.sessionRequests).toEqual([]);
			await expect(page.getByRole("log").getByText(firstReply, { exact: true })).toHaveCount(0);
			api.publishFirstReply();
			await expect(page.getByRole("log").getByText(firstReply, { exact: true })).toBeVisible();
			expect(api.newRequests).toEqual([
				expect.objectContaining({ body: firstMessage, type: "text", clientNonce: expect.any(String) }),
			]);
			await page.screenshot({
				path: info.outputPath(`item-conversation-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
			await page.goto("/tasks");
			const itemRow = page.getByRole("button", { name: new RegExp(firstMessage) });
			await expect(itemRow).toBeVisible();
			await expect(itemRow).not.toContainText("还没有结果");
			await page.goto("/messages/main");
			await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toHaveValue(priorDraft);
			await expect(page.getByText(firstMessage, { exact: true })).toHaveCount(0);
			expect(api.sent).toEqual([]);
		});
	});
}

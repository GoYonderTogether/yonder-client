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
const paneEvidence = process.env.YONDER_E2E_EVIDENCE_DIR;
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

async function closeMeetingPane(page: Page) {
	const pane = page.locator("[data-detail-pane]");
	if (await pane.isVisible()) await pane.getByRole("button", { name: "关闭全部", exact: true }).click();
	else await page.getByRole("dialog").getByRole("button", { name: "返回", exact: true }).click();
	await expect(page.locator("[data-recording-reader]")).toHaveCount(0);
}

async function isolateItems(page: Page, taskOnlyRecording: boolean, withRunningMeeting = false, rich = false) {
	const meetingNotice = {
		...message("recording-notice-03", null),
		meeting: rich
			? {
					id: recording.id,
					title: recording.title,
					startedAt: recording.startedAt,
					endedAt: recording.endedAt,
					durationMs: recording.durationMs,
					photoCount: 2,
				}
			: { id: recording.id, title: recording.title },
		createdAt: endedAt,
	};
	const primaryHistory = [message("message-01", bodies.question, true), meetingNotice];
	const api = await isolateChat(page, withRunningMeeting ? { items: primaryHistory } : {});
	const evidence = "后半部分：动效由小何负责。";
	const older = "前半部分：先交付登录页。";
	const lateBatches: MeetingRecord["batches"] = [
		{
			index: 1,
			firstSegment: 2,
			lastSegment: 3,
			startMs: 8000,
			endMs: 16000,
			state: "completed",
			text: evidence,
			errorCode: null,
		},
	];
	let detailRequests = 0;
	let meeting: MeetingRecord = rich
		? {
				...recording,
				brief: "登录页先交付",
				summary:
					"## 决定\n\n本轮先交付新版登录页，动效验收不与其他页面绑在一起。[查看依据](#batch-2)\n\n## 下一步\n\n- 小何跟进登录页动效验收。\n- 补齐手机端回归用例，覆盖进出页面和低性能设备。\n\n## 待确认\n\n[正式上线日期](#batch-99)还没有确定。\n\n![外部照片](https://external-example.invalid/photo.png)",
				photos: [
					{ clientPhotoId: "photo-2", elapsedMs: 12000, byteLength: 42 },
					{ clientPhotoId: "photo-1", elapsedMs: 4000, byteLength: 42 },
				],
				batches: lateBatches,
			}
		: withRunningMeeting
			? { ...recording, summary: null, photos: [{ clientPhotoId: "photo-1", elapsedMs: 12_000, byteLength: 42 }] }
			: taskOnlyRecording
				? { ...recording, summary: null }
				: recording;
	let legacyItem: ItemDetail = rich
		? meetingItem
		: withRunningMeeting
			? { ...meetingItem, state: "running", result: null, endedAt: null }
			: taskOnlyRecording
				? { ...meetingItem, result: recording.transcript }
				: meetingItem;
	const sessionRequests: string[] = [];
	const renames: string[] = [];
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
				if (url.pathname === `/v1/items/${item.id}/session` && request.method() === "PATCH") {
					const { title } = request.postDataJSON();
					renames.push(title);
					legacyItem = { ...legacyItem, title };
					meeting = { ...meeting, topic: title };
					return route.fulfill({ json: { conversation: { ...session, title } } });
				}
				if (url.pathname === `/v1/items/${item.id}/session` && request.method() === "POST") {
					sessionRequests.push(item.id);
					return route.fulfill({ json: { conversation: session } });
				}
			}
			return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
		},
	);
	await page.route(`**/v1/meetings/${meetingId}`, (route) => {
		detailRequests++;
		return route.fulfill({ json: meeting });
	});
	const photoRequests: string[] = [];
	if (withRunningMeeting || rich)
		await page.route(`**/v1/meetings/${meetingId}/live/photos/*/content`, async (route) => {
			photoRequests.push(route.request().headers().authorization ?? "");
			await route.fulfill({ path: new URL("./fixtures/meeting-check-photo.jpg", import.meta.url).pathname });
		});
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
		photoRequests,
		renames,
		evidence,
		older,
		detailRequests: () => detailRequests,
		updateRecordingTitle: (title: string) => {
			legacyItem = { ...legacyItem, title };
			meeting = { ...meeting, topic: title };
			const updated = { ...meetingNotice, version: 2, meeting: { ...meetingNotice.meeting, title } };
			// The server persists this message before publishing the realtime event.
			const index = primaryHistory.findIndex((entry) => entry.id === updated.id);
			primaryHistory[index] = updated;
			api.update(updated);
		},
		backfill: () => {
			meeting = {
				...meeting,
				batches: [
					{
						index: 0,
						firstSegment: 0,
						lastSegment: 1,
						startMs: 0,
						endMs: 8000,
						state: "completed",
						text: older,
						errorCode: null,
					},
					...lateBatches,
				],
			};
		},
		finishMeetingTask: () => {
			legacyItem = meetingItem;
			const result = {
				...message("meeting-result-07", recording.summary),
				conversationId: meetingSession.id,
				createdAt: "2026-11-19T01:27:10.000Z",
			};
			histories.get(meetingSession.id)?.push(result);
			api.create(result);
		},
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

		test("a referenced task shows its result and original resource links without leaving the chat", async ({
			page,
		}) => {
			const detail: ItemDetail = {
				...newItem,
				result: "签名、上线范围与回归用例已汇总。",
				files: ["/notes/发布清单.md"],
			};
			await isolateChat(page, {
				items: [{ ...message("task-pane-04", ""), taskSession: { id: detail.id, title: detail.title } }],
			});
			await page.route(`**/v1/items/${detail.id}`, (route) => route.fulfill({ json: detail }));
			await page.goto("/messages/main");
			await page.getByRole("button", { name: `打开任务 · ${detail.title}` }).click();
			const pane = page.locator("[data-task-pane-reader]");
			await expect(pane).toContainText(detail.result ?? "");
			await expect(pane.getByRole("link", { name: "发布清单.md" })).toHaveAttribute("href", /^\/memory\/files\//);
			await expect(pane.getByRole("link", { name: "打开完整任务" })).toHaveAttribute("href", `/tasks/${detail.id}`);
			await expect(page).toHaveURL(/\/messages\/main$/);
			if (paneEvidence)
				await page.screenshot({ path: `${paneEvidence}/chat-task-reference-${layout}.png`, animations: "disabled" });
		});

		test("a recording item opens its transcript and keeps the follow-up in the item", async ({ page }, info) => {
			const api = await isolateItems(page, layout === "mobile");
			await page.goto("/tasks");
			await page.getByRole("button", { name: new RegExp(recording.title) }).click();
			await expect(page).toHaveURL(new RegExp(`/tasks/${meetingId}$`));
			const title = page.getByRole("heading", { name: recording.title });
			await expect(title).toBeVisible();
			const header = page.locator("[data-frame-header]").filter({ has: title });
			// A finished item adds no state word (2026-11-24); it still shows when it ran.
			await expect(header).not.toContainText("已完成");
			await expect(header).toContainText(/0?9:24/);
			await expect(header).toContainText(/0?9:25/);
			const identity = header.locator("[data-chat-agent-title]");
			if (layout === "desktop") {
				await expect(identity.locator("[data-bot-display-name]")).toHaveText(bot.displayName);
				await expect(identity.locator("[data-chat-agent-avatar] [data-avatar-fallback]")).toHaveCSS(
					"border-radius",
					"9999px",
				);
				await expect(identity.locator("[data-chat-agent-name]")).toHaveCSS("box-shadow", /rgba?\(/);
			} else {
				await expect(identity).toHaveCount(0);
			}
			await expect(page.getByText("internal_step_must_stay_hidden")).toHaveCount(0);
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			await expect(input).toBeEditable();
			const card = page.locator("[data-item-recording]");
			await expect(card.getByText(recording.title, { exact: true })).toBeVisible();
			await expect(card.getByText("09:24", { exact: true })).toBeVisible();
			await expect(card.getByText(/^.+ · 20秒$/)).toBeVisible();
			await expect(card.getByText(recording.transcript, { exact: true })).toHaveCount(0);
			await page.screenshot({ path: info.outputPath(`recording-${layout}.png`), animations: "disabled", scale: "css" });
			await card.getByRole("button", { name: `查看录音笔记 · ${recording.title}` }).click();
			const reader = page.locator("[data-recording-reader]");
			if (layout === "mobile") await expect(reader.getByRole("radio", { name: "整理稿" })).toBeDisabled();
			else await reader.getByRole("radio", { name: "原文" }).click();
			await expect(reader.getByRole("radio", { name: "原文" })).toBeChecked();
			await expect(reader.getByText(recording.transcript, { exact: true })).toBeVisible();
			await page.screenshot({
				path: info.outputPath(`recording-expanded-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
			await closeMeetingPane(page);

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

		test("a new model title refreshes the open recording top card and the same entry in history", async ({ page }) => {
			const api = await isolateItems(page, true, true, true);
			await page.goto("/messages/main");
			await page.getByRole("button", { name: `查看录音笔记 · ${recording.title}` }).click();
			await page.getByRole("link", { name: "打开完整任务" }).click();
			const card = page.locator("[data-item-recording]");
			await expect(card.getByText(recording.title, { exact: true })).toBeVisible();
			await expect.poll(api.connected).toBeTruthy();
			const title = "新版登录页评审";
			api.updateRecordingTitle(title);
			await expect(card.getByText(title, { exact: true })).toBeVisible();
			await expect(card.getByText("登录页先交付", { exact: true })).toBeVisible();
			await page.goBack();
			const entry = page.getByRole("button", { name: `查看录音笔记 · ${title}` });
			await expect(entry.getByText(title, { exact: true })).toBeVisible();
			await page.reload();
			await expect(entry.getByText(title, { exact: true })).toBeVisible();
		});

		test("a main Bot recording card opens a running independent task", async ({ page }, info) => {
			const api = await isolateItems(page, true, true);
			await page.goto("/messages/main");
			const entry = page.getByRole("button", { name: `查看录音笔记 · ${recording.title}` });
			await expect(entry).toBeVisible();
			await page.screenshot({
				path: info.outputPath(`recording-task-entry-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
			await entry.click();
			await expect(page).toHaveURL(/\/messages\/main$/);
			const reader = page.locator("[data-recording-reader]");
			await expect(reader.getByRole("radio", { name: "原文" })).toBeChecked();
			if (paneEvidence)
				await page.screenshot({ path: `${paneEvidence}/chat-meeting-pane-${layout}.png`, animations: "disabled" });
			await reader.getByRole("link", { name: "打开完整任务" }).click();
			await expect(page).toHaveURL(new RegExp(`/tasks/${meetingId}$`));
			const header = page
				.locator("[data-frame-header]")
				.filter({ has: page.getByRole("heading", { name: recording.title }) });
			await expect(header).toContainText("进行中");
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			await input.fill(followUp);
			await page.getByRole("button", { name: "发送", exact: true }).click();
			const log = page.getByRole("log");
			await expect(log.getByText(followUpReply, { exact: true })).toBeVisible();
			expect(api.sent).toEqual([]);
			expect(api.followUps).toEqual([expect.objectContaining({ body: followUp })]);
			await page.screenshot({
				path: info.outputPath(`recording-task-running-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
			api.finishMeetingTask();
			await expect(log.getByText(recording.summary ?? "", { exact: true })).toBeVisible();
			await expect(header).not.toContainText("已完成");
			await page.getByRole("button", { name: "00:00:12 的照片" }).click();
			await expect(page.getByRole("img", { name: "00:00:12 的照片" })).toBeVisible();
			expect(api.photoRequests.length).toBeGreaterThan(0);
			expect(new Set(api.photoRequests)).toEqual(new Set(["Bearer isolated-chat-ui"]));
			await page.screenshot({
				path: info.outputPath(`recording-task-delivery-${layout}.png`),
				animations: "disabled",
				scale: "css",
			});
		});

		test("archived notes show private ordered media and stable batch citations after backfill", async ({
			page,
		}, info) => {
			const api = await isolateItems(page, false, true, true);
			const externalRequests: string[] = [];
			await page.route("https://external-example.invalid/**", (route) => {
				externalRequests.push(route.request().url());
				return route.abort();
			});
			await page.goto("/messages/main");
			const entry = page.getByRole("button", { name: `查看录音笔记 · ${recording.title}` });
			await expect(entry.getByText(recording.title, { exact: true })).toBeVisible();
			await expect(entry).toHaveAccessibleDescription(/^.+ · 20秒$/);
			expect(api.detailRequests()).toBe(0);
			await entry.click();
			await expect(page).toHaveURL(/\/messages\/main$/);
			const reader = page.locator("[data-recording-reader]");
			await expect(reader.getByRole("heading", { name: "决定" })).toBeVisible();
			await expect(reader.getByText("正式上线日期")).toBeVisible();
			await expect(reader.getByRole("button", { name: "正式上线日期" })).toHaveCount(0);
			await expect(reader.locator("script")).toHaveCount(0);
			await page.screenshot({
				path: paneEvidence
					? `${paneEvidence}/chat-meeting-summary-${layout}.png`
					: info.outputPath("archive-notes.png"),
				animations: "disabled",
				scale: "css",
			});
			await reader.getByRole("button", { name: "查看依据" }).click();
			await expect(page).toHaveURL(/\/messages\/main$/);
			await expect(reader.locator('[data-recording-source="batch-2"]')).toBeFocused();
			await expect(reader.locator('[data-recording-source="batch-2"]')).toContainText(api.evidence);
			expect(externalRequests).toEqual([]);
			await reader.getByRole("link", { name: "打开完整任务" }).click();
			await expect(page).toHaveURL(new RegExp(`/tasks/${meetingId}$`));
			const card = page.locator("[data-item-recording]");
			await expect(card).toContainText("登录页先交付");
			await expect(card.getByText(recording.title, { exact: true })).toBeVisible();
			await expect(card.getByText("09:24", { exact: true })).toBeVisible();
			await expect(card.getByText(/^.+ · 20秒$/)).toBeVisible();
			await expect(card.locator("[data-recording-photos] button")).toHaveCount(2);
			await expect(card.locator("[data-recording-photos] button").first()).toHaveAccessibleName("00:00:04 的照片");
			await expect(card.locator("[data-recording-photos] img")).toHaveCount(2);
			await page.screenshot({ path: info.outputPath("archive-card.png"), animations: "disabled", scale: "css" });
			await card.getByRole("button", { name: `查看录音笔记 · ${recording.title}` }).click();
			if (layout !== "mobile") {
				await expect(page.getByRole("tab", { name: recording.title })).toHaveCount(1);
				await expect(reader.getByRole("radio", { name: "原文" })).toBeChecked();
			}
			await closeMeetingPane(page);
			await page.goto(`/tasks/${meetingId}?recording=original&source=batch-2`);
			await expect(reader.locator("#batch-2")).toBeFocused();
			const anchored = reader.locator("#batch-2");
			await expect(anchored).toBeFocused();
			await expect(anchored).toContainText(api.evidence);
			api.backfill();
			await page.reload();
			await expect(anchored).toBeFocused();
			await expect(reader.locator("#batch-0")).toContainText(api.older);
			await expect(anchored).toContainText(api.evidence);
			expect(await reader.locator(".recording-reader-entry").evaluateAll((nodes) => nodes.map((n) => n.id))).toEqual([
				"batch-0",
				"photo-photo-1",
				"batch-2",
				"photo-photo-2",
			]);
			await reader.locator("#photo-photo-1").getByRole("button", { name: "下一张照片" }).click();
			await expect(reader.locator("#photo-photo-2")).toBeFocused();
			await expect(reader.getByRole("img", { name: "00:00:12 的照片" })).toBeVisible();
			expect(new Set(api.photoRequests)).toEqual(new Set(["Bearer isolated-chat-ui"]));
			await page.screenshot({ path: info.outputPath("archive-original.png"), animations: "disabled", scale: "css" });
			await reader.getByRole("button", { name: "关闭", exact: true }).click();
			await expect(reader).toHaveCount(0);
			await page.getByRole("button", { name: "重命名事项" }).click();
			await page.getByRole("textbox", { name: "重命名事项" }).fill("  登录页  交付确认  ");
			await page.getByRole("button", { name: "保存", exact: true }).click();
			await expect(page.getByRole("heading", { name: "登录页 交付确认" })).toBeVisible();
			await expect(card.getByText("登录页 交付确认", { exact: true })).toBeVisible();
			await expect(card.getByRole("button", { name: "查看录音笔记 · 登录页 交付确认" })).toBeVisible();
			expect(api.renames).toEqual(["登录页 交付确认"]);
		});

		test("adding an item opens a fresh composer and saves the first message under Tasks", async ({ page }, info) => {
			const api = await isolateItems(page, false);
			await page.goto("/messages/main");
			await page.getByRole("textbox", { name: /^对 界面验收/ }).fill(priorDraft);
			// 「+」 asks the main Bot now (2026-11-24); the blank session route is still reachable directly.
			await page.goto("/tasks/new");
			await expect(page).toHaveURL(/\/tasks\/new$/);
			await expect(page.getByRole("heading", { name: "新事项", exact: true })).toBeVisible();
			const input = page.getByRole("textbox", { name: /^对 界面验收/ });
			await expect(input).toBeEditable();
			await expect(input).toBeInViewport({ ratio: 1 });
			// The phone composer uses the accessible recipient name without a native placeholder.
			if (layout === "desktop") await expect(input).toHaveAttribute("placeholder", /^对 界面验收/);
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

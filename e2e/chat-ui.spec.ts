import { mkdir } from "node:fs/promises";
import { devices, expect, type Page, type TestInfo, test } from "@playwright/test";
import type { ItemSummary, SubtaskSummary } from "@yonder/protocol";
import { bodies, bot, conversation, isolateChat, message } from "./chat-fixture.ts";

const path = `/messages/${conversation.id}`;
async function capture(page: Page, testInfo: TestInfo, name: string) {
	const directory = testInfo.outputPath("round2");
	await mkdir(directory, { recursive: true });
	await assertNoShadows(page);
	await page.screenshot({ path: `${directory}/actual-product-route-${name}.png`, animations: "disabled" });
}
async function openChat(page: Page) {
	await page.goto(path);
	await expect(page).toHaveURL(new RegExp(`${path}$`));
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.getByRole("textbox", { name: /^对 界面验收/ })).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator('[data-page-layer="detail"]')
				.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41),
		)
		.toBeCloseTo(0, 2);
}
async function assertNoShadows(page: Page) {
	const shadows = await page.locator("#root *").evaluateAll((elements) =>
		elements.flatMap((element) => {
			const node = element as HTMLElement;
			if (!node.getClientRects().length || node.closest("[inert], [aria-hidden=true]")) return [];
			if (node.matches('[role="dialog"][data-page-layer="me"]')) return [];
			// The floating header's avatar and name are pills with the shadow `native-mobile.css` gives
			// them; they sit inside an identity wrapper, so match them where that CSS does.
			if (
				node.matches(
					"[data-floating-frame-header] :is([data-chat-agent-avatar], [data-chat-agent-name]), button[data-chat-jump-latest]",
				)
			)
				return [];
			const shadow = getComputedStyle(node).boxShadow;
			return shadow === "none" ? [] : [{ tag: node.tagName, className: node.className, shadow }];
		}),
	);
	expect(shadows).toEqual([]);
}
async function assertBubbles(page: Page) {
	const incoming = page.locator(".message-bubble-incoming");
	const outgoing = page.locator(".message-bubble-outgoing");
	await expect(incoming).toHaveText(bodies.answer.replaceAll("**", "").replaceAll("\n", ""));
	await expect(outgoing).toHaveText(bodies.question);
	await expect(page.getByRole("log").locator("[data-message-sender-avatar]")).toHaveCount(0);
	const geometry = await page.locator("[role=log]").evaluate((log) => {
		const incoming = log.querySelector<HTMLElement>(".message-bubble-incoming");
		const outgoing = log.querySelector<HTMLElement>(".message-bubble-outgoing");
		if (!incoming || !outgoing) throw new Error("Both message directions need a bubble");
		const left = incoming.getBoundingClientRect(),
			right = outgoing.getBoundingClientRect(),
			parent = log.getBoundingClientRect();
		return {
			incomingLeft: left.left,
			outgoingRight: right.right,
			logLeft: parent.left,
			logRight: parent.right,
			incomingColor: getComputedStyle(incoming).backgroundColor,
			outgoingColor: getComputedStyle(outgoing).backgroundColor,
			incomingRadius: getComputedStyle(incoming).borderRadius,
		};
	});
	expect(geometry.incomingLeft).toBeCloseTo(geometry.logLeft, 0);
	expect(geometry.outgoingRight).toBeCloseTo(geometry.logRight, 0);
	expect(geometry.incomingColor).not.toBe(geometry.outgoingColor);
	expect(geometry.incomingColor).not.toBe("rgba(0, 0, 0, 0)");
	expect(geometry.incomingRadius).toBe("16px");
}
async function assertComposer(page: Page, onMultiline?: () => Promise<void>) {
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	const initial = await input.boundingBox();
	expect(initial).not.toBeNull();
	await input.fill("单行输入检查");
	const single = await input.evaluate((element) => {
		const area = element as HTMLTextAreaElement;
		const style = getComputedStyle(area);
		const button = area.closest(".composer-layout")?.querySelector(".composer-send");
		if (!button) throw new Error("Expected the actual Composer send button");
		const a = area.getBoundingClientRect(),
			b = button.getBoundingClientRect();
		return {
			paddingLeft: parseFloat(style.paddingLeft),
			paddingRight: parseFloat(style.paddingRight),
			spacing2: parseFloat(getComputedStyle(area).getPropertyValue("--spacing-2")),
			center: a.y + a.height / 2,
			buttonCenter: b.y + b.height / 2,
		};
	});
	expect(single.spacing2).toBe(8);
	expect(single.paddingLeft).toBe(single.spacing2);
	expect(single.paddingRight).toBe(single.spacing2);
	expect(single.center).toBeCloseTo(single.buttonCenter, 0);
	await input.fill("多行文本\n".repeat(30));
	await expect.poll(async () => (await input.boundingBox())?.height).toBe(160);
	await expect.poll(() => input.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	await onMultiline?.();
	await input.fill("");
	await expect.poll(async () => (await input.boundingBox())?.height).toBe(initial?.height);
}

for (const dark of [false, true]) {
	test(`actual product route shows both message bubbles and usable Composer on desktop ${dark ? "dark" : "light"}`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 1280, height: 850 });
		await isolateChat(page, { dark });
		await openChat(page);
		await assertBubbles(page);
		await assertComposer(page, () => capture(page, testInfo, `desktop-${dark ? "dark" : "light"}-multiline`));
		const inset = await page.locator('[data-page-layer="detail"]').evaluate((element) => {
			const main = element.querySelector("main");
			if (!main) throw new Error("Expected the product main panel");
			const outer = element.getBoundingClientRect(),
				inner = main.getBoundingClientRect();
			return [inner.top - outer.top, outer.bottom - inner.bottom, inner.left - outer.left, outer.right - inner.right];
		});
		expect(inset).toEqual([8, 8, 8, 8]);
		await capture(page, testInfo, `desktop-${dark ? "dark" : "light"}`);
	});
}

test("the desktop rail centers the account avatar on the same axis as its tabs", async ({ page }, testInfo) => {
	await isolateChat(page);
	await page.goto(path);
	const nav = page.getByRole("navigation", { name: "主导航" });
	const avatar = nav.getByRole("button", { name: "我", exact: true });
	for (const width of [360, 820, 1280]) {
		await page.setViewportSize({ width, height: 850 });
		await expect(avatar).toBeVisible();
		const account = await avatar.boundingBox();
		if (!account) throw new Error("Expected the desktop avatar button");
		for (const label of ["消息", "任务", "记忆"]) {
			const tab = await nav.getByRole("button", { name: label, exact: true }).boundingBox();
			if (!tab) throw new Error(`Expected the desktop tab ${label}`);
			expect(account.x + account.width / 2).toBeCloseTo(tab.x + tab.width / 2, 1);
		}
	}
	await expect(page.getByRole("log")).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("desktop-rail-aligned.png"), animations: "disabled" });
	await avatar.click();
	await expect(page).toHaveURL(/\/me\/profile$/);
	await expect(page.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
});

test("desktop avatar selection, hover, keyboard focus and action icons keep their geometry without shadows", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 850 });
	await isolateChat(page);
	await openChat(page);
	const nav = page.getByRole("navigation", { name: "主导航" });
	const avatar = nav.getByRole("button", { name: "我", exact: true });
	await expect(avatar).toHaveAttribute("aria-expanded", "false");
	const original = await avatar.boundingBox();
	await avatar.hover();
	await expect.poll(() => avatar.boundingBox()).toEqual(original);
	const centering = await avatar.evaluate((button) => {
		const face = button.querySelector("[data-avatar-fallback]");
		if (!face) throw new Error("Expected the actual avatar");
		const b = button.getBoundingClientRect(),
			f = face.getBoundingClientRect();
		return { x: f.x + f.width / 2 - b.x - b.width / 2, y: f.y + f.height / 2 - b.y - b.height / 2 };
	});
	expect(centering).toEqual({ x: 0, y: 0 });
	const icon = await page.getByRole("button", { name: "发起聊天", exact: true }).evaluate((button) => {
		const svg = button.querySelector("svg");
		if (!svg) throw new Error("Expected the existing chat action icon");
		const b = button.getBoundingClientRect(),
			s = svg.getBoundingClientRect();
		return {
			width: s.width,
			height: s.height,
			x: s.x + s.width / 2 - b.x - b.width / 2,
			y: s.y + s.height / 2 - b.y - b.height / 2,
		};
	});
	expect(icon.x).toBeCloseTo(0, 1);
	expect(icon.y).toBeCloseTo(0, 1);
	expect(icon.width).toBeGreaterThanOrEqual(16);
	expect(icon.width).toBeLessThanOrEqual(24);
	expect(icon.width).toBe(icon.height);
	await avatar.focus();
	await page.keyboard.press("Space");
	await expect(page).toHaveURL(/\/me\/profile$/);
	await expect(avatar).toHaveCount(0);
	await expect(page.getByRole("dialog", { name: "我", exact: true })).not.toHaveCSS("box-shadow", "none");
	await capture(page, testInfo, "desktop-me-from-keyboard");
	await page.getByRole("button", { name: "关闭", exact: true }).click();
	await expect(avatar).toBeFocused();
	await expect.poll(() => avatar.boundingBox()).toEqual(original);
	await page.mouse.click(1100, 600);
	await expect(avatar).not.toBeFocused();
	await avatar.hover();
	await capture(page, testInfo, "desktop-me-hover");
});

test("actual conversation hides the empty Bot reply and shows reply text and proactive messages through realtime", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	const question = message("message-01", bodies.question, true);
	const reply = message("message-02", null, false, true);
	const cancelled = message("message-03", "");
	cancelled.run = {
		id: "cancelled-run",
		conversationId: conversation.id,
		messageId: cancelled.id,
		userMessageId: question.id,
		status: "cancelled",
	};
	const api = await isolateChat(page, { items: [question, reply, cancelled] });
	await openChat(page);
	const bubble = page.locator('[data-message-id="message-02"] .message-bubble-incoming');
	await expect(page.locator('[data-message-id="message-02"]')).toHaveCount(0);
	await expect(page.locator('[data-message-id="message-03"]')).toHaveCount(0);
	await capture(page, testInfo, "desktop-waiting-for-reply");
	api.update({ ...reply, body: bodies.answer, version: 2 });
	await expect(bubble).toContainText("双方都保留独立气泡");
	api.update({ ...reply, body: bodies.answer, version: 3, streaming: false });
	await expect(bubble.locator(".stream-character")).toHaveCount(0);
	await assertBubbles(page);
	const proactive = message("message-04", "定时任务已完成，整理结果可以查看了。");
	api.create(proactive);
	await expect(page.locator('[data-message-id="message-04"] .message-bubble-incoming')).toHaveText(
		proactive.body ?? "",
	);
	await capture(page, testInfo, "desktop-reply-and-proactive-message");
});

test("actual group conversation preserves the sender beside their message run", async ({ page }) => {
	await isolateChat(page, { group: true });
	await openChat(page);
	const incoming = page.locator(`[data-message-run="${bot.id}"]`);
	await expect(incoming.getByText("界面验收 BOT", { exact: true })).toBeVisible();
	await expect(incoming.locator(".message-bubble-incoming")).toContainText("双方都保留独立气泡");
});

test("Bot header names its active child tasks and shows typing only for a real reply", async ({
	page,
	browser,
	baseURL,
}, testInfo) => {
	await page.setViewportSize({ width: 1180, height: 760 });
	const reply = message("message-02", null, false, true);
	const history = [message("message-01", bodies.question, true), reply];
	const api = await isolateChat(page, { items: history });
	let tasks: ItemSummary[] = [];
	const routeTasks = (target: Page) =>
		target.route(
			(url) => url.pathname === "/v1/items" && url.searchParams.get("activeSubtasks") === "1",
			async (route) => {
				const query = new URL(route.request().url()).searchParams;
				expect(query.get("botId")).toBe(bot.id);
				await route.fulfill({
					json:
						query.get("cursor") === "next"
							? { items: tasks.slice(1), nextCursor: null }
							: { items: tasks.slice(0, 1), nextCursor: tasks.length > 1 ? "next" : null },
				});
			},
		);
	await routeTasks(page);
	const initialTasks = page.waitForResponse((response) => new URL(response.url()).searchParams.has("activeSubtasks"));
	await openChat(page);
	await initialTasks;
	const header = page.locator("[data-chat-agent-title]");
	const name = header.getByText(bot.displayName, { exact: true });
	const status = header.getByRole("status");
	await expect(name).toBeVisible();
	await expect(status).toHaveCount(0);

	const first: ItemSummary = {
		id: "first",
		title: "整理会议记录",
		botMemberId: bot.id,
		conversationId: conversation.id,
		source: "subtask",
		state: "running",
		startedAt: "2026-11-15T00:00:00Z",
		endedAt: null,
		result: null,
		failureReason: null,
	};
	tasks = [
		first,
		{ ...first, id: "second", title: "核对待办" },
		{ ...first, id: "other", botMemberId: "other-bot", title: "别的 BOT 子任务" },
		{ ...first, id: "schedule", source: "schedule_run", title: "定时任务" },
		{ ...first, id: "finished", state: "completed", title: "已完成子任务" },
	];
	const subtask: SubtaskSummary = {
		id: first.id,
		title: first.title,
		conversationId: first.conversationId,
		parentRunId: "parent",
		status: "background",
		createdAt: first.startedAt,
	};
	api.updateSubtask(subtask);
	await expect(status).toHaveText("正在处理：整理会议记录、核对待办");
	await expect(name).toBeVisible();
	await expect(header.locator('[aria-hidden="true"].rounded-full')).toHaveCount(0);
	await capture(page, testInfo, "bot-processing");

	api.update({ ...reply, body: "整理结果已经准备好了。", version: 2 });
	await expect(status).toHaveText("正在输入");
	await expect(name).toBeVisible();
	await capture(page, testInfo, "bot-typing");
	api.update({ ...reply, body: "整理结果已经准备好了。", version: 3, streaming: false });
	await expect(status).toHaveText("正在处理：整理会议记录、核对待办");

	const { defaultBrowserType: _browser, ...phoneOptions } = devices["iPhone 13"];
	const phone = await browser.newContext({ ...phoneOptions, baseURL });
	try {
		const mobile = await phone.newPage();
		await isolateChat(mobile, { items: history });
		await routeTasks(mobile);
		await mobile.goto("/messages/main");
		const mobileStatus = mobile.locator("[data-floating-frame-header] [data-chat-agent-title]").getByRole("status");
		await expect(mobileStatus).toHaveText("正在处理：整理会议记录、核对待办");
		expect(await mobileStatus.locator("span").evaluate((label) => label.scrollHeight <= label.clientHeight)).toBe(true);
		await capture(mobile, testInfo, "bot-processing-mobile");
	} finally {
		await phone.close();
	}

	tasks = [];
	api.updateSubtask({ ...subtask, status: "completed" });
	await expect(status).toHaveCount(0);
});

test("desktop blocks the IME Enter and sends the committed message on the next Enter", async ({ page }) => {
	const api = await isolateChat(page);
	await openChat(page);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	await input.fill("中文已确认");
	await input.dispatchEvent("compositionstart");
	await input.dispatchEvent("compositionend");
	await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true });
	await input.dispatchEvent("keyup", { key: "Enter", bubbles: true });
	expect(api.sent).toHaveLength(0);
	// The composer ignores Enter for 500ms after composition ends; the confirming Enter itself must
	// not send, and the next one after the window does.
	await page.waitForTimeout(510);
	await page.keyboard.press("Enter");
	await expect.poll(() => api.sent.length).toBe(1);
	expect(api.sent[0]).toMatchObject({ body: "中文已确认", type: "text" });
	await expect(input).toHaveValue("");
	await expect(page.locator(".message-bubble-outgoing").last()).toHaveText("中文已确认");
});

test("desktop Enter inserts the highlighted mention, Shift+Enter adds a newline, and Enter sends", async ({
	page,
}, testInfo) => {
	const api = await isolateChat(page);
	await openChat(page);
	const input = page.getByRole("textbox", { name: /^对 界面验收/ });
	const heading = page.locator(".composer-completion-heading");
	const marks = page.locator(".composer-highlight .composer-completion-mark");
	await input.fill("@chatbot");
	await expect(heading).toHaveText("联系人和 Bot");
	await expect(marks).toHaveText("@chatbot");
	await expect(page.getByRole("option", { name: /界面验收 BOT/ })).toHaveAttribute("aria-selected", "true");
	await page.screenshot({ path: testInfo.outputPath("composer-keyboard.png"), animations: "disabled" });
	await input.press("Enter");
	await expect(input).toHaveValue("@界面验收 BOT ");
	await expect(input).toBeFocused();
	await expect(page.getByRole("listbox")).toHaveCount(0);
	await input.press("Shift+Enter");
	await expect(input).toHaveValue("@界面验收 BOT \n");
	await input.pressSequentially("/co");
	await expect(heading).toHaveText("命令和技能");
	await expect(marks).toHaveText(["@界面验收 BOT", "/co"]);
	await page.screenshot({ path: testInfo.outputPath("composer-keyboard-slash.png"), animations: "disabled" });
	for (let index = 0; index < 3; index++) await input.press("Backspace");
	await input.pressSequentially("hello");
	expect(api.sent).toHaveLength(0);
	await input.press("Enter");
	await expect.poll(() => api.sent.length).toBe(1);
	expect(api.sent[0]?.body).toBe("@界面验收 BOT \nhello");
});

test("actual message viewport stops following while reading and jumps back to the latest reply", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 600 });
	const longBody = "阅读上方内容时新消息不应该把页面拉走。\n\n".repeat(30);
	const reply = message("message-02", longBody);
	const api = await isolateChat(page, { items: [message("message-01", bodies.question, true), reply] });
	await openChat(page);
	const scroll = page.getByRole("log").locator("xpath=../..");
	await expect
		.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
		.toBeLessThanOrEqual(1);
	await scroll.evaluate((element) => {
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, bubbles: true }));
		element.scrollTop = 0;
	});
	await expect(page.getByRole("button", { name: "跳至最新" })).toBeVisible();
	await assertNoShadows(page);
	api.update({ ...reply, body: `${longBody}新的末尾回复`, version: 2 });
	await expect(page.locator(".message-bubble-incoming")).toContainText("新的末尾回复");
	expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
	await page.getByRole("button", { name: "跳至最新" }).click();
	await expect
		.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
		.toBeLessThanOrEqual(1);
	api.update({ ...reply, body: `${longBody}新的末尾回复\n\n继续收到的最后一段`, version: 3 });
	await expect(page.locator(".message-bubble-incoming")).toContainText("继续收到的最后一段");
	await expect
		.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
		.toBeLessThanOrEqual(1);
});

test.describe("actual phone conversation route", () => {
	test.use({
		viewport: { width: 390, height: 844 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});
	test("Enter keeps a newline while the actual send button posts once to the isolated API", async ({ page }) => {
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: /^对 界面验收/ });
		await input.fill("手机第一行");
		await page.keyboard.press("Enter");
		await expect(input).toHaveValue("手机第一行\n");
		expect(api.sent).toHaveLength(0);
		await page.getByRole("button", { name: "发送", exact: true }).click();
		await expect.poll(() => api.sent.length).toBe(1);
		expect(api.sent[0]?.body).toBe("手机第一行");
		await expect(input).toBeFocused();
	});
	for (const dark of [false, true]) {
		test(`both bubbles and one seamless input dock ${dark ? "dark" : "light"}`, async ({ page }, testInfo) => {
			await isolateChat(page, { dark });
			await openChat(page);
			await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
			await expect(page.locator("[data-mobile-dock]")).toHaveCount(1);
			await assertBubbles(page);
			await assertComposer(page, () => capture(page, testInfo, `phone-${dark ? "dark" : "light"}-multiline`));
			expect(
				await page.locator("[data-mobile-dock]").evaluate((element) => getComputedStyle(element).borderTopWidth),
			).toBe("0px");
			await capture(page, testInfo, `phone-${dark ? "dark" : "light"}`);
		});
	}
	test("long Markdown keeps the 390px chat pane in bounds and scrolls code inside its block", async ({ page }) => {
		await isolateChat(page, {
			items: [message("message-01", bodies.question, true), message("message-02", bodies.long)],
		});
		await openChat(page);
		const geometry = await page.evaluate(() => {
			const rect = (selector: string) => {
				const element = document.querySelector<HTMLElement>(selector);
				if (!element) throw new Error(`Expected ${selector}`);
				const { left, right, width } = element.getBoundingClientRect();
				return { left, right, width };
			};
			const code = document.querySelector<HTMLElement>(".message-code-scroll");
			if (!code) throw new Error("Expected an independently scrollable code block");
			return {
				viewportWidth: innerWidth,
				documentWidth: document.documentElement.scrollWidth,
				main: rect("main"),
				dropZone: rect("main fieldset"),
				log: rect('[role="log"]'),
				bubble: rect(".message-bubble-incoming"),
				code: { clientWidth: code.clientWidth, scrollWidth: code.scrollWidth },
			};
		});
		expect(geometry.viewportWidth).toBe(390);
		expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
		for (const surface of [geometry.main, geometry.dropZone, geometry.log, geometry.bubble]) {
			expect(surface.left).toBeGreaterThanOrEqual(0);
			expect(surface.right).toBeLessThanOrEqual(geometry.viewportWidth);
		}
		expect(geometry.code.scrollWidth).toBeGreaterThan(geometry.code.clientWidth);
	});
	test("long links, code and file names stay inside bubbles at 360px", async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 360, height: 780 });
		await isolateChat(page, {
			items: [message("message-01", bodies.question, true), message("message-02", bodies.long)],
		});
		await openChat(page);
		const bubble = page.locator(".message-bubble-incoming");
		await expect(bubble.locator("pre code")).toContainText("const filename");
		const sizes = await bubble.evaluate((element) => {
			const pre = element.querySelector("pre");
			if (!pre) throw new Error("Expected the message code block");
			return {
				window: innerWidth,
				document: document.documentElement.scrollWidth,
				bubble: element.clientWidth,
				content: element.scrollWidth,
				pre: pre.clientWidth,
				code: pre.scrollWidth,
			};
		});
		expect(sizes.document).toBeLessThanOrEqual(sizes.window);
		expect(sizes.content).toBeLessThanOrEqual(sizes.bubble + 1);
		expect(sizes.code).toBeGreaterThan(sizes.pre);
		await expect(bubble.locator(".message-file-link")).toHaveAttribute("href", "/files/spec.pdf");
		await expect(bubble.locator(".message-file-link > span").last()).toHaveText(".pdf");
		await capture(page, testInfo, "phone-360-long-content");
	});
});

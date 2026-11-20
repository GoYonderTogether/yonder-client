import { mkdir, writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import type { ConversationMember, Message } from "@yonder/protocol";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

// Isolated API records exercise the unchanged AppRouter → AppFrame → ConversationPage route.
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
	displayName: "周予安这是一个很长的群成员姓名用于验证窄屏省略且不挤出头像和正文",
	avatarUrl: null,
};
const self = conversation.members.find((member) => member.memberId === person.id) as ConversationMember;
const assistant = conversation.members.find((member) => member.memberId === bot.id) as ConversationMember;
const members = [self, a, b, assistant];
function from(sender: ConversationMember, index: number, body: string | null, streaming = false): Message {
	return {
		...message(`group-${String(index).padStart(2, "0")}`, body, false, streaming),
		senderId: sender.memberId,
		senderKind: sender.kind,
	};
}
const sequence = () => [
	from(a, 1, "先看这一段。"),
	from(a, 2, "这条仍由我发送。"),
	from(b, 3, "我接着补充。"),
	from(b, 4, "连续消息共用身份。"),
	from(a, 5, "换回我，再起一段。"),
	from(a, 6, "头像与名字只出现一次。"),
	from(self, 7, "我这边看到了。"),
	from(self, 8, "自己的两条放在右侧。"),
	from(assistant, 9, "收到，我来整理。"),
	from(assistant, 10, "BOT 也按连续发送分段。"),
];
async function openGroup(page: Page, options: { dark?: boolean; items?: Message[] } = {}) {
	await page.route("**/files/group-a.svg", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#d4dfed"/><circle cx="16" cy="12" r="6" fill="#456789"/><path d="M5 32a11 11 0 0 1 22 0" fill="#456789"/></svg>',
		}),
	);
	const api = await isolateChat(page, { group: true, members, items: sequence(), ...options });
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.locator("[data-message-run]")).toHaveCount(5);
	await expect
		.poll(() =>
			page
				.locator('[data-page-layer="detail"]')
				.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41),
		)
		.toBeCloseTo(0, 2);
	return api;
}
async function assertRuns(page: Page) {
	const runs = page.locator("[data-message-run]");
	await expect(page.locator("[data-message-sender-name]")).toHaveText([
		a.displayName,
		b.displayName,
		a.displayName,
		self.displayName,
		assistant.displayName,
	]);
	await expect(page.locator("[data-message-sender-header]")).toHaveCount(5);
	await expect(page.locator("[data-message-sender-header] [data-bot-label]")).toHaveText("主 Bot");
	for (let index = 0; index < 5; index++) {
		const run = runs.nth(index);
		await expect(run.locator("article[data-message-id]")).toHaveCount(2);
		await expect(run.locator("[data-message-sender-header]")).toHaveCount(1);
		const geometry = await run.evaluate((element) => {
			const name = element.querySelector("[data-message-sender-name]");
			const avatar = element.querySelector("[data-message-sender-avatar]");
			const bubble = element.querySelector(".message-bubble");
			if (!name || !avatar || !bubble) throw new Error("Every run needs one name, avatar and message column");
			const n = name.getBoundingClientRect(),
				a = avatar.getBoundingClientRect(),
				b = bubble.getBoundingClientRect();
			return {
				nameTop: n.top,
				nameBottom: n.bottom,
				nameLeft: n.left,
				nameRight: n.right,
				nameWidth: n.width,
				nameAlign: getComputedStyle(name).textAlign,
				avatarTop: a.top,
				bubbleTop: b.top,
				avatarLeft: a.left,
				avatarRight: a.right,
				bubbleLeft: b.left,
				bubbleRight: b.right,
			};
		});
		expect(geometry.nameBottom).toBeLessThanOrEqual(geometry.bubbleTop);
		expect(geometry.nameTop).toBeCloseTo(geometry.avatarTop, 0);
		if (index === 1) expect(geometry.nameWidth).toBeGreaterThan(64);
		if (index === 3) {
			await expect(run.locator(".message-bubble-outgoing")).toHaveCount(2);
			expect(geometry.nameRight).toBeCloseTo(geometry.bubbleRight, 0);
			expect(geometry.nameRight).toBeLessThan(geometry.avatarLeft);
			expect(["right", "end"]).toContain(geometry.nameAlign);
		} else {
			await expect(run.locator(".message-bubble-incoming")).toHaveCount(2);
			expect(geometry.nameLeft).toBeCloseTo(geometry.bubbleLeft, 0);
			expect(geometry.avatarRight).toBeLessThan(geometry.nameLeft);
			expect(["left", "start"]).toContain(geometry.nameAlign);
		}
	}
	const image = runs.nth(0).locator("[data-message-sender-avatar] img");
	await expect(image).toHaveAttribute("src", a.avatarUrl as string);
	await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(32);
	await expect(runs.nth(1).locator("[data-avatar-fallback]")).toHaveText("周");
	await expect(runs.nth(3).locator("[data-avatar-fallback]")).toHaveText("界");
	await expect(runs.nth(4).locator("[data-avatar-fallback] svg")).toHaveCount(1);
}
async function capture(page: Page, info: TestInfo, name: string) {
	const directory = info.outputPath("round4-group-wechat");
	await mkdir(directory, { recursive: true });
	await page.screenshot({ path: `${directory}/${name}.png`, animations: "disabled" });
}

for (const dark of [false, true]) {
	test(`actual group route groups A,A,B,B,A,A,self,self,BOT,BOT on desktop ${dark ? "dark" : "light"}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width: 1280, height: 1000 });
		await openGroup(page, { dark });
		await assertRuns(page);
		await capture(page, info, `desktop-${dark ? "dark" : "light"}`);
	});
}

test.describe("actual phone group route", () => {
	test.use({
		viewport: { width: 360, height: 780 },
		userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
		isMobile: true,
		hasTouch: true,
	});
	test("360px group route contains long names above bubbles and both message directions", async ({ page }, info) => {
		await openGroup(page);
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
		await assertRuns(page);
		const geometry = await page.getByRole("log").evaluate((element) => ({
			document: document.documentElement.scrollWidth,
			viewport: innerWidth,
			log: element.getBoundingClientRect().toJSON(),
			names: [...element.querySelectorAll("[data-message-sender-name]")].map((name) => ({
				width: name.clientWidth,
				content: name.scrollWidth,
			})),
			bubbles: [...element.querySelectorAll(".message-bubble")].map((bubble) =>
				bubble.getBoundingClientRect().toJSON(),
			),
		}));
		expect(geometry.document).toBe(geometry.viewport);
		expect(geometry.names[1]?.content).toBeGreaterThan(geometry.names[1]?.width ?? 0);
		for (const bubble of geometry.bubbles) {
			expect(bubble.left).toBeGreaterThanOrEqual(geometry.log.left);
			expect(bubble.right).toBeLessThanOrEqual(geometry.log.right);
		}
		const scroll = page.getByRole("log").locator("xpath=../..");
		const title = page.locator('[data-page-layer="detail"] header').getByText("界面验收群聊", { exact: true });
		const titleGeometry = () =>
			title.evaluate((element) => {
				const ancestors = [];
				for (let current: HTMLElement | null = element as HTMLElement; current; current = current.parentElement) {
					const style = getComputedStyle(current);
					ancestors.push({
						tag: current.tagName,
						className: current.className,
						top: current.getBoundingClientRect().top,
						height: current.getBoundingClientRect().height,
						scrollTop: current.scrollTop,
						scrollHeight: current.scrollHeight,
						clientHeight: current.clientHeight,
						overflow: style.overflow,
						transform: style.transform,
					});
				}
				const viewport = document.querySelector('[role="log"]')?.closest<HTMLElement>(".overflow-y-auto");
				return {
					messageViewport: viewport
						? {
								top: viewport.getBoundingClientRect().top,
								height: viewport.clientHeight,
								scrollHeight: viewport.scrollHeight,
								scrollTop: viewport.scrollTop,
							}
						: null,
					title: element.getBoundingClientRect().toJSON(),
					header: element.closest("header")?.getBoundingClientRect().toJSON(),
					visualViewport: window.visualViewport
						? {
								offsetTop: visualViewport?.offsetTop,
								pageTop: visualViewport?.pageTop,
								height: visualViewport?.height,
								scale: visualViewport?.scale,
							}
						: null,
					pageScrollY: window.scrollY,
					ancestors,
				};
			});
		const titleStates: { stage: string; geometry: Awaited<ReturnType<typeof titleGeometry>> }[] = [];
		titleStates.push({ stage: "before-top-scroll", geometry: await titleGeometry() });
		await scroll.evaluate((element) => {
			element.scrollTop = 0;
		});
		titleStates.push({ stage: "after-top-scroll", geometry: await titleGeometry() });
		await page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		await capture(page, info, "mobile-light");
		titleStates.push({ stage: "after-top-capture", geometry: await titleGeometry() });
		await scroll.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		titleStates.push({ stage: "after-bottom-scroll", geometry: await titleGeometry() });
		await page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		await capture(page, info, "mobile-bottom");
		titleStates.push({ stage: "after-bottom-capture", geometry: await titleGeometry() });
		await info.attach("phone-title-scroll-geometry", {
			body: JSON.stringify(titleStates, null, 2),
			contentType: "application/json",
		});
		await writeFile(
			info.outputPath("round4-group-wechat/phone-title-scroll-geometry.json"),
			JSON.stringify(titleStates, null, 2),
		);
		const initial = titleStates[0]?.geometry;
		for (const { geometry } of titleStates) {
			expect(geometry.title).toEqual(initial?.title);
			expect(geometry.header).toEqual(initial?.header);
			expect(geometry.ancestors.map((ancestor) => ancestor.scrollTop)).toEqual(
				initial?.ancestors.map((ancestor) => ancestor.scrollTop),
			);
			expect(geometry.visualViewport).toEqual(initial?.visualViewport);
			expect(geometry.pageScrollY).toBe(0);
		}
		expect(titleStates.find((state) => state.stage === "after-top-capture")?.geometry.messageViewport?.scrollTop).toBe(
			0,
		);
		expect(titleStates.at(-1)?.geometry.messageViewport?.scrollTop).toBeGreaterThan(0);
	});
});

test("stream patches and same-sender appends keep one header, while a returning sender starts a new run", async ({
	page,
}) => {
	const items = sequence();
	const reply = from(assistant, 10, null, true);
	items[9] = reply;
	const api = await openGroup(page, { items });
	const runs = page.locator("[data-message-run]");
	const bubble = page.locator(`[data-message-id="${reply.id}"] .message-bubble`);
	await expect(page.locator(`[data-message-id="${reply.id}"]`)).toHaveCount(0);
	api.update({ ...reply, body: "正在整理群聊。", version: 2 });
	await expect(bubble).toHaveText("正在整理群聊。");
	await expect(page.locator("[data-message-sender-header]")).toHaveCount(5);
	api.update({ ...reply, body: "正在整理群聊。已保留连续分段。", version: 3, streaming: false });
	await expect(bubble).toHaveText("正在整理群聊。已保留连续分段。");
	api.update(from(assistant, 11, "同一 BOT 的下一条。"));
	await expect(runs.last().locator("article[data-message-id]")).toHaveCount(3);
	await expect(page.locator("[data-message-sender-header]")).toHaveCount(5);
	api.update(from(a, 12, "隔了一段后，我再次发送。"));
	await expect(runs).toHaveCount(6);
	await expect(page.locator("[data-message-sender-header]")).toHaveCount(6);
	await expect(runs.last().locator("[data-message-sender-name]")).toHaveText(a.displayName);
	await expect(runs.last().locator("article[data-message-id]")).toHaveCount(1);
});

test("direct conversations keep one avatar per sender run without group names", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 850 });
	await isolateChat(page, { members: [self, a], items: [from(a, 1, "周五见。"), from(self, 2, "好。")] });
	await page.goto(`/messages/${conversation.id}`);
	await expect(page.getByRole("log")).toBeVisible();
	await expect(page.locator("[data-message-run], [data-message-sender-avatar]")).toHaveCount(4);
	await expect(page.locator("[data-message-sender-header]")).toHaveCount(0);
	const edges = await page.getByRole("log").evaluate((log) => {
		const incoming = log.querySelector(".message-bubble-incoming"),
			outgoing = log.querySelector(".message-bubble-outgoing");
		if (!incoming || !outgoing) throw new Error("Expected both direct conversation bubbles");
		return {
			incomingColumn: incoming.closest(".message-run-messages")?.getBoundingClientRect().toJSON(),
			outgoingColumn: outgoing.closest(".message-run-messages")?.getBoundingClientRect().toJSON(),
			incoming: incoming.getBoundingClientRect().toJSON(),
			outgoing: outgoing.getBoundingClientRect().toJSON(),
		};
	});
	expect(edges.incoming.left).toBeCloseTo(edges.incomingColumn?.left ?? -1, 0);
	expect(edges.outgoing.right).toBeCloseTo(edges.outgoingColumn?.right ?? -1, 0);
});

import { expect, type Page, test } from "@playwright/test";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

test.use({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
	reducedMotion: "reduce",
});

async function simulateNativeInsets(page: Page) {
	await page.addInitScript(() => {
		const observer = new MutationObserver(() => {
			const root = document.documentElement;
			if (!root) return;
			root.dataset.nativeMobile = "true";
			root.style.setProperty("--native-safe-area-inset-top", "59px");
			root.style.setProperty("--native-safe-area-inset-bottom", "34px");
			observer.disconnect();
		});
		observer.observe(document, { childList: true, subtree: true });
	});
}

test("ordinary mobile conversations retain their top bar and dock layout", async ({ page }) => {
	await isolateChat(page, { group: true });
	await page.route("**/v1/conversations", (route) =>
		route.fulfill({ json: { items: [{ ...conversation, kind: "group", isPrimary: false }] } }),
	);
	await page.goto(`/messages/${conversation.id}`);
	const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
	await expect(frame.locator("[data-shell-topbar]").getByRole("button", { name: "聊天设置" })).toBeVisible();
	await expect(frame.locator("[data-floating-frame-header]")).toHaveCount(0);
	await expect(page.locator("html")).not.toHaveAttribute("data-native-mobile");
	await expect(frame.locator("[data-frame-header]")).toHaveCSS("position", "static");
	await expect(page.locator("[data-mobile-dock]")).toHaveCSS("position", "relative");
	expect(
		await frame.locator("[data-frame-header]").evaluate((element) => getComputedStyle(element, "::before").content),
	).toBe("none");
});

for (const kind of ["direct", "group"] as const) {
	test(`simulated native ${kind} keeps history below the opaque conversation header`, async ({ page }, info) => {
		await simulateNativeInsets(page);
		const [owner] = conversation.members;
		if (!owner) throw new Error("Expected a fixture owner");
		const members =
			kind === "direct"
				? [owner, { ...owner, memberId: "native-peer", handle: "nativepeer", displayName: "会话验收好友" }]
				: conversation.members;
		const items = Array.from({ length: 24 }, (_, index) =>
			message(`message-${String(index).padStart(2, "0")}`, `近期聊天记录 ${index}，检查消息在顶栏下方滚动。`, true),
		);
		await isolateChat(page, { items, members, group: kind === "group" });
		await page.route("**/v1/conversations", (route) =>
			route.fulfill({
				json: {
					items: [{ ...conversation, kind, members, title: "会话验收群", ownerId: person.id, isPrimary: false }],
				},
			}),
		);
		await page.goto(`/messages/${conversation.id}`);
		const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
		const header = frame.locator("[data-conversation-header]");
		const scroll = frame.locator("[data-conversation-scroll]");
		await expect(header.getByRole("button", { name: "聊天设置", exact: true })).toBeVisible();
		await expect(header.getByRole("button", { name: "返回", exact: true })).toBeVisible();
		await expect(scroll.getByRole("log")).toBeVisible();
		await scroll.evaluate((element) => {
			element.scrollTop = element.scrollHeight / 2;
		});
		await page.screenshot({ path: info.outputPath(`native-simulated-${kind}-scrolled.png`), animations: "disabled" });
		const [headerBox, scrollBox] = await Promise.all([header.boundingBox(), scroll.boundingBox()]);
		if (!headerBox || !scrollBox) throw new Error("Expected an ordinary header and message scroller");
		expect(scrollBox.y).toBeCloseTo(headerBox.y + headerBox.height, 0);
		await expect(header.locator("[data-shell-topbar]")).toHaveCSS("padding-top", "59px");
		expect(await header.evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
		await expect(scroll).toHaveCSS("padding-top", "0px");
	});
}

const preview = [
	"请把今天的会议待办整理成一份简短的清单。",
	"我会先核对讨论中的决定和时间，再按负责人归类。",
	"也请注明哪些内容已经确认，哪些还需要跟进。",
	"收到。上线前确认移动端的导航和滚动体验，发布说明等复核后更新。",
	"发布前先把图和验证记录放到同一份评审里。",
	"我会在清单里附上评审位置。",
];

for (const native of [false, true]) {
	test(`primary Bot keeps the edge fade and local controls compact on ${native ? "simulated native" : "mobile web"}`, async ({
		page,
	}, info) => {
		// The native runtime is covered separately on each platform. This fixture exercises the shared layout.
		const safeTop = native ? 59 : 0;
		if (native) await simulateNativeInsets(page);
		const items = Array.from({ length: 32 }, (_, index) =>
			message(
				`message-${String(index).padStart(2, "0")}`,
				preview[index] ?? `后续进展 ${index}。具体事项和负责人已补入记录。`,
				index % 2 === 0,
			),
		);
		await isolateChat(page, {
			dark: native,
			items,
		});
		await page.goto("/messages/main");
		const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
		const header = frame.locator("[data-floating-frame-header]");
		const scroll = frame.locator("[data-frame-scroll]");
		await expect(frame.locator("[data-shell-topbar]")).toHaveCount(0);
		await expect(page.locator("html")).toHaveAttribute("data-theme", native ? "dark" : "light");
		await expect(header).toHaveCSS("position", "absolute");
		await expect(page.locator("[data-mobile-dock]")).toHaveCSS("position", native ? "absolute" : "relative");
		const avatarButton = header.getByRole("button", { name: "Bot 设置" });
		const avatar = header.locator("[data-chat-agent-avatar]");
		const account = header.getByRole("button", { name: "我", exact: true });
		const name = header.locator("[data-chat-agent-name]");
		const caption = name.getByText(bot.displayName);
		await expect(avatarButton).toBeVisible();
		await expect(account).toBeVisible();
		await expect(caption).toHaveCSS("white-space", "nowrap");
		await expect(name).toHaveCSS("padding-block", "2px");
		const [headerBox, avatarBox, accountBox, captionBox] = await Promise.all([
			header.boundingBox(),
			avatar.boundingBox(),
			account.boundingBox(),
			caption.boundingBox(),
		]);
		if (!headerBox || !avatarBox || !accountBox || !captionBox)
			throw new Error("Expected a measured header and its controls");
		expect(headerBox.height).toBeLessThan(safeTop + 104);
		expect(avatarBox.y - headerBox.y).toBeCloseTo(native ? safeTop : 4, 0);
		expect(accountBox.y - headerBox.y).toBeCloseTo(native ? safeTop : 4, 0);
		expect(avatarBox.width).toBeCloseTo(avatarBox.height, 0);
		// The account avatar is the same control as on the other tab roots, not a glass chip.
		expect(accountBox.width).toBeGreaterThanOrEqual(accountBox.height - 1);
		for (const control of [avatar, name]) {
			await expect(control).toHaveCSS("border-radius", "9999px");
			await expect(control).toHaveCSS("backdrop-filter", "none");
			await expect(control).toHaveCSS("box-shadow", /rgba?\(/);
			expect(await control.evaluate((element) => getComputedStyle(element, "::before").backdropFilter)).toBe("none");
		}
		await expect(avatarButton.locator("[data-avatar-fallback]")).toHaveCSS("border-radius", "9999px");
		await expect
			.poll(() => scroll.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop)))
			.toBeCloseTo(headerBox.height, 0);
		const blur = await header.evaluate((element) => {
			const style = getComputedStyle(element, "::before");
			return {
				blur: style.backdropFilter,
				mask: style.maskImage,
				height: Number.parseFloat(style.height),
				width: Number.parseFloat(style.width),
				pointerEvents: style.pointerEvents,
			};
		});
		expect(blur.blur).toBe("blur(24px)");
		expect(blur.mask).toContain("linear-gradient");
		expect(blur.height).toBeGreaterThan(0);
		expect(headerBox.y + blur.height).toBeCloseTo(avatarBox.y, 0);
		expect(blur.width).toBeCloseTo(headerBox.width, 0);
		expect(blur.pointerEvents).toBe("none");
		const first = scroll.locator(".message-bubble").first();
		await expect(first).toBeAttached();
		await scroll.evaluate((element) => {
			element.scrollTop = 0;
		});
		const [firstBox, firstHistoryBox] = await Promise.all([
			first.boundingBox(),
			scroll.getByRole("log").locator(":scope > :first-child").boundingBox(),
		]);
		if (!firstBox || !firstHistoryBox) throw new Error("Expected the first message and history row");
		const gap = firstHistoryBox.y - captionBox.y - captionBox.height;
		expect(gap).toBeGreaterThanOrEqual(0);
		expect(gap).toBeLessThanOrEqual(12);
		const shot = native ? "native-simulated" : "mobile-web";
		await page.screenshot({ path: info.outputPath(`${shot}-start.png`), animations: "disabled" });
		await scroll.evaluate(
			(element, offset) => {
				element.dispatchEvent(new WheelEvent("wheel"));
				element.scrollTop = offset;
			},
			firstBox.y - avatarBox.y + 8,
		);
		const under = await first.evaluate((element) => {
			const box = element.getBoundingClientRect();
			return {
				top: box.top,
				bottom: box.bottom,
				// Sample between the centered avatar and the new trailing settings control.
				hit: element.contains(document.elementFromPoint(box.right - 56, box.top + 10)),
			};
		});
		expect(under.top).toBeLessThan(headerBox.y + blur.height);
		expect(under.bottom).toBeGreaterThan(avatarBox.y);
		expect(under.hit).toBe(true);
		const jump = page.getByRole("button", { name: "跳至最新", exact: true });
		await expect(jump).toBeVisible();
		await expect(jump).toHaveCSS("border-radius", "9999px");
		await expect(jump).toHaveCSS("background-color", await name.evaluate((el) => getComputedStyle(el).backgroundColor));
		await expect(jump).toHaveCSS("box-shadow", await name.evaluate((el) => getComputedStyle(el).boxShadow));
		await page.screenshot({ path: info.outputPath(`${shot}-scrolled.png`), animations: "disabled" });
		await account.click({ trial: true });
		await avatar.click({ trial: true });
		await jump.click();
		await expect(jump).toHaveCount(0);
		const last = scroll.getByText(items.at(-1)?.body ?? "", { exact: true });
		const lastBox = await last.boundingBox();
		const dockBox = await page.locator("[data-mobile-dock]").boundingBox();
		expect(lastBox && dockBox && lastBox.y + lastBox.height <= dockBox.y).toBe(true);
		if (!native) {
			await page.setViewportSize({ width: 320, height: 568 });
			await expect(account).toBeInViewport();
			await expect(avatarButton).toBeInViewport();
			await expect(name).toBeInViewport();
			await expect(name).toHaveCSS("border-radius", "9999px");
			await page.screenshot({ path: info.outputPath("mobile-web-narrow.png"), animations: "disabled" });
			return;
		}
		await page.setViewportSize({ width: 844, height: 390 });
		const landscapeComposer = page.locator("[data-native-composer]");
		await expect(landscapeComposer).toBeVisible();
		await expect(landscapeComposer).toHaveCSS("position", "absolute");
		await expect(page.locator('[data-page-layer="detail"]')).toHaveCSS("padding-top", "0px");
		await expect(page.locator('[data-page-layer="detail"] > main')).toHaveCSS("border-top-left-radius", "0px");
		expect((await scroll.boundingBox())?.y).toBe(0);
		await scroll.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		const landscapeLast = await last.boundingBox();
		const landscapeDock = await landscapeComposer.boundingBox();
		expect(landscapeLast && landscapeDock && landscapeLast.y + landscapeLast.height <= landscapeDock.y).toBe(true);
	});
}

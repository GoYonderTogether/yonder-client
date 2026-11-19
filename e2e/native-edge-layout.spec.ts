import { expect, test } from "@playwright/test";
import { bot, conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)",
	reducedMotion: "reduce",
});

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
		if (native)
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
		const items = Array.from({ length: 32 }, (_, index) =>
			message(
				`message-${String(index).padStart(2, "0")}`,
				preview[index] ?? `后续进展 ${index}。具体事项和负责人已补入记录。`,
				index % 2 === 0,
			),
		);
		await isolateChat(page, {
			items,
		});
		await page.goto("/messages/main");
		const frame = page.locator('[data-page-layer="detail"] [data-shell-frame]');
		const header = frame.locator("[data-floating-frame-header]");
		const scroll = frame.locator("[data-frame-scroll]");
		await expect(frame.locator("[data-shell-topbar]")).toHaveCount(0);
		await expect(header).toHaveCSS("position", "absolute");
		await expect(page.locator("[data-mobile-dock]")).toHaveCSS("position", native ? "absolute" : "relative");
		const avatarButton = header.getByRole("button", { name: "Bot 设置" });
		const gear = header.getByRole("button", { name: "设置", exact: true });
		const name = header.locator("[data-chat-agent-name]");
		const caption = name.getByText(bot.displayName);
		await expect(avatarButton).toBeVisible();
		await expect(gear).toBeVisible();
		await expect(caption).toHaveCSS("white-space", "nowrap");
		const [headerBox, avatarBox, gearBox, captionBox] = await Promise.all([
			header.boundingBox(),
			avatarButton.boundingBox(),
			gear.boundingBox(),
			caption.boundingBox(),
		]);
		if (!headerBox || !avatarBox || !gearBox || !captionBox)
			throw new Error("Expected a measured header and its controls");
		expect(headerBox.height).toBeLessThan(safeTop + 104);
		expect(avatarBox.y - headerBox.y).toBeCloseTo(native ? safeTop : 4, 0);
		expect(gearBox.y - headerBox.y).toBeCloseTo(native ? safeTop : 4, 0);
		expect(avatarBox.width).toBeCloseTo(avatarBox.height, 0);
		expect(gearBox.width).toBeCloseTo(gearBox.height, 0);
		const gearStyle = await gear.evaluate((element) => {
			const style = getComputedStyle(element);
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 1;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Canvas unavailable");
			context.fillStyle = style.backgroundColor;
			context.fillRect(0, 0, 1, 1);
			return {
				radius: style.borderTopLeftRadius,
				border: Number.parseFloat(style.borderTopWidth),
				alpha: context.getImageData(0, 0, 1, 1).data[3],
				blur: style.backdropFilter,
			};
		});
		expect(gearStyle.border).toBeGreaterThan(0);
		expect(Number.parseFloat(gearStyle.radius)).toBeGreaterThanOrEqual(
			gearStyle.radius.endsWith("%") ? 50 : gearBox.width / 2,
		);
		expect(gearStyle.alpha).toBeGreaterThan(0);
		expect(gearStyle.alpha).toBeLessThan(255);
		expect(gearStyle.blur).toContain("blur(");
		const localBackdrop = await Promise.all(
			[avatarButton, name].map((locator) =>
				locator.evaluate((element) => {
					const style = getComputedStyle(element, "::before");
					return { blur: style.backdropFilter, width: Number.parseFloat(style.width), hit: style.pointerEvents };
				}),
			),
		);
		for (const glass of localBackdrop) {
			expect(glass.blur).toContain("blur(");
			expect(glass.width).toBeGreaterThan(0);
			expect(glass.width).toBeLessThan(headerBox.width / 2);
			expect(glass.hit).toBe("none");
		}
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
		expect(blur.height).toBeCloseTo(Math.max(16, safeTop) + 8, 0);
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
				element.scrollTop = offset;
			},
			firstBox.y - avatarBox.y + 8,
		);
		const under = await first.evaluate((element) => {
			const box = element.getBoundingClientRect();
			return {
				top: box.top,
				bottom: box.bottom,
				hit: element.contains(document.elementFromPoint(box.right - 8, box.top + 10)),
			};
		});
		expect(under.top).toBeLessThan(headerBox.y + blur.height);
		expect(under.bottom).toBeGreaterThan(avatarBox.y);
		expect(under.hit).toBe(true);
		await page.screenshot({ path: info.outputPath(`${shot}-scrolled.png`), animations: "disabled" });
		await gear.click({ trial: true });
		await avatarButton.click({ trial: true });
		await scroll.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		const last = scroll.getByText(items.at(-1)?.body ?? "", { exact: true });
		const lastBox = await last.boundingBox();
		const dockBox = await page.locator("[data-mobile-dock]").boundingBox();
		expect(lastBox && dockBox && lastBox.y + lastBox.height <= dockBox.y).toBe(true);
		if (!native) return;
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

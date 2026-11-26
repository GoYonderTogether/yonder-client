import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { bot, isolateChat, person } from "./chat-fixture.ts";

const previewDir = process.env.YONDER_PREVIEW_DIR ?? "test-results/social-memory";

test.use({
	viewport: { width: 390, height: 844 },
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});

test("mobile add contacts shows scan, invitation and a decodable branded personal QR", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await isolateChat(page);
	await page.goto("/messages");
	await page.getByRole("button", { name: "发起聊天" }).click();
	await page.getByRole("menuitem", { name: "添加好友" }).click();
	const dialog = page.getByRole("dialog", { name: "添加好友" });
	await expect(dialog.getByRole("searchbox", { name: "搜索 ID 或手机号" })).toBeVisible();
	await expect(dialog.getByRole("button", { name: /扫一扫/ })).toBeVisible();
	await expect(dialog.getByRole("button", { name: /邀请好友/ })).toBeVisible();
	await expect(dialog.getByRole("button", { name: "返回", exact: true })).toBeVisible();
	const qr = dialog.getByRole("img", { name: "我的二维码" });
	await expect(qr).toBeVisible();
	await page.screenshot({ path: `${previewDir}/friends-mobile.png`, animations: "disabled" });
	const decoded = await decodeQr(page, await qr.screenshot());
	// The full card address, so a phone camera or WeChat opens it as well as Yonder's own scanner.
	expect(decoded).toMatch(/\/@chatcheck$/);
	await dialog.getByRole("button", { name: /扫一扫/ }).click();
	await expect(page.locator("button").filter({ hasText: "从图片识别" })).toBeVisible();
});

async function decodeQr(page: Page, png: Buffer) {
	await page.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
	return page.evaluate(async (encoded) => {
		const image = new Image();
		image.src = `data:image/png;base64,${encoded}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas unavailable");
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
		return (
			window as typeof window & {
				jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
			}
		).jsQR(pixels.data, pixels.width, pixels.height)?.data;
	}, png.toString("base64"));
}

test("mobile friend search sends a pending request and clearing search restores the contact card", async ({ page }) => {
	await isolateChat(page);
	const friend = { ...person, id: "friend-person", handle: "friendcheck", displayName: "待添加好友" };
	await page.route("**/v1/contacts/search?*", (route) => route.fulfill({ json: { items: [friend] } }));
	let directAddCalls = 0;
	await page.route("**/v1/contacts", (route) => {
		if (route.request().method() === "POST") directAddCalls++;
		return route.fulfill({ json: { items: [] } });
	});
	await page.route("**/v1/friend-requests", (route) =>
		route.fulfill({
			json: {
				request: {
					id: "isolated-friend-request",
					sender: person,
					recipient: friend,
					status: "pending",
					createdAt: "2026-11-18T00:00:00Z",
					acceptedAt: null,
					version: 1,
				},
			},
		}),
	);
	await page.goto("/contacts/add");
	const search = page.getByRole("searchbox", { name: "搜索 ID 或手机号" });
	await search.fill("@friendcheck");
	await search.press("Enter");
	await expect(page.getByText("@friendcheck", { exact: true })).toBeVisible();
	const requestSent = page.waitForRequest(
		(request) => new URL(request.url()).pathname === "/v1/friend-requests" && request.method() === "POST",
	);
	await page.getByRole("button", { name: "添加", exact: true }).click();
	expect((await requestSent).postDataJSON()).toEqual({ memberId: friend.id });
	await expect(page.getByRole("status").filter({ hasText: "已发送申请" })).toBeVisible();
	await expect(page.getByRole("button", { name: "发消息", exact: true })).toHaveCount(0);
	expect(directAddCalls).toBe(0);
	await search.fill("");
	await expect(page.getByRole("img", { name: "我的二维码" })).toBeVisible();
});

test("invitation rules, share card and downloaded PNG retain the real invitation QR", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await isolateChat(page);
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, displayName: "zoran" },
				bot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	const link = "https://yonder.zethai.cn/i/isolated-invite";
	await page.route("**/v1/invite", (route) =>
		route.fulfill({
			json: {
				code: "isolated-invite",
				link,
				stats: { invitedCount: 3, grantedTotal: 150 },
				rewardRule: { newUserGets: 100, inviterGets: 50, maxInvites: null },
			},
		}),
	);
	await page.goto("/me/invite");
	await expect(page.getByRole("button", { name: "立即分享" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/invite-mobile.png`, animations: "disabled" });
	await page.getByRole("button", { name: "规则", exact: true }).click();
	const rules = page.getByRole("dialog", { name: "规则", exact: true });
	await expect(rules.getByText("isolated-invite", { exact: true })).toBeVisible();
	await rules.getByRole("button", { name: "关闭", exact: true }).click();
	await page.getByRole("button", { name: "立即分享" }).click();
	const card = page.getByRole("dialog", { name: "邀请卡", exact: true });
	await expect(card.getByRole("img", { name: "邀请卡", exact: true })).toBeVisible();
	await expect(card.getByText("生活琐事，", { exact: true })).toBeVisible();
	await expect(card.getByText("交给 Yonder。", { exact: true })).toBeVisible();
	await expect(card.getByText("把时间留给真正重要的事。", { exact: true })).toBeVisible();
	await expect(card.getByText("从日程、待办和零散信息开始。", { exact: true })).toBeVisible();
	await expectPosterTextInside(card.getByRole("img", { name: "邀请卡", exact: true }));
	await page.screenshot({ path: `${previewDir}/invite-share-mobile.png`, animations: "disabled" });
	const downloadPromise = page.waitForEvent("download");
	await card.getByRole("button", { name: "保存图片" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe("yonder-invitation.png");
	const posterPath = `${previewDir}/yonder-invitation.png`;
	await download.saveAs(posterPath);
	expect(await decodeQr(page, await readFile(posterPath))).toBe(link);
	await card.getByRole("button", { name: "关闭", exact: true }).click();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: `${previewDir}/invite-desktop.png`, animations: "disabled" });
});

// The memory page is mid-rewrite in the timeline session: the controls this spec drives no longer
// exist. Re-enable as part of that work; do not delete the spec.
test.skip("memory cards switch, expand, edit with taps and navigate year month week day", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await isolateChat(page);
	await page.goto("/memory");
	await expect(page.getByRole("img", { name: "扫码添加我" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/memory-mobile.png`, animations: "disabled" });
	await page.getByRole("button", { name: "查看AI 眼中的我", exact: true }).click();
	await expect(page.getByRole("heading", { name: "正在慢慢认识你" })).toBeVisible();
	await page.getByRole("button", { name: "展开两张卡片" }).click();
	await expect(page.getByRole("button", { name: "收起卡片" })).toHaveAttribute("aria-expanded", "true");
	await page.getByRole("button", { name: "编辑名片" }).click();
	const editor = page.getByRole("dialog", { name: "选择名片展示内容" });
	await editor.getByRole("checkbox", { name: "显示头像", exact: true }).uncheck();
	await editor.getByRole("button", { name: "旅行", exact: true }).click();
	await editor.getByRole("button", { name: "完成", exact: true }).click();
	await expect(editor).not.toBeVisible();
	await expect(page.getByText("旅行", { exact: true })).toBeVisible();
	const timeline = page.getByRole("region", { name: "我的时间轴", exact: true });
	for (const scale of ["年", "月", "周", "日"]) {
		await timeline.getByRole("radio", { name: scale, exact: true }).click();
		await expect(timeline.getByRole("radio", { name: scale, exact: true })).toBeChecked();
	}
	await timeline.getByLabel("选择日期", { exact: true }).fill("2026-11-15");
	await expect(timeline.getByLabel("选择日期", { exact: true })).toHaveValue("2026-11-15");
	await timeline.getByRole("button", { name: "上一时段" }).click();
	await expect(timeline.getByLabel("选择日期", { exact: true })).toHaveValue("2026-11-14");
	await timeline.getByRole("button", { name: "今天", exact: true }).click();
	await page.screenshot({ path: `${previewDir}/memory-expanded-mobile.png`, animations: "disabled" });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: `${previewDir}/memory-desktop.png`, animations: "disabled" });
});

test("invitation share actions remain opaque with English copy, a long name and dark mode", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await isolateChat(page, { dark: true });
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, displayName: "zoran · A very long invitation name for layout verification" },
				bot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "en", theme: "dark" },
			},
		}),
	);
	await page.route("**/v1/invite", (route) =>
		route.fulfill({
			json: {
				code: "isolated-invite",
				link: "https://yonder.zethai.cn/i/isolated-invite",
				stats: { invitedCount: 3, grantedTotal: 150 },
				rewardRule: { newUserGets: 100, inviterGets: 50, maxInvites: null },
			},
		}),
	);
	await page.goto("/me/invite");
	await expect(page.getByRole("button", { name: "Share now" })).toBeVisible();
	await expect(page.getByText(/We're building a personal AI/)).toBeVisible();
	await page.screenshot({ path: `${previewDir}/invite-en-mobile-dark.png`, animations: "disabled" });
	await page.getByRole("button", { name: "Share now" }).click();
	const card = page.getByRole("dialog", { name: "Invitation card", exact: true });
	const poster = card.getByRole("img", { name: "Invitation card", exact: true });
	await expect(card.getByText("Life's little tasks,", { exact: true })).toBeVisible();
	await expect(card.getByText("leave them to Yonder.", { exact: true })).toBeVisible();
	await expectPosterTextInside(poster);
	await page.screenshot({ path: `${previewDir}/invite-share-en-mobile-dark.png`, animations: "disabled" });
	const colors = await card.locator("button").evaluateAll((buttons) =>
		buttons.map((button) => {
			const style = getComputedStyle(button);
			return { label: button.textContent?.trim(), background: style.backgroundColor, color: style.color };
		}),
	);
	for (const color of colors) expect(color.background).toMatch(/^rgb\([^)]*\)$/);
	await writeFile(`${previewDir}/invite-share-action-colors.json`, JSON.stringify(colors, null, 2));
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: `${previewDir}/invite-share-en-desktop-dark.png`, animations: "disabled" });
	await page.evaluate(() => {
		document.documentElement.dataset.theme = "light";
	});
	await expectPosterTextInside(poster);
	await page.screenshot({ path: `${previewDir}/invite-share-en-desktop-light.png`, animations: "disabled" });
	await card.getByRole("button", { name: "Close", exact: true }).click();
	await expect(card).not.toBeVisible();
});

async function expectPosterTextInside(poster: Locator) {
	const bounds = await poster.locator("text").evaluateAll((texts) =>
		texts.map((text) => {
			const box = (text as SVGGraphicsElement).getBBox();
			return { text: text.textContent, x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
		}),
	);
	for (const box of bounds) {
		expect(box.x, box.text ?? "").toBeGreaterThanOrEqual(0);
		expect(box.right, box.text ?? "").toBeLessThanOrEqual(600);
		expect(box.y, box.text ?? "").toBeGreaterThanOrEqual(0);
		expect(box.bottom, box.text ?? "").toBeLessThanOrEqual(800);
	}
}

import { mkdir, readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { bot, conversation, isolateChat, message, person } from "./chat-fixture.ts";

const previewDir = process.env.YONDER_PREVIEW_DIR ?? "test-results/social-memory";

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

async function setup(page: Page) {
	await isolateChat(page);
	await page.route("**/v1/me", (route) =>
		route.fulfill({
			json: {
				member: { ...person, bio: "做个人 AI 网络，找我聊合作和内测。" },
				bot,
				hasPassword: true,
				signInMethods: [],
				settings: { locale: "zh-CN", theme: "light" },
			},
		}),
	);
	await page.route("**/v1/invite", (route) =>
		route.fulfill({
			json: {
				code: "isolated-invite",
				link: "https://yonder.zethai.cn/i/isolated-invite",
				stats: { invitedCount: 0, grantedTotal: 0 },
				rewardRule: { newUserGets: 100, inviterGets: 50, maxInvites: null },
			},
		}),
	);
	await page.route("**/v1/memory/**", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
}

test("the card in 了解 saves a PNG whose QR opens the owner's /@handle with their invite code", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await setup(page);
	await page.goto("/memory/about");
	const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "我的名片" }) });
	await expect(section.getByRole("img", { name: "我的名片二维码" }).first()).toBeVisible();
	await expect(section.getByRole("button", { name: "谁可以看到" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/memory-card-mobile.png`, animations: "disabled", fullPage: true });
	const downloadPromise = page.waitForEvent("download");
	await section.getByRole("button", { name: "保存图片" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(`yonder-${person.handle}.png`);
	const path = `${previewDir}/memory-card.png`;
	await download.saveAs(path);
	const decoded = await decodeQr(page, await readFile(path));
	expect(decoded).toMatch(new RegExp(`/@${person.handle}\\?i=isolated-invite$`));
	await expect(section.getByRole("status")).toHaveText("图片已保存");
	await section.getByRole("button", { name: "谁可以看到" }).click();
	await expect(page).toHaveURL(/\/me\/privacy$/);
});

test("the card sits above what the Bot knows on a wide window", async ({ page }) => {
	await mkdir(previewDir, { recursive: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await setup(page);
	await page.goto("/memory/about");
	await expect(page.getByRole("heading", { name: "我的名片" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/memory-card-desktop.png`, animations: "disabled" });
});

test("a group sender's avatar opens their card in the side panel", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	const stranger = {
		memberId: "group-stranger",
		kind: "person" as const,
		handle: "stranger1",
		displayName: "群里的陌生人",
		avatarUrl: null,
	};
	const self = conversation.members.find((member) => member.memberId === person.id);
	await isolateChat(page, {
		group: true,
		members: [...(self ? [self] : []), stranger],
		items: [{ ...message("group-01", "大家好"), senderId: stranger.memberId, senderKind: "person" }],
	});
	await page.route("**/v1/members/stranger1", (route) =>
		route.fulfill({
			json: {
				card: {
					kind: "person",
					handle: "stranger1",
					displayName: "群里的陌生人",
					avatarUrl: null,
					bio: null,
					owner: null,
				},
				relation: "none",
				memberId: "group-stranger",
				conversationId: null,
				bots: [{ handle: "strangerbot", displayName: "TA 的接待 Bot", avatarUrl: null, reception: true }],
			},
		}),
	);
	await page.goto(`/messages/${conversation.id}`);
	await page.getByRole("button", { name: "打开 群里的陌生人 的资料" }).click();
	const panel = page.getByRole("complementary").or(page.getByRole("dialog")).filter({ hasText: "@stranger1" });
	await expect(panel.getByRole("button", { name: "加为联系人" })).toBeVisible();
	await expect(panel.getByRole("heading", { name: "TA 的 Bot" })).toBeVisible();
	await page.screenshot({ path: `${previewDir}/group-avatar-card-desktop.png`, animations: "disabled" });
});

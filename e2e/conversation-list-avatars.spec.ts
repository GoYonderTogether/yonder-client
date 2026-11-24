import { expect, test } from "@playwright/test";
import type { Conversation } from "@yonder/protocol";
import { conversation, isolateChat, person } from "./chat-fixture.ts";

const system = {
	...conversation,
	id: "notifications",
	isPrimary: false,
	kind: "system",
	members: [],
	unreadCount: 2,
} satisfies Conversation;
const group = {
	...conversation,
	id: "group",
	isPrimary: false,
	pinned: false,
	kind: "group",
	title: "设计小组",
} satisfies Conversation;
const emptyGroup = { ...group, id: "empty-group", title: "空成员列表", members: [] } satisfies Conversation;
const direct = {
	...group,
	id: "direct",
	kind: "direct",
	title: "林晓",
	members: [
		...conversation.members.filter((member) => member.memberId === person.id),
		{ memberId: "friend", displayName: "林晓", kind: "person", handle: "friend", avatarUrl: null },
	],
} satisfies Conversation;

for (const phone of [false, true]) {
	test(`system, group and direct rows share an avatar slot on ${phone ? "phone" : "desktop"}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width: phone ? 390 : 1440, height: 844 });
		if (phone)
			await page.addInitScript(() => {
				Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Linux; Android 14) Mobile" });
			});
		await isolateChat(page, { items: [] });
		await page.route("**/v1/conversations", (route) =>
			route.fulfill({ json: { items: [conversation, system, group, direct, emptyGroup] } }),
		);
		await page.goto("/messages");
		const list = page.getByRole("list", { name: "消息", exact: true });
		const systemRow = list.getByRole("button", { name: /系统通知/ });
		await expect(systemRow).toBeVisible();
		await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", phone ? "mobile" : "wide");
		const bounds = await Promise.all(
			["系统通知", "设计小组", "林晓", "空成员列表"].map(async (title) => {
				const row = list.getByRole("button", { name: new RegExp(title) });
				const slot = row.locator("[data-conversation-avatar-slot]");
				await expect(slot).toBeVisible();
				await expect(slot).toHaveAttribute("aria-hidden", "true");
				const [avatar, label] = await Promise.all([
					slot.boundingBox(),
					row.getByText(title, { exact: true }).boundingBox(),
				]);
				if (!avatar || !label) throw new Error(`Expected an avatar and title for ${title}`);
				return { x: avatar.x, width: avatar.width, height: avatar.height, titleX: label.x };
			}),
		);
		expect(bounds[0]).toMatchObject({ width: 40, height: 40 });
		expect(bounds).toEqual(Array.from({ length: bounds.length }, () => bounds[0]));
		await page.screenshot({
			path: info.outputPath(phone ? "mobile-conversation-avatar-slots.png" : "desktop-conversation-avatar-slots.png"),
			animations: "disabled",
		});
		await systemRow.click();
		await expect(page).toHaveURL(/\/messages\/notifications$/);
		await expect(page.locator('[data-page-layer="detail"]').getByText("系统通知", { exact: true })).toBeVisible();
		await expect(page.locator("textarea")).toHaveCount(0);
	});
}

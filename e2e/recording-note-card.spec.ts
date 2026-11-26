import { devices, expect, test } from "@playwright/test";
import type { Message } from "@yonder/protocol";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
const fixtures: [string, string | null, number | undefined, string][] = [
	["短录音", "2027-01-01T05:05:00Z", 59999, "今天 · 59秒"],
	["分钟边界", "2027-01-01T04:55:00Z", 60000, "昨天 · 1分"],
	[
		"项目同步复盘：本周需要确认的新版登录流程、动效验收和手机端回归用例",
		"2026-12-20T11:00:00Z",
		3599999,
		"2026年12月20日 · 59分",
	],
	["一小时标题", "2026-12-18T11:00:00Z", 4128999, "2026年12月18日 · 1小时8分"],
	["零秒标题", "2026-12-17T11:00:00Z", 0, "2026年12月17日 · 0秒"],
	["未知时长标题", "2026-12-16T11:00:00Z", undefined, "2026年12月16日"],
];

function meetingMessage(index: number, title: string, date: string | null, durationMs: number | undefined): Message {
	const startedAt = date ? Date.parse(date) : undefined;
	return {
		...message(`recording-0${index + 1}`, ""),
		meeting: {
			id: `meeting-${index}`,
			title,
			...(startedAt === undefined ? {} : { startedAt, endedAt: startedAt + (durationMs ?? 0) }),
			...(durationMs === undefined ? {} : { durationMs }),
			photoCount: 4,
		},
	};
}

for (const mobile of [false, true]) {
	test.describe(mobile ? "phone" : "desktop", () => {
		test.use({
			...(mobile ? { ...iphone, viewport: { width: 320, height: 780 } } : { viewport: { width: 1180, height: 820 } }),
			timezoneId: "America/New_York",
		});

		test("history cards show the recording title and compact local date and duration", async ({ page }, info) => {
			const items = fixtures.map(([title, date, duration], index) => meetingMessage(index, title, date, duration));
			await isolateChat(page, { items });
			await page.route("**/v1/conversations", (route) =>
				route.fulfill({
					json: {
						items: [
							{
								...conversation,
								...(mobile ? { id: "recording-preview-chat", kind: "group", isPrimary: false, title: "录音群聊" } : {}),
								lastMessage: {
									body: "实际录音报告正文",
									senderKind: "bot",
									createdAt: items[0]?.createdAt,
									recordingNote: true,
								},
							},
							...(mobile ? [conversation] : []),
						],
					},
				}),
			);
			await page.clock.setFixedTime(new Date("2027-01-01T05:10:00Z"));
			await page.goto("/messages/main");
			for (const [title, , , label] of fixtures) {
				const card = page.getByRole("button", { name: `查看录音笔记 · ${title}` });
				await expect(card.getByText(title, { exact: true })).toBeVisible();
				await expect(card.getByText(label, { exact: true })).toBeVisible();
				await expect(card).toHaveAccessibleDescription(label);
				expect(await card.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
					(await card.evaluate((node) => node.clientWidth)) + 2,
				);
				await expect(card.locator("svg[stroke-linecap=round] path").first()).toHaveAttribute(
					"d",
					"M4 10v4 M7.2 6.5v11 M10.4 2.5v19 M13.6 7.5v9 M16.8 4.5v15 M20 9v6",
				);
			}
			await page.screenshot({ path: info.outputPath("recording-history.png"), animations: "disabled", scale: "css" });

			await page.getByRole("button", { name: "添加附件" }).click();
			const entry = page.getByRole("button", { name: "录音笔记", exact: true });
			await expect(entry.locator("svg path")).toHaveAttribute("d", /^M4 10v4/);
			await page.screenshot({ path: info.outputPath("recording-entry.png"), animations: "disabled", scale: "css" });

			await page.goto("/messages");
			await expect(page.getByText("[录音笔记]", { exact: true })).toBeVisible();
			await expect(page.getByText("实际录音报告正文")).toHaveCount(0);
			await page.screenshot({ path: info.outputPath("recording-preview.png"), animations: "disabled", scale: "css" });
		});
	});
}

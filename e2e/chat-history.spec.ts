import { devices, expect, test } from "@playwright/test";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

for (const phone of [false, true]) {
	test(`${phone ? "phone" : "desktop"} chat loads older pages at the top and preserves the reading position`, async ({
		browser,
	}, info) => {
		const page = await browser.newPage(phone ? devices["iPhone 13"] : { viewport: { width: 1100, height: 700 } });
		const history = Array.from({ length: 45 }, (_, index) => {
			const number = String(index).padStart(2, "0");
			return message(`message-${number}`, `历史消息 ${number}`, index % 2 === 0);
		});
		const api = await isolateChat(page);
		const requests: string[] = [];
		let releasePage: () => void = () => {};
		const waitForRelease = new Promise<void>((resolve) => {
			releasePage = resolve;
		});
		await page.route(`**/v1/conversations/${conversation.id}/messages?*`, async (route) => {
			const cursor = new URL(route.request().url()).searchParams.get("cursor");
			if (cursor) requests.push(cursor);
			if (cursor === "middle") await waitForRelease;
			if (cursor === "oldest" && requests.filter((value) => value === "oldest").length === 1) {
				await route.fulfill({ status: 500, json: { error: { code: "internal", message: "temporary failure" } } });
				return;
			}
			const items =
				cursor === "oldest" ? history.slice(0, 15) : cursor === "middle" ? history.slice(15, 30) : history.slice(30);
			const nextCursor = cursor === "oldest" ? null : cursor === "middle" ? "oldest" : "middle";
			await route.fulfill({ json: { items, nextCursor, hasMore: nextCursor !== null } });
		});
		try {
			await page.goto(`/messages/${conversation.id}`);
			const log = page.getByRole("log");
			const scroll = log.locator("xpath=../..");
			await expect(log.getByText("历史消息 44")).toBeInViewport();
			expect(requests).toEqual([]);
			const first = log.getByText("历史消息 30");
			await scroll.evaluate((element) => {
				element.scrollTop = 0;
			});
			const loading = log.getByRole("status", { name: "正在加载更早的消息…" });
			await expect(loading).toBeVisible();
			await scroll.dispatchEvent("scroll");
			await scroll.dispatchEvent("scroll");
			expect(requests).toEqual(["middle"]);
			const before = await first.boundingBox();
			await page.screenshot({ path: info.outputPath("loading-earlier.png"), animations: "disabled" });
			api.create(message("message-45", "翻页时收到的新消息"));
			await expect(log.getByText("翻页时收到的新消息")).toBeAttached();
			releasePage();
			await expect(log.getByText("历史消息 15")).toBeAttached();
			await expect(first).toBeInViewport();
			expect((await first.boundingBox())?.y).toBeCloseTo(before?.y ?? 0, 0);
			await scroll.evaluate((element) => {
				element.scrollTop = 0;
			});
			const retry = log.getByRole("button", { name: "重试加载更早的消息" });
			await expect(retry).toBeVisible();
			await scroll.dispatchEvent("scroll");
			expect(requests).toEqual(["middle", "oldest"]);
			await retry.click();
			await expect(log.getByText("历史消息 00")).toBeAttached();
			await expect(log.getByText("历史消息 15")).toBeInViewport();
			await scroll.evaluate((element) => {
				element.scrollTop = 0;
			});
			await expect(log.getByText("历史消息 00")).toBeInViewport();
			await expect(loading).toHaveCount(0);
			expect(requests).toEqual(["middle", "oldest", "oldest"]);
		} finally {
			releasePage();
			await page.close();
		}
	});
}

import { devices, expect, type Page, test } from "@playwright/test";
import type { SendMessageRequest } from "@yonder/protocol";
import { conversation, isolateChat, person } from "./chat-fixture.ts";

const chatPath = `/messages/${conversation.id}`;
const messagePath = `**/v1/conversations/${conversation.id}/messages`;
const first = "我在核对这周的发布清单。";
const second = "移动端的结果也请放进去。";
const { viewport, userAgent, hasTouch, isMobile, deviceScaleFactor } = devices["iPhone 13"];

const members = [
	...conversation.members.filter((member) => member.memberId === person.id),
	{ memberId: "chat-peer", kind: "person" as const, displayName: "林舟", handle: "review-peer", avatarUrl: null },
];

function controls(page: Page) {
	return {
		input: page.getByRole("textbox", { name: /^对 .*说点什么/u }),
		send: page.getByRole("button", { name: "发送", exact: true }),
		outgoing: page.getByRole("log").locator(".message-bubble-outgoing"),
	};
}

for (const target of ["bot", "person", "group"] as const) {
	test.describe(target, () => {
		if (target === "group") test.use({ viewport, userAgent, hasTouch, isMobile, deviceScaleFactor });

		test("shows both messages before HTTP confirmation and delivers them in order", async ({ page }, testInfo) => {
			if (target !== "group") await page.setViewportSize({ width: target === "bot" ? 1180 : 800, height: 760 });
			const api = await isolateChat(page, {
				items: [],
				...(target === "group" ? { group: true, ownerId: person.id, members } : {}),
			});
			if (target === "person")
				await page.route("**/v1/conversations", (route) =>
					route.fulfill({ json: { items: [{ ...conversation, isPrimary: false, members }] } }),
				);
			const firstResponse = Promise.withResolvers<void>();
			const requests: string[] = [];
			await page.route(messagePath, async (route) => {
				if (route.request().method() !== "POST") return route.fallback();
				const body: SendMessageRequest = route.request().postDataJSON();
				requests.push(body.body);
				if (body.body === first) await firstResponse.promise;
				return route.fallback();
			});
			await page.goto(chatPath);
			const { input, send, outgoing } = controls(page);
			await expect(input).toBeVisible();
			await expect.poll(api.connected).toBe(true);
			try {
				await input.fill(first);
				await send.click();
				await expect.poll(() => requests).toEqual([first]);
				await expect(outgoing).toHaveText([first]);
				await expect(input).toHaveValue("");
				await input.fill(second);
				await send.click();
				await expect(outgoing).toHaveText([first, second]);
				await expect(input).toHaveValue("");
				await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
				await expect(page.getByRole("button", { name: "取消发送", exact: true })).toHaveCount(0);
				await page.screenshot({
					path: testInfo.outputPath("before-http-confirmation.png"),
					animations: "disabled",
					scale: "css",
				});
				expect(api.sent).toEqual([]);
				expect(requests).toEqual([first]);
				await input.fill("这是尚未发送的新草稿。");
			} finally {
				firstResponse.resolve();
			}
			await expect(page.locator('[data-message-id="sent-11"]')).toContainText(first);
			await expect(page.locator('[data-message-id="sent-12"]')).toContainText(second);
			await expect(outgoing).toHaveText([first, second]);
			await expect(input).toHaveValue("这是尚未发送的新草稿。");
			expect(requests).toEqual([first, second]);
		});
	});
}

test("an offline send survives reload and reconnects without a manual retry", async ({ context, page }, testInfo) => {
	const api = await isolateChat(page, { items: [] });
	const attempts: SendMessageRequest[] = [];
	const interrupted = Promise.withResolvers<void>();
	const accepted = Promise.withResolvers<void>();
	await page.route(messagePath, async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		attempts.push(route.request().postDataJSON());
		if (attempts.length === 1) {
			await interrupted.promise;
			return route.abort().catch(() => {});
		}
		await accepted.promise;
		return route.fallback();
	});
	await page.goto(chatPath);
	const { input, send, outgoing } = controls(page);
	await expect(input).toBeVisible();
	await expect.poll(api.connected).toBe(true);
	try {
		await context.setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
		await input.fill(first);
		await send.click();
		await expect(outgoing).toHaveText([first]);
		await expect(input).toHaveValue("");
		await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath("offline-message.png"), animations: "disabled", scale: "css" });
		expect(attempts).toHaveLength(0);

		await context.setOffline(false);
		await expect.poll(() => attempts.length).toBe(1);
		await page.reload();
		interrupted.resolve();
		await expect(outgoing).toHaveText([first]);
		await expect(input).toHaveValue("");
		await expect.poll(() => attempts.length).toBe(2);
		expect(attempts[1]?.clientNonce).toBe(attempts[0]?.clientNonce);
	} finally {
		interrupted.resolve();
		accepted.resolve();
	}
	await expect(page.locator('[data-message-id="sent-11"]')).toContainText(first);
	await expect(outgoing).toHaveText([first]);
	await expect(page.getByRole("log").getByRole("alert")).toHaveCount(0);
});

test("a temporary delivery error retries automatically without changing the local bubble", async ({ page }) => {
	const api = await isolateChat(page, { items: [] });
	const attempts: SendMessageRequest[] = [];
	const recovered = Promise.withResolvers<void>();
	await page.route(messagePath, async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		attempts.push(route.request().postDataJSON());
		if (attempts.length === 1) return route.fulfill({ status: 503, json: { error: { code: "internal" } } });
		await recovered.promise;
		return route.fallback();
	});
	await page.goto(chatPath);
	const { input, send, outgoing } = controls(page);
	try {
		await input.fill(first);
		await send.click();
		await expect(outgoing).toHaveText([first]);
		await expect(input).toHaveValue("");
		await expect.poll(() => attempts.length, { timeout: 10_000 }).toBe(2);
		await expect(page.getByText("发送中…", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("log").getByRole("alert")).toHaveCount(0);
		await expect(outgoing).toHaveText([first]);
		expect(attempts[1]?.clientNonce).toBe(attempts[0]?.clientNonce);
		expect(api.sent).toEqual([]);
	} finally {
		recovered.resolve();
	}
	await expect(page.locator('[data-message-id="sent-11"]')).toContainText(first);
	await expect(outgoing).toHaveText([first]);
	await expect(page.getByRole("log").getByRole("alert")).toHaveCount(0);
});

test("a rejected message stays in the conversation and can retry with its original nonce", async ({
	page,
}, testInfo) => {
	const api = await isolateChat(page, { items: [] });
	const attempts: SendMessageRequest[] = [];
	await page.route(messagePath, (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		attempts.push(route.request().postDataJSON());
		if (attempts.length === 1) return route.fulfill({ status: 400, json: { error: { code: "invalid_request" } } });
		return route.fallback();
	});
	await page.goto(chatPath);
	const { input, send, outgoing } = controls(page);
	await input.fill(first);
	await send.click();
	const failed = page
		.getByRole("log")
		.locator("article[data-message-id]")
		.filter({ hasText: first })
		.getByRole("alert");
	await expect(failed).toContainText("消息没有发出");
	await expect(outgoing).toHaveText([first]);
	await expect(input).toHaveValue("");
	await page.reload();
	await expect(failed).toContainText("消息没有发出");
	await expect(outgoing).toHaveText([first]);
	await expect(input).toHaveValue("");
	await page.screenshot({
		path: testInfo.outputPath("failed-message-retry.png"),
		animations: "disabled",
		scale: "css",
	});
	await failed.getByRole("button", { name: "重试", exact: true }).click();
	await expect(page.locator('[data-message-id="sent-11"]')).toContainText(first);
	await expect(outgoing).toHaveText([first]);
	await expect(failed).toHaveCount(0);
	expect(api.sent).toHaveLength(1);
	expect(attempts).toHaveLength(2);
	expect(attempts[1]?.clientNonce).toBe(attempts[0]?.clientNonce);
});

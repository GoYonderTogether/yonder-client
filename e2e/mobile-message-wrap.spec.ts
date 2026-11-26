import { expect, test } from "@playwright/test";
import { conversation, isolateChat, message } from "./chat-fixture.ts";

test.use({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 1,
	userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
	reducedMotion: "reduce",
});

const paragraph = "这是一段足够长的中文，用来确认聊天气泡会把文字排到靠近右边，而不是在中间提前换行。";

test("mobile chat uses the same inner margins on both sides while normal sentences still wrap", async ({ page }) => {
	await isolateChat(page, {
		items: [
			...Array.from({ length: 12 }, (_, i) =>
				message(`message-${String(i + 10).padStart(2, "0")}`, paragraph, !!(i % 2)),
			),
			message("message-30", "短回复"),
			message("message-31", paragraph.repeat(2)),
			message("message-32", paragraph.repeat(2), true),
		],
	});
	await page.goto(`/messages/${conversation.id}`);
	const log = page.getByRole("log");
	await expect(log).toBeVisible();
	await expect(log.getByText("短回复", { exact: true })).toBeVisible();
	await expect(page.locator("[data-layout-mode]")).toHaveAttribute("data-layout-mode", "mobile");
	await log.locator('[data-message-id="message-32"]').scrollIntoViewIfNeeded();
	const boxes = await log.evaluate((element) => {
		const frame = element.closest<HTMLElement>("[data-frame-scroll]");
		const reply = element.querySelector('[data-message-id="message-31"] .message-bubble');
		const sent = element.querySelector('[data-message-id="message-32"] .message-bubble');
		const short = element.querySelector('[data-message-id="message-30"] .message-bubble');
		const paragraph = reply?.querySelector(".message-content");
		if (!frame || !reply || !sent || !short || !paragraph) throw new Error("Expected actual chat frame and bubbles");
		const pane = frame.getBoundingClientRect();
		const content = element.getBoundingClientRect();
		const left = reply.getBoundingClientRect();
		const right = sent.getBoundingClientRect();
		const lastTextEdge = left.right - parseFloat(getComputedStyle(reply).paddingRight);
		const range = document.createRange();
		range.selectNodeContents(paragraph);
		return {
			scrollable: frame.scrollTop > 0 && frame.scrollHeight > frame.clientHeight,
			pageWidth: document.documentElement.scrollWidth,
			viewportWidth: innerWidth,
			left: content.left - pane.left,
			right: pane.right - content.right,
			incomingLeft: left.left - content.left,
			outgoingRight: content.right - right.right,
			bubbleWidth: left.width,
			shortWidth: short.getBoundingClientRect().width,
			lineCount: new Set([...range.getClientRects()].map(({ top }) => top)).size,
			overflow: Math.max(...[...range.getClientRects()].map(({ right }) => right)) - lastTextEdge,
			scrollbar: getComputedStyle(frame).scrollbarWidth,
		};
	});
	await test.info().attach("chat-geometry", { body: JSON.stringify(boxes), contentType: "application/json" });
	expect(boxes.scrollable).toBe(true);
	expect(boxes.left).toBeGreaterThan(0);
	expect(boxes.right).toBeCloseTo(boxes.left, 0);
	expect(boxes.incomingLeft).toBeCloseTo(0, 0);
	expect(boxes.outgoingRight).toBeCloseTo(0, 0);
	expect(boxes.shortWidth).toBeLessThan(boxes.bubbleWidth / 2);
	expect(boxes.lineCount).toBeGreaterThan(1);
	expect(boxes.overflow).toBeLessThanOrEqual(1);
	expect(boxes.pageWidth).toBeLessThanOrEqual(boxes.viewportWidth);
	expect(boxes.scrollbar).toBe("none");
	await page.screenshot({ path: test.info().outputPath("mobile-message-wrap.png"), animations: "disabled" });
});

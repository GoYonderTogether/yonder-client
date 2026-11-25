import { devices, expect, type Page, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
const path = "/messages/main";
const inputName = /^对 界面验收/;

async function openChat(page: Page) {
	await page.goto(path);
	await expect(page.getByRole("textbox", { name: inputName })).toBeVisible();
}

/** One synthetic IME: composition events plus the key that commits the candidate. */
async function confirmCandidate(input: ReturnType<Page["locator"]>, legacyWebKit: boolean) {
	await input.dispatchEvent("compositionstart", { data: "" });
	// Older WebKit fires compositionend first and reports the confirming key as keyCode 229.
	if (legacyWebKit) await input.dispatchEvent("compositionend", { data: "中文" });
	await input.dispatchEvent("keydown", {
		key: "Enter",
		code: "Enter",
		keyCode: legacyWebKit ? 229 : 13,
		isComposing: !legacyWebKit,
		bubbles: true,
		cancelable: true,
	});
	await input.dispatchEvent("keyup", { key: "Enter", code: "Enter", keyCode: legacyWebKit ? 229 : 13, bubbles: true });
	if (!legacyWebKit) await input.dispatchEvent("compositionend", { data: "中文" });
}

test.describe("desktop composer keys", () => {
	test.use({ viewport: { width: 1120, height: 800 } });

	test("a Latin Enter sends once and empties the field before the server answers", async ({ page }) => {
		const api = await isolateChat(page);
		// Hold the POST open, so "empty before the round trip" is real rather than a fast answer.
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/v1/**", async (route) => {
			const request = route.request();
			if (new URL(request.url()).pathname.endsWith("/messages") && request.method() === "POST") await held;
			await route.fallback();
		});
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		await input.fill("one press");
		await input.press("Enter");
		// The bubble is on screen while the request is still in flight, and the field is already empty.
		await expect(page.locator(".message-bubble-outgoing").last()).toHaveText("one press");
		expect(await input.inputValue()).toBe("");
		expect(api.sent).toHaveLength(0);
		release();
		await expect.poll(() => api.sent.length).toBe(1);
		expect(api.sent[0]).toMatchObject({ body: "one press", type: "text" });
		await expect(input).toHaveValue("");
	});

	test("Shift+Enter inserts a newline without sending", async ({ page }) => {
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		await input.fill("first");
		await input.press("Shift+Enter");
		await input.pressSequentially("second");
		await expect(input).toHaveValue("first\nsecond");
		expect(api.sent).toHaveLength(0);
	});

	for (const legacyWebKit of [false, true]) {
		test(`confirming an IME candidate does not send; the next Enter sends at once (legacy WebKit=${legacyWebKit})`, async ({
			page,
		}) => {
			const api = await isolateChat(page);
			await openChat(page);
			const input = page.getByRole("textbox", { name: inputName });
			await input.fill("中文已确认");
			await confirmCandidate(input, legacyWebKit);
			expect(api.sent).toHaveLength(0);
			// No waiting: the very next Enter, in the next task, is a send.
			await input.press("Enter");
			await expect.poll(() => api.sent.length).toBe(1);
			expect(api.sent[0]?.body).toBe("中文已确认");
			await expect(input).toHaveValue("");
		});
	}

	test("a send the server refuses puts the text back in the field", async ({ page }) => {
		await isolateChat(page);
		await page.route("**/v1/**", async (route) => {
			const request = route.request();
			if (new URL(request.url()).pathname.endsWith("/messages") && request.method() === "POST")
				return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
			await route.fallback();
		});
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		await input.fill("please keep this");
		await input.press("Enter");
		await expect(input).toHaveValue("please keep this");
	});

	test("the field grows to three lines, stops at its cap with a scrollbar, and shrinks again", async ({ page }) => {
		// The fallback exists for engines without `field-sizing` (Firefox, older WebViews). Where the
		// browser has it, the same state is simulated: CSS.supports says no and the property is fixed,
		// so only the JavaScript path can make the field grow.
		const native = await page.evaluate(() => CSS.supports("field-sizing", "content"));
		if (native)
			await page.addInitScript(() => {
				const supported = CSS.supports.bind(CSS);
				CSS.supports = ((property: string, value?: string) =>
					property === "field-sizing"
						? false
						: value === undefined
							? supported(property)
							: supported(property, value)) as typeof CSS.supports;
				const add = () => {
					const style = document.createElement("style");
					style.textContent = "textarea.composer-text { field-sizing: fixed !important; }";
					document.documentElement.append(style);
				};
				// An init script runs before the parser has built <html>.
				if (document.documentElement) add();
				else document.addEventListener("DOMContentLoaded", add);
			});
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		const measure = () =>
			input.evaluate((node) => {
				const style = getComputedStyle(node);
				return {
					height: node.getBoundingClientRect().height,
					heightStyle: node.style.height,
					lineHeight: Number.parseFloat(style.lineHeight),
					maxHeight: Number.parseFloat(style.maxHeight),
					scrolls: node.scrollHeight > node.clientHeight + 1,
				};
			});
		const empty = await measure();
		// Without the fallback this field would stay one row tall and scroll from the first extra line.
		expect(empty.heightStyle).not.toBe("");
		await input.fill("one\ntwo\nthree");
		const three = await measure();
		expect(three.height).toBeGreaterThan(empty.height + three.lineHeight * 1.5);
		expect(three.height).toBeLessThan(empty.height + three.lineHeight * 3);
		expect(three.scrolls).toBe(false);
		await input.fill(Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n"));
		const twenty = await measure();
		expect(twenty.height).toBeCloseTo(twenty.maxHeight, 0);
		expect(twenty.scrolls).toBe(true);
		await input.fill("one line");
		const shrunk = await measure();
		expect(shrunk.height).toBeCloseTo(empty.height, 0);
		expect(shrunk.scrolls).toBe(false);
		expect(api.sent).toHaveLength(0);
	});

	test("an engine with field-sizing keeps the pure-CSS height, and the fallback leaves it alone", async ({ page }) => {
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		const native = await page.evaluate(() => CSS.supports("field-sizing", "content"));
		await input.fill("one\ntwo\nthree");
		const box = await input.evaluate((node) => ({
			height: node.getBoundingClientRect().height,
			heightStyle: node.style.height,
			scrolls: node.scrollHeight > node.clientHeight + 1,
		}));
		// One owner only: the browser's own `field-sizing` where it exists, the hook's inline height
		// where it does not — never both.
		expect(box.heightStyle === "").toBe(native);
		expect(box.scrolls).toBe(false);
		expect(box.height).toBeGreaterThan(0);
		expect(api.sent).toHaveLength(0);
	});
});

test.describe("phone composer at 375×812", () => {
	test.use({ ...iphone, viewport: { width: 375, height: 812 } });

	test("the send button posts once and the field empties with the bubble", async ({ page }) => {
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		await input.fill("手机发送");
		await page.getByRole("button", { name: "发送", exact: true }).click();
		await expect(page.locator(".message-bubble-outgoing").last()).toHaveText("手机发送");
		expect(await input.inputValue()).toBe("");
		await expect.poll(() => api.sent.length).toBe(1);
		expect(api.sent[0]?.body).toBe("手机发送");
	});

	test("Enter on the phone keyboard is a newline, never a send", async ({ page }) => {
		const api = await isolateChat(page);
		await openChat(page);
		const input = page.getByRole("textbox", { name: inputName });
		await input.fill("第一行");
		await input.press("Enter");
		await expect(input).toHaveValue("第一行\n");
		expect(api.sent).toHaveLength(0);
	});
});

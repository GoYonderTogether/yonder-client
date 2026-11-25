import { devices, expect, test } from "@playwright/test";
import { isolateChat } from "./chat-fixture.ts";

const { defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];

// Scenarios cover the glyph classes that break naive overlays: CJK, emoji, full-width punctuation, a
// long line that must wrap, and enough lines to scroll inside the field.
const scenarios: { name: string; text: string }[] = [
	{ name: "chinese", text: "今天 **记得** 检查消息气泡和录音笔记 _务必_ 完成" },
	{ name: "emoji", text: "进度 🌏👍🏽 **完成** `npm test` 然后 🚀" },
	{ name: "full-width", text: "第一，**重点**；第二「注意」……然后 `code` 结束。" },
	{
		name: "wrapping",
		text: `**长行**：${"这是一段很长的中文，用来测试换行对齐，".repeat(6)}末尾`,
	},
	{
		name: "multiline",
		text: Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 行 **粗体** 与 \`code${i}\` 内容`).join("\n"),
	},
];

/**
 * For each target character index, compare where the rendered overlay puts that glyph against where the
 * same text, with the same element and typography, would put it as plain text. Reading both positions
 * inside the exact same `.composer-highlight` element (formatted HTML first, then plain text, then the
 * HTML restored) isolates the one thing draft styling could break: a formatting span must not change a
 * glyph's advance. The overlay box itself is pinned to the textarea box, font and wrap height, which
 * `settled` checks. Returns the per-index `formatted - plain` left offset, in CSS pixels.
 */
async function gridDelta(page: import("@playwright/test").Page, indices: number[]): Promise<number[]> {
	return page.evaluate((targets) => {
		const overlay = document.querySelector(".composer-highlight") as HTMLElement | null;
		if (!overlay) throw new Error("No overlay");
		const measure = (): Record<number, number> => {
			const walker = document.createTreeWalker(overlay, NodeFilter.SHOW_TEXT);
			const nodes: Text[] = [];
			let node = walker.nextNode();
			while (node) {
				nodes.push(node as Text);
				node = walker.nextNode();
			}
			const origin = overlay.getBoundingClientRect().left;
			const result: Record<number, number> = {};
			let consumed = 0;
			for (const text of nodes) {
				for (const target of targets) {
					if (target >= consumed && target < consumed + text.data.length) {
						const range = document.createRange();
						range.setStart(text, target - consumed);
						range.setEnd(text, target - consumed + 1);
						result[target] = range.getBoundingClientRect().left - origin;
					}
				}
				consumed += text.data.length;
			}
			return result;
		};
		const formatted = measure();
		const html = overlay.innerHTML;
		const plain = overlay.textContent ?? "";
		overlay.textContent = plain;
		const plainPositions = measure();
		overlay.innerHTML = html;
		return targets.map((target) => (formatted[target] ?? 0) - (plainPositions[target] ?? 0));
	}, indices);
}

/** Wait until the overlay's box, font and wrap height match the textarea before measuring. */
async function settled(page: import("@playwright/test").Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const textarea = document.querySelector("textarea.composer-text");
					const overlay = document.querySelector(".composer-highlight");
					if (!textarea || !overlay) return false;
					const a = textarea.getBoundingClientRect();
					const b = overlay.getBoundingClientRect();
					return (
						Math.abs(a.left - b.left) <= 0.5 &&
						Math.abs(a.width - b.width) <= 0.5 &&
						getComputedStyle(textarea).fontSize === getComputedStyle(overlay).fontSize &&
						Math.abs((textarea as HTMLElement).scrollHeight - (overlay as HTMLElement).scrollHeight) <= 1
					);
				}),
			{ timeout: 3000 },
		)
		.toBe(true);
}

for (const mobile of [true, false]) {
	test.describe(mobile ? "mobile" : "desktop", () => {
		test.use(mobile ? iphone : { viewport: { width: 1120, height: 800 } });

		for (const scenario of scenarios) {
			test(`overlay sits on the textarea grid for ${scenario.name}`, async ({ page }) => {
				await isolateChat(page);
				await page.goto("/messages/main");
				const input = page.locator("textarea.composer-text");
				await input.fill(scenario.text);
				await expect(page.locator(".composer-highlight")).toBeVisible();
				await settled(page);
				// Scroll to a mid-point when the draft overflows, so a shifted scrollTop would show.
				await input.evaluate((node) => {
					node.scrollTop = Math.min(node.scrollHeight, 40);
					node.dispatchEvent(new Event("scroll"));
				});
				const length = scenario.text.length;
				const step = Math.max(1, Math.floor(length / 40));
				const indices: number[] = [];
				for (let index = 0; index < length; index += step) {
					// Skip surrogate halves so the sample is always a whole code point.
					const code = scenario.text.charCodeAt(index);
					if (code >= 0xd800 && code <= 0xdfff) continue;
					indices.push(index);
				}
				const deltas = await gridDelta(page, indices);
				for (const [i, delta] of deltas.entries()) {
					// A Range reports glyph boxes in float space; Firefox rounds them to the nearest device
					// pixel differently from Chrome, so the same glyph can land ~0.6px apart even when the
					// layout is identical. Allow 1px, which is a sub-device-pixel difference at 2x.
					expect(Math.abs(delta), `${scenario.name} char ${indices[i]}`).toBeLessThanOrEqual(1);
				}
			});
		}

		test("caret, selection and IME composition keep the overlay on grid", async ({ page }) => {
			await isolateChat(page);
			await page.goto("/messages/main");
			const input = page.locator("textarea.composer-text");
			await input.fill("你好 **世界** 再见");
			const mirror = page.locator(".composer-highlight");
			await input.evaluate((node) => (node as HTMLTextAreaElement).setSelectionRange(3, 7));
			expect(await input.evaluate((node) => (node as HTMLTextAreaElement).selectionStart)).toBe(3);
			await expect(mirror).toBeVisible();
			// Composition hides the overlay so half-composed text never flashes grey.
			await input.evaluate((node) => node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
			await expect(mirror).toHaveCSS("visibility", "hidden");
			await input.evaluate((node) => {
				node.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "世界" }));
			});
			await expect(mirror).toHaveCSS("visibility", "hidden");
			await input.evaluate((node) =>
				node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "世界" })),
			);
			await expect(mirror).toBeVisible();
			const [delta] = await gridDelta(page, [7]);
			expect(Math.abs(delta ?? 0)).toBeLessThanOrEqual(1);
		});

		test("pasting 5,000 characters highlights within the frame budget", async ({ page }) => {
			await isolateChat(page);
			await page.goto("/messages/main");
			const input = page.locator("textarea.composer-text");
			const big = Array.from(
				{ length: 200 },
				(_, i) => `第${i + 1}行 **粗体** 和 \`code\` [链接](https://e.com/${i})`,
			).join("\n");
			const slice = big.slice(0, 5000);
			// Warm the overlay component once (first mount pays React + font-layout cost unrelated to the
			// scanner), then time the steady-state cost of re-highlighting a full 5,000-character draft —
			// which is what every subsequent paste or keystroke pays. Setting the value and dispatching
			// `input` flushes the draft, the scanner and the overlay spans in one React pass; reading a
			// layout property afterwards forces that work to finish before the clock stops.
			const measure = (text: string) =>
				input.evaluate((node, value) => {
					const textarea = node as HTMLTextAreaElement;
					const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
					const start = performance.now();
					setter?.call(textarea, value);
					textarea.dispatchEvent(new Event("input", { bubbles: true }));
					void textarea.offsetHeight;
					return performance.now() - start;
				}, text);
			await measure(slice);
			await settled(page);
			const elapsed = await measure(slice);
			await expect(input).toHaveValue(slice);
			// The overlay must actually contain the whole draft (every marker still marked).
			await expect(page.locator(".composer-draft-syntax").first()).toBeVisible();
			expect(await page.locator(".composer-highlight").textContent()).toContain(slice.slice(-30));
			// One frame at 60Hz is ~16.7ms; stay within three of them, and within 200 chars/ms.
			expect(elapsed).toBeLessThanOrEqual(50);
			expect(5000 / elapsed).toBeGreaterThan(200);
		});
	});
}

// The same draft geometry, when the interface is scaled to its smallest and largest steps.
for (const size of ["xsmall", "xlarge"] as const) {
	test.describe(`ui-size ${size}`, () => {
		test.use(iphone);
		test("overlay stays on the textarea grid", async ({ page }) => {
			await isolateChat(page);
			await page.addInitScript((value) => localStorage.setItem("yonder.ui-size", value), size);
			await page.goto("/messages/main");
			await expect(page.locator("html")).toHaveAttribute("data-ui-size", size);
			const input = page.locator("textarea.composer-text");
			const text = "缩放 **粗体** _斜体_ `code` 中文，标点。";
			await input.fill(text);
			await settled(page);
			const indices: number[] = [];
			for (let index = 0; index < text.length; index += 4) indices.push(index);
			const deltas = await gridDelta(page, indices);
			for (const [i, delta] of deltas.entries()) {
				expect(Math.abs(delta), `${size} char ${indices[i]}`).toBeLessThanOrEqual(1);
			}
		});
	});
}

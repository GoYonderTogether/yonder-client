// @vitest-environment jsdom
/**
 * The page push: a back gesture must reveal the page that was there before it, held aside like the
 * system's navigation stack, and it must leave that page exactly as it found it.
 */
import { afterEach, expect, test } from "vitest";
import { clearRecede, coversPageBelow, pageBelow, recede } from "./page-below.ts";

afterEach(() => {
	document.body.innerHTML = "";
});

function surface(name: string, box = { width: 390, height: 844 }) {
	const element = document.createElement("div");
	element.dataset.name = name;
	element.getBoundingClientRect = () => ({ ...box, top: 0, left: 0, right: box.width, bottom: box.height }) as DOMRect;
	return element;
}

test("a page reveals the surface before it, not the shell's header or backdrop", () => {
	const frame = document.createElement("div");
	const list = surface("list");
	const detail = surface("detail");
	detail.dataset.pageLayer = "detail";
	const nested = document.createElement("main");
	detail.append(nested);
	frame.append(list, detail);
	document.body.append(frame);
	expect(pageBelow(nested)).toBe(list);
});

test("a stacked page reveals the page under it, even though that page is inert", () => {
	const stack = document.createElement("div");
	const page = surface("page");
	const covered = surface("covered");
	covered.inert = true;
	const top = surface("top");
	stack.append(page, covered, top);
	document.body.append(stack);
	expect(pageBelow(top)).toBe(covered);
});

test("a page that is gone or collapsed is not revealed", () => {
	const stack = document.createElement("div");
	const page = surface("page");
	const gone = surface("gone", { width: 0, height: 0 });
	gone.style.display = "none";
	const top = surface("top");
	stack.append(page, gone, top);
	document.body.append(stack);
	expect(pageBelow(top)).toBe(page);
});

test("the page below is held a share of the way aside while the layer covers it", () => {
	const below = surface("below");
	// A page that came from the right pushes the page below it right, out the way it came.
	recede(below, 1, 390, 1);
	expect(below.style.transform).toMatch(/^translateX\(109\.2px\)$/);
	recede(below, 0.5, 390, 1);
	expect(below.style.transform).toMatch(/^translateX\(54\.6px\)$/);
	// 「我」 enters from the left, so the page below leaves to the left.
	recede(below, 1, 390, -1);
	expect(below.style.transform).toMatch(/^translateX\(-109\.2px\)$/);
	// Gone: the page below is exactly where it was.
	recede(below, 0, 390, 1);
	expect(below.style.transform).toBe("");
	clearRecede(below);
	expect(below.style.transform).toBe("");
	expect(below.style.willChange).toBe("");
});

test("only a frame that pushes over its list is given a page behind it", () => {
	const mobile = document.createElement("div");
	mobile.dataset.layoutMode = "mobile";
	const wide = document.createElement("div");
	wide.dataset.layoutMode = "wide";
	const child = document.createElement("div");
	mobile.append(child);
	expect(coversPageBelow(child)).toBe(true);
	wide.append(child);
	expect(coversPageBelow(child)).toBe(false);
});

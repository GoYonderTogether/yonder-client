import { expect, test } from "vitest";
import { chatViewportHeight, safeBottomInset } from "./viewport";

test("subtracts keyboard only once and restores the safe inset when closed or rotated", () => {
	expect(chatViewportHeight(844, 844, 88, 34, 0)).toBe(722);
	expect(chatViewportHeight(844, 844, 88, 34, 300)).toBe(456);
	expect(chatViewportHeight(544, 844, 88, 34, 300)).toBe(456);
	expect(chatViewportHeight(694, 844, 88, 34, 300)).toBe(456);
	expect(chatViewportHeight(390, 390, 44, 21, 0)).toBe(325);
});

test("ignores empty or invalid safe area data", () => {
	expect(safeBottomInset(844, 0)).toBe(0);
	expect(safeBottomInset(844, undefined)).toBe(0);
	expect(safeBottomInset(844, 900)).toBe(0);
	expect(safeBottomInset(844, 810)).toBe(34);
});

import { expect, test } from "vitest";
import { closeDistance, releaseVelocity, shouldDismiss } from "./release.ts";

test("a layer dragged slowly past a quarter of its width closes, however slowly", () => {
	expect(closeDistance(402)).toBeCloseTo(100.5);
	expect(shouldDismiss(120, 0, 402)).toBe(true);
	expect(shouldDismiss(60, 0, 402)).toBe(false);
	expect(closeDistance(120)).toBe(64);
});

test("a finger held still at release counts as at rest, not as the speed it last reported", () => {
	const samples = [
		{ time: 0, point: 0 },
		{ time: 16, point: 40 },
		{ time: 32, point: 90 },
	];
	expect(releaseVelocity(samples, 40)).toBeGreaterThan(1500);
	expect(releaseVelocity(samples, 32 + 120)).toBe(0);
	expect(shouldDismiss(90, releaseVelocity(samples, 32 + 120), 402)).toBe(false);
});

test("a flick closes from a short way in and a returning finger keeps the layer open", () => {
	expect(shouldDismiss(30, 800, 402)).toBe(true);
	expect(shouldDismiss(8, 800, 402)).toBe(false);
	expect(shouldDismiss(250, -600, 402)).toBe(false);
	expect(shouldDismiss(0, 900, 402)).toBe(false);
});

test("velocity is measured over the last moments only", () => {
	const samples = [
		{ time: 0, point: 0 },
		{ time: 400, point: 300 },
		{ time: 420, point: 302 },
		{ time: 440, point: 304 },
	];
	expect(releaseVelocity(samples, 445)).toBeCloseTo(100, 0);
});

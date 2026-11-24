import { expect, test } from "vitest";
import { releasedToClose } from "./gesture-panel.tsx";

const base = { velocity: 0, projected: 0, closeThreshold: 97, expandable: false };

test("a flick closes a left panel, whose live offset is negative", () => {
	// A left panel leaves toward the left: direction -1, offset went negative, velocity too.
	expect(releasedToClose({ ...base, direction: -1, position: -196, velocity: -3900, projected: 897 })).toBe(true);
	// A right panel leaves toward the right: direction 1, offset positive.
	expect(releasedToClose({ ...base, direction: 1, position: 196, velocity: 3900, projected: 897 })).toBe(true);
});

test("a held finger does not count as a flick on either side", () => {
	for (const direction of [-1, 1] as const) {
		expect(releasedToClose({ ...base, direction, position: 20 * direction, velocity: 0, projected: 20 })).toBe(false);
	}
});

test("a slow drag closes only past a quarter of the panel", () => {
	expect(releasedToClose({ ...base, direction: -1, position: -97, velocity: -40, projected: 97 })).toBe(false);
	expect(releasedToClose({ ...base, direction: -1, position: -98, velocity: -40, projected: 98 })).toBe(true);
});

test("a tall sheet closes on its own shorter threshold", () => {
	expect(
		releasedToClose({
			...base,
			direction: 1,
			position: 40,
			velocity: 0,
			projected: 40,
			closeThreshold: 52,
			expandable: true,
		}),
	).toBe(false);
	expect(
		releasedToClose({
			...base,
			direction: 1,
			position: 60,
			velocity: 0,
			projected: 60,
			closeThreshold: 52,
			expandable: true,
		}),
	).toBe(true);
});

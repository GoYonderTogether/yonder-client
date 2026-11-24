import { expect, test } from "vitest";
import { releasedToClose } from "./back-gesture.ts";

// Both a right-hand page and the left-hand 「我」 close as a positive distance toward their own
// closing edge, so one set of rules covers both and neither can flick itself open.
const base = { distance: 0, speed: 0, closeThreshold: 97 };

test("a flick closes a page on either side", () => {
	expect(releasedToClose({ ...base, distance: 30, speed: 900 })).toBe(true);
});

test("a held finger does not count as a flick", () => {
	expect(releasedToClose({ ...base, distance: 20, speed: 0 })).toBe(false);
});

test("a slow drag closes only past a quarter of the page", () => {
	expect(releasedToClose({ ...base, distance: 80, speed: 0 })).toBe(false);
	expect(releasedToClose({ ...base, distance: 97, speed: 0 })).toBe(true);
});

test("a tall sheet closes on its own shorter threshold", () => {
	expect(releasedToClose({ ...base, closeThreshold: 52, distance: 40 })).toBe(false);
	expect(releasedToClose({ ...base, closeThreshold: 52, distance: 60 })).toBe(true);
});

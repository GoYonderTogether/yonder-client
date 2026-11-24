import { expect, test } from "vitest";
import {
	closeDistance,
	EDGE_WIDTH,
	FLICK_SPEED,
	releasedToClose,
	releaseVelocity,
	SLOP,
	track,
} from "./back-gesture.ts";

const smooth = (points: readonly number[], step = 16) => points.map((point, index) => ({ time: index * step, point }));

test("a slow drag closes past a quarter of the page, whatever the page's width", () => {
	expect(closeDistance(390)).toBe(97.5);
	expect(closeDistance(200)).toBe(64);
	expect(releasedToClose({ distance: 60, speed: 0, closeThreshold: 97.5 })).toBe(false);
	expect(releasedToClose({ distance: 200, speed: 0, closeThreshold: 97.5 })).toBe(true);
});

test("a short flick closes from anywhere, but a nudge that barely moved does not", () => {
	expect(releasedToClose({ distance: 40, speed: FLICK_SPEED + 400, closeThreshold: 97.5 })).toBe(true);
	expect(releasedToClose({ distance: 10, speed: FLICK_SPEED + 400, closeThreshold: 97.5 })).toBe(false);
});

test("a finger that is coming back keeps the page, however far it had gone", () => {
	expect(releasedToClose({ distance: 300, speed: -FLICK_SPEED - 100, closeThreshold: 97.5 })).toBe(false);
});

test("a page held still at rest is judged only by where it is", () => {
	expect(releasedToClose({ distance: 80, speed: 0, closeThreshold: 97.5 })).toBe(false);
	expect(releasedToClose({ distance: 0, speed: 0, closeThreshold: 97.5 })).toBe(false);
});

test("a gentle throw past the halfway mark still coasts a slow drag home", () => {
	// 110px at 150px/s: not a flick, but close enough to land past the threshold.
	expect(releasedToClose({ distance: 110, speed: 150, closeThreshold: 97.5 })).toBe(true);
});

test("speed is read over a window, not between the last two touch reports", () => {
	// A finger crawling at 1px per 16ms reports tiny steps; the window still sees the real speed.
	expect(releaseVelocity(smooth([0, 20, 40, 60, 80]), 80)).toBeCloseTo(1250, -1);
	// A finger that was crawling and then flicked in its last 30ms is a flick, not a crawl.
	expect(releaseVelocity([...smooth([0, 1, 2]), { time: 78, point: 40 }], 80)).toBeGreaterThan(FLICK_SPEED);
});

test("a finger that stopped reporting is at rest, not still moving", () => {
	expect(releaseVelocity(smooth([0, 100, 200]), 300)).toBe(0);
});

test("a flick needs the finger to actually have moved", () => {
	expect(releaseVelocity([{ time: 0, point: 0 }], 4)).toBe(0);
});

test("tracking keeps only the samples that still describe the finger", () => {
	const samples = track(
		track(track(track([], { time: 0, point: 0 }), { time: 500, point: 50 }), { time: 560, point: 60 }),
		{
			time: 620,
			point: 70,
		},
	);
	// The oldest sample is kept as the window's anchor; nothing older than it survives.
	expect(samples.map((sample) => sample.time)).toEqual([0, 500, 560, 620]);
});

test("the rules start where the system's do: a narrow edge band and a real sideways move", () => {
	expect(EDGE_WIDTH).toBeLessThanOrEqual(32);
	expect(SLOP).toBeGreaterThanOrEqual(6);
});

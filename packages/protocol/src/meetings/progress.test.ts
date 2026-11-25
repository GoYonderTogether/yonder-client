import { describe, expect, test } from "vitest";
import { meetingProgress } from "./progress.ts";

/**
 * The one progress formula every reader of a recording uses (PLAN.md 4.4-H): the card, the items
 * page and the server's status read all show its numbers. These pin the two measures it chooses
 * between and the clamp that keeps a bad row from printing over 100 percent.
 */
describe("meetingProgress", () => {
	test("the percent is recognized audio over the recording's own duration", () => {
		expect(meetingProgress({ totalBatches: 4, completedBatches: 2, completedMs: 30_000, durationMs: 60_000 })).toEqual({
			completedBatches: 2,
			totalBatches: 4,
			percent: 50,
		});
	});

	test("a recording with no audio duration counts batches instead", () => {
		// A photo-only note: no audio to measure, so the batch count is the honest measure.
		expect(meetingProgress({ totalBatches: 4, completedBatches: 1, completedMs: 0, durationMs: 0 })).toEqual({
			completedBatches: 1,
			totalBatches: 4,
			percent: 25,
		});
	});

	test("nothing to count is zero, and a row past its duration is clamped to 100", () => {
		expect(meetingProgress({ totalBatches: 0, completedBatches: 0, completedMs: 0, durationMs: 0 }).percent).toBe(0);
		expect(
			meetingProgress({ totalBatches: 2, completedBatches: 2, completedMs: 90_000, durationMs: 60_000 }).percent,
		).toBe(100);
	});
});

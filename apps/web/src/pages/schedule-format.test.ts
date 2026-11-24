import { describe, expect, test } from "vitest";
import { describePlan, formatInstant, planStatusKey, zonedParts } from "./schedule-format.ts";

/** The plan's own zone decides every displayed hour; the browser's zone is never consulted. */
const t = (key: string): string => {
	const table: Record<string, string> = {
		"tasks.kindDaily": "每天",
		"tasks.kindWeekly": "每周",
		"tasks.weekday1": "周一",
		"tasks.weekday3": "周三",
	};
	return table[key] ?? key;
};

describe("schedule formatting", () => {
	test("a wall-clock time is read in the plan's zone, not the process's", () => {
		const instant = new Date("2026-11-17T01:00:00.000Z");
		expect(zonedParts("Asia/Shanghai", instant)).toEqual({ year: 2026, month: 11, day: 17, hour: 9, minute: 0 });
		expect(zonedParts("UTC", instant)).toEqual({ year: 2026, month: 11, day: 17, hour: 1, minute: 0 });
	});

	test("a recurring plan reads as its own schedule, without the browser's hour", () => {
		expect(describePlan({ kind: "daily", at: "09:00", weekdays: [], timezone: "Asia/Shanghai" }, t)).toBe("每天 09:00");
		expect(describePlan({ kind: "weekly", at: "09:00", weekdays: [3, 1], timezone: "Asia/Shanghai" }, t)).toBe(
			"每周 周一、周三 09:00",
		);
	});

	test("a one-off plan shows its instant in its own zone", () => {
		expect(
			describePlan({ kind: "once", at: "2026-11-17T01:00:00.000Z", weekdays: [], timezone: "Asia/Shanghai" }, t),
		).toBe("2026-11-17 09:00");
	});

	test("an absolute instant is shown in the plan's zone", () => {
		// The exact wording is locale data; the hour is what must not move.
		expect(formatInstant("Asia/Shanghai", "2026-11-17T01:00:00.000Z", "en-US")).toContain("9:00");
		expect(formatInstant("UTC", "2026-11-17T01:00:00.000Z", "en-US")).toContain("1:00");
	});
});

describe("the one status word a plan's row shows", () => {
	test("a running plan adds nothing; a stopped one says why", () => {
		expect(planStatusKey("active")).toBeNull();
		expect(planStatusKey("paused")).toBe("tasks.goalState.paused");
		expect(planStatusKey("ended")).toBe("tasks.planEnded");
		expect(planStatusKey("missed")).toBe("tasks.resultMissed");
	});
});

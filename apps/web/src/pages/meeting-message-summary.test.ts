import { expect, test } from "vitest";
import {
	recordingNoteDate,
	recordingNoteDuration,
	recordingNoteProgress,
	recordingNoteTimeRange,
} from "./meeting-message-summary.ts";

test("recording dates compare the account zone's calendar day, including New Year", () => {
	const now = new Date("2027-01-01T00:05:00+08:00");
	const shanghai = "Asia/Shanghai";
	expect(recordingNoteDate(+new Date("2026-12-31T23:55:00+08:00"), "zh-CN", shanghai, now)).toBe("昨天");
	expect(recordingNoteDate(+new Date("2027-01-01T00:00:00+08:00"), "en", shanghai, now)).toBe("Today");
	expect(recordingNoteDate(+new Date("2026-12-30T12:00:00+08:00"), "en", shanghai, now)).toBe("Dec 30, 2026");
	const march = new Date("2026-03-09T00:30:00+08:00");
	expect(recordingNoteDate(+new Date("2026-03-08T23:50:00+08:00"), "en", shanghai, march)).toBe("Yesterday");
	expect(recordingNoteDate(+new Date("2026-03-07T23:50:00+08:00"), "en", shanghai, march)).toBe("Mar 7");
	expect(recordingNoteDate(undefined, "en", shanghai, now)).toBeNull();
	// The same instant is still the 31st in New York, so it is today there, not yesterday.
	expect(recordingNoteDate(+new Date("2026-12-31T23:55:00+08:00"), "en", "America/New_York", now)).toBe("Today");
});

test("duration truncates lower units and distinguishes zero from absent or invalid durations", () => {
	expect(recordingNoteDuration(0)).toEqual({ unit: "Seconds", seconds: 0 });
	expect(recordingNoteDuration(59999)).toEqual({ unit: "Seconds", seconds: 59 });
	expect(recordingNoteDuration(60000)).toEqual({ unit: "Minutes", minutes: 1 });
	expect(recordingNoteDuration(3599999)).toEqual({ unit: "Minutes", minutes: 59 });
	expect(recordingNoteDuration(3600000)).toEqual({ unit: "Hours", hours: 1 });
	expect(recordingNoteDuration(4128999)).toEqual({ unit: "HoursMinutes", hours: 1, minutes: 8 });
	expect(recordingNoteDuration(undefined)).toBeNull();
	expect(recordingNoteDuration(-100)).toBeNull();
	expect(recordingNoteDuration(Infinity)).toBeNull();
});

test("recording clock times are read in the account's zone and keep which day a range ended", () => {
	const zone = "Asia/Shanghai";
	const start = +new Date("2026-12-31T23:59:05+08:00");
	expect(recordingNoteTimeRange(start, start + 20_000, "en", zone)).toBe("23:59");
	expect(recordingNoteTimeRange(start - 120_000, start, "zh-CN", zone)).toBe("23:57–23:59");
	expect(recordingNoteTimeRange(start, +new Date("2027-01-01T00:04:00+08:00"), "zh-CN", zone)).toMatch(
		/^23:59 – 2027年1月1日 00:04$/,
	);
	expect(recordingNoteTimeRange(start, undefined, "en", zone)).toBeNull();
	expect(recordingNoteTimeRange(0, start, "en", zone)).toBeNull();
	expect(recordingNoteTimeRange(start, Number.NaN, "en", zone)).toBeNull();
	expect(recordingNoteTimeRange(start, start - 1, "en", zone)).toBeNull();
	// Across a daylight-saving change the two ends carry different offsets: no range is claimed.
	const springForward = +new Date("2027-03-14T01:58:00-05:00");
	expect(recordingNoteTimeRange(springForward, springForward + 6 * 60_000, "en", "America/New_York")).toBeNull();
});

test("recordings from older servers still render without a progress field", () => {
	expect(recordingNoteProgress(undefined)).toBeNull();
	const progress = { completedBatches: 1, totalBatches: 4, percent: 25 };
	expect(recordingNoteProgress(progress)).toEqual(progress);
	expect(recordingNoteProgress({ completedBatches: 4, totalBatches: 4, percent: 100 })).toBeNull();
});

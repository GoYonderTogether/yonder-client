import { expect, test } from "vitest";
import { recordingNoteDate, recordingNoteDuration } from "./meeting-message-summary.ts";

test("recording dates compare local calendar days, including New Year and earlier dates", () => {
	const now = new Date(2027, 0, 1, 0, 5);
	expect(recordingNoteDate(+new Date(2026, 11, 31, 23, 55), "zh-CN", now)).toBe("昨天");
	expect(recordingNoteDate(+new Date(2027, 0, 1), "en", now)).toBe("Today");
	expect(recordingNoteDate(+new Date(2026, 11, 30), "en", now)).toBe("Dec 30, 2026");
	const march = new Date(2026, 2, 9, 0, 30);
	expect(recordingNoteDate(+new Date(2026, 2, 8, 23, 50), "en", march)).toBe("Yesterday");
	expect(recordingNoteDate(+new Date(2026, 2, 7, 23, 50), "en", march)).toBe("Mar 7");
	expect(recordingNoteDate(undefined, "en", now)).toBeNull();
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

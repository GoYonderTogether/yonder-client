import { describe, expect, test } from "vitest";
import {
	addDays,
	daysAgo,
	deviceTimeZone,
	formatCalendarDay,
	formatCalendarWeekday,
	formatInstant,
	formatOffset,
	localDay,
	msUntilNextMinute,
	relativeDay,
	startOfDayInZone,
	supportsIanaTimeZones,
	timeZoneChoices,
	timeZoneCity,
	timeZoneCityLabel,
	timeZoneDisplayName,
	timeZoneFriendlyName,
	zonedParts,
	zoneOffsetLabel,
	zoneOffsetMinutes,
} from "./index.ts";

/** The fixed instant the acceptance run uses: 2026-11-25T11:58:15Z. */
const INSTANT = "2026-11-25T11:58:15Z";

describe("formatInstant", () => {
	test("reads the same instant in three zones, never the device's", () => {
		const at = { locale: "zh-CN", style: "time" } as const;
		expect(formatInstant(INSTANT, { ...at, zone: "Asia/Shanghai" })).toBe("19:58");
		expect(formatInstant(INSTANT, { ...at, zone: "Asia/Singapore" })).toBe("19:58");
		expect(formatInstant(INSTANT, { ...at, zone: "America/New_York" })).toBe("06:58");
	});

	test("a date keeps the zone's own calendar day", () => {
		expect(formatInstant(INSTANT, { zone: "Asia/Shanghai", locale: "en", style: "monthDay", width: "short" })).toBe(
			"Nov 25",
		);
		expect(formatInstant(INSTANT, { zone: "Asia/Shanghai", locale: "en", style: "date", width: "short" })).toBe(
			"11/25/26",
		);
		expect(
			formatInstant("2026-11-25T03:00:00Z", {
				zone: "America/Los_Angeles",
				locale: "en",
				style: "monthDay",
				width: "short",
			}),
		).toBe("Nov 24");
	});

	test("a date and a clock together, with seconds on request", () => {
		expect(formatInstant(INSTANT, { zone: "Asia/Shanghai", locale: "en", style: "dateTime", width: "short" })).toBe(
			"11/25/26, 7:58 PM",
		);
		expect(formatInstant(INSTANT, { zone: "Asia/Shanghai", locale: "en", style: "time", seconds: true })).toBe(
			"19:58:15",
		);
		expect(formatInstant(INSTANT, { zone: "Asia/Shanghai", locale: "en", style: "dateTime", width: "long" })).toBe(
			"Nov 25, 19:58",
		);
	});

	test("a weekday name is the zone's weekday", () => {
		// 2026-11-24T16:30Z is Wednesday in Shanghai and Tuesday in New York.
		expect(formatInstant("2026-11-24T16:30:00Z", { zone: "Asia/Shanghai", locale: "en", style: "weekday" })).toBe(
			"Wed",
		);
		expect(formatInstant("2026-11-24T16:30:00Z", { zone: "America/New_York", locale: "en", style: "weekday" })).toBe(
			"Tue",
		);
	});

	test("year: auto drops the year only inside the zone's current year", () => {
		const twoYearsAgo = "2024-06-01T12:00:00Z";
		expect(formatInstant(twoYearsAgo, { zone: "Asia/Shanghai", locale: "en", style: "date", year: "auto" })).toContain(
			"2024",
		);
		const options = { zone: "Asia/Shanghai", locale: "en", style: "date", year: "always" } as const;
		expect(formatInstant(INSTANT, options)).toContain("2026");
	});

	test("a value that is not an instant comes back as the server sent it", () => {
		expect(formatInstant("not-a-time", { zone: "Asia/Shanghai", locale: "en", style: "time" })).toBe("not-a-time");
	});

	test("an unknown zone name falls back to UTC rather than throwing", () => {
		expect(formatInstant(INSTANT, { zone: "Not/AZone", locale: "en", style: "time" })).toBe("11:58");
	});
});

describe("calendar days", () => {
	test("the same instant is a different day in Shanghai and New York", () => {
		expect(localDay("2026-11-24T16:30:00Z", "Asia/Shanghai")).toBe("2026-11-25");
		expect(localDay("2026-11-24T16:30:00Z", "America/New_York")).toBe("2026-11-24");
	});

	test("addDays crosses a month and a year", () => {
		expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});

	test("startOfDayInZone lands on the zone's midnight, across a DST change", () => {
		// New York moves to daylight time on 2027-03-14; the day starts at 04:00Z, not 05:00Z.
		expect(startOfDayInZone("2027-03-14", "America/New_York").toISOString()).toBe("2027-03-14T05:00:00.000Z");
		expect(startOfDayInZone("2027-03-15", "America/New_York").toISOString()).toBe("2027-03-15T04:00:00.000Z");
		expect(startOfDayInZone("2026-11-25", "Asia/Shanghai").toISOString()).toBe("2026-11-24T16:00:00.000Z");
	});

	test("daysAgo counts calendar days in the zone, not 24-hour blocks", () => {
		const nearMidnight = new Date("2026-11-25T00:30:00+08:00");
		expect(daysAgo("2026-11-25", nearMidnight, "Asia/Shanghai")).toBe(0);
		expect(daysAgo("2026-11-24", nearMidnight, "Asia/Shanghai")).toBe(1);
		// The same instant is still the 24th in New York.
		const newYorkNow = new Date("2026-11-25T00:30:00+08:00");
		expect(daysAgo("2026-11-24", newYorkNow, "America/New_York")).toBe(0);
	});

	test("relativeDay names today, yesterday and tomorrow in the zone", () => {
		const now = new Date("2026-11-25T00:00:30+08:00");
		expect(relativeDay("2026-11-25", now, "Asia/Shanghai")).toBe("today");
		expect(relativeDay("2026-11-24", now, "Asia/Shanghai")).toBe("yesterday");
		expect(relativeDay("2026-11-26", now, "Asia/Shanghai")).toBe("tomorrow");
		expect(relativeDay("2026-11-20", now, "Asia/Shanghai")).toBe("past");
	});

	test("formatCalendarDay reads a stored day without moving it", () => {
		expect(formatCalendarDay("2026-11-25", { locale: "en" })).toBe("11/25");
		expect(formatCalendarDay("2026-11-25", { locale: "en", width: "short", year: "always" })).toContain("2026");
		expect(formatCalendarWeekday("2026-11-25", "en")).toBe("Wed");
		expect(formatCalendarWeekday("2026-11-25", "zh-CN")).toBe("周三");
	});
});

describe("offsets", () => {
	test("an offset is computed for the moment asked about, so DST changes", () => {
		expect(zoneOffsetMinutes("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
		expect(zoneOffsetMinutes("America/New_York", new Date("2026-07-15T12:00:00Z"))).toBe(-240);
		expect(zoneOffsetMinutes("Asia/Shanghai", new Date("2026-07-15T12:00:00Z"))).toBe(480);
	});

	test("an offset label reads UTC±X:XX, and never a zero-padded minute on the hour", () => {
		expect(formatOffset(480)).toBe("UTC+8");
		expect(formatOffset(-240)).toBe("UTC-4");
		expect(formatOffset(330)).toBe("UTC+5:30");
		expect(formatOffset(0)).toBe("UTC+0");
		expect(zoneOffsetLabel("Asia/Kathmandu", new Date("2026-11-25T00:00:00Z"))).toBe("UTC+5:45");
	});

	test("a zone's city and long name are readable in both languages", () => {
		expect(timeZoneCity("America/New_York")).toBe("New York");
		expect(timeZoneCity("Asia/Shanghai")).toBe("Shanghai");
		expect(timeZoneDisplayName("Asia/Shanghai", "en")).toBe("China Standard Time");
		expect(timeZoneDisplayName("Asia/Shanghai", "zh-CN")).toBe("中国标准时间");
	});

	test("a zone is named the way a reader says it", () => {
		expect(timeZoneCityLabel("America/New_York", "zh-CN")).toBe("纽约");
		expect(timeZoneCityLabel("America/New_York", "en")).toBe("New York");
		expect(timeZoneCityLabel("Pacific/Chatham", "zh-CN")).toBe("Chatham");
		expect(timeZoneFriendlyName("Asia/Shanghai", "zh-CN")).toBe("北京时间");
		expect(timeZoneFriendlyName("Asia/Shanghai", "en")).toBe("Shanghai");
	});

	test("the zone list is sorted by offset, then by city, and honours the moment's offsets", () => {
		const choices = timeZoneChoices("en", new Date("2026-07-15T12:00:00Z"));
		expect(choices.length).toBeGreaterThan(100);
		for (let index = 1; index < choices.length; index += 1) {
			const previous = choices[index - 1];
			const current = choices[index];
			expect(previous?.offsetMinutes).toBeLessThanOrEqual(current?.offsetMinutes ?? 0);
		}
		const newYork = choices.find((choice) => choice.zone === "America/New_York");
		expect(newYork?.offsetLabel).toBe("UTC-4");
		expect(choices.some((choice) => choice.zone === "UTC")).toBe(true);
	});

	test("zonedParts gives the wall clock of an instant in a zone", () => {
		expect(zonedParts("Asia/Shanghai", new Date(INSTANT))).toMatchObject({
			year: 2026,
			month: 11,
			day: 25,
			hour: 19,
			minute: 58,
			second: 15,
		});
	});
});

describe("runtime support", () => {
	test("this runtime honours IANA names, which the mini program may not", () => {
		expect(supportsIanaTimeZones()).toBe(true);
		expect(deviceTimeZone()).toMatch(/^[A-Za-z]+\/[A-Za-z_+-]+$|^UTC$/);
	});

	test("the minute ticker lands on the next whole minute of the zone", () => {
		expect(msUntilNextMinute(new Date("2026-11-25T11:58:15Z"), "Asia/Shanghai")).toBe(45_000);
		expect(msUntilNextMinute(new Date("2026-11-25T11:58:00.250Z"), "Asia/Shanghai")).toBe(59_750);
	});
});

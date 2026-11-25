/**
 * `@yonder/ui-time` — the one module that turns an instant into words a person reads, and the one
 * place that decides which zone "today" means. Everything here is pure and has no React, no i18n
 * instance and no server state, so the web app, the desktop shell and the mini program run the
 * same rules (architecture 分层: a leaf package both runtimes can import).
 *
 * Why a package of its own rather than a folder in `ui/data`: the mini program does not install
 * `ui/data` (React 19 and TanStack Query), but it must format times with the account's zone too.
 * `ui/i18n` carries i18next at import time for the same reason. This package carries nothing.
 *
 * Rules:
 *   - No formatter here ever reads the device's zone except `deviceTimeZone()`, which exists to be
 *     the fallback when the account has not chosen one.
 *   - Every `Intl.DateTimeFormat` names a `timeZone`. `tools/check-local-time.mjs` enforces that
 *     outside this package.
 *   - A zone is an IANA name. A bare offset cannot express daylight saving, so callers store and
 *     pass the name; offsets are only computed for display and sorting.
 */

export type InstantInput = string | number | Date;

export interface InstantFormat {
	/** The IANA zone the instant is read in. Required: there is no implicit device zone here. */
	zone: string;
	/** A BCP-47 language tag, e.g. `zh-CN` or `en`. */
	locale: string;
	/**
	 * - `time`: a clock, 24-hour (`19:58`); `seconds` adds seconds.
	 * - `date`: a calendar date; `width` picks short/medium/long; `year: "auto"` drops the year
	 *   when it is the reader's current year in this zone.
	 * - `dateTime`: a date and a clock together.
	 * - `monthDay`: a month and a day, for a calendar day or a monthly reset.
	 * - `weekday`: the weekday name.
	 */
	style: "time" | "date" | "dateTime" | "monthDay" | "weekday";
	/** `short` / `medium` / `long`, where the style has widths. `monthDay` also takes `numeric`. */
	width?: "numeric" | "short" | "medium" | "long";
	seconds?: boolean;
	year?: "auto" | "always" | "never";
}

/** The device's own IANA zone, or `UTC` when the runtime cannot name one. */
export function deviceTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

let ianaSupport: boolean | undefined;

/**
 * Whether this runtime honours an IANA name at all. The mini program's older Android engine has
 * `Intl.DateTimeFormat` but ignores `timeZone`, which would silently print the device's own clock;
 * probe it once and take the fixed-offset path below when it does not.
 */
export function supportsIanaTimeZones(): boolean {
	if (ianaSupport !== undefined) return ianaSupport;
	try {
		const options: Intl.DateTimeFormatOptions = { timeZone: "Asia/Shanghai", hour: "numeric", hourCycle: "h23" };
		const shanghai = new Intl.DateTimeFormat("en-US", options).format(new Date(0));
		const utc = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(0));
		ianaSupport = shanghai !== utc;
	} catch {
		ianaSupport = false;
	}
	return ianaSupport;
}

/**
 * Fixed offsets (minutes east of UTC) for the fallback path only. Daylight saving is not modelled;
 * callers that need an exact hour on a runtime without IANA names get the standard offset. The
 * mini program reads this when `supportsIanaTimeZones()` is false.
 */
const FALLBACK_OFFSETS: Record<string, number> = {
	UTC: 0,
	"Asia/Shanghai": 480,
	"Asia/Singapore": 480,
	"Asia/Hong_Kong": 480,
	"Asia/Macau": 480,
	"Asia/Taipei": 480,
	"Asia/Tokyo": 540,
	"Asia/Seoul": 540,
	"Asia/Bangkok": 420,
	"Asia/Jakarta": 420,
	"Asia/Kolkata": 330,
	"Asia/Dubai": 240,
	"Asia/Riyadh": 180,
	"Europe/London": 0,
	"Europe/Paris": 60,
	"Europe/Berlin": 60,
	"Europe/Moscow": 180,
	"Africa/Cairo": 120,
	"Africa/Johannesburg": 120,
	"America/Sao_Paulo": -180,
	"America/New_York": -300,
	"America/Chicago": -360,
	"America/Denver": -420,
	"America/Los_Angeles": -480,
	"America/Vancouver": -480,
	"Pacific/Auckland": 720,
	"Australia/Sydney": 600,
	"Australia/Perth": 480,
};

/** The zone name the runtime actually accepts, or `null` when it is not an IANA zone. */
export function canonicalTimeZone(zone: string | null | undefined): string | null {
	if (!zone) return null;
	if (!supportsIanaTimeZones()) return zone in FALLBACK_OFFSETS ? zone : normalizeOffsetZone(zone);
	try {
		return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
	} catch {
		return null;
	}
}

function normalizeOffsetZone(zone: string): string | null {
	return /^[+-]\d{2}:?\d{2}$/u.test(zone) ? zone : null;
}

function fallbackOffset(zone: string): number {
	if (zone in FALLBACK_OFFSETS) return FALLBACK_OFFSETS[zone] as number;
	const match = /^([+-])(\d{2}):?(\d{2})$/u.exec(zone);
	if (match) {
		const minutes = Number(match[2]) * 60 + Number(match[3]);
		return match[1] === "-" ? -minutes : minutes;
	}
	return 0;
}

/** The wall clock of `instant` a fixed offset east of UTC produces, as plain numbers. */
function localPartsWithOffset(instant: Date, zone: string): ZonedParts {
	const shifted = new Date(instant.getTime() + fallbackOffset(zone) * 60_000);
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
		hour: shifted.getUTCHours(),
		minute: shifted.getUTCMinutes(),
		second: shifted.getUTCSeconds(),
	};
}

function zonedPartsWithZone(zone: string, instant: Date): ZonedParts {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = formatter.formatToParts(instant);
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
	return {
		year: Number(value("year")),
		month: Number(value("month")),
		day: Number(value("day")),
		hour: Number(value("hour")),
		minute: Number(value("minute")),
		second: Number(value("second")),
	};
}

/** The wall clock of `instant` in `zone`, as plain numbers. */
export interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

export function zonedParts(zone: string, instant: Date): ZonedParts {
	if (supportsIanaTimeZones()) return zonedPartsWithZone(zone, instant);
	return localPartsWithOffset(instant, zone);
}

/**
 * The zone's offset from UTC at `instant`, in minutes east. Computed with `Intl` for the moment
 * asked about, so a daylight-saving change is the right hour on the right day; never a constant.
 */
export function zoneOffsetMinutes(zone: string, instant: Date = new Date()): number {
	if (!supportsIanaTimeZones()) return fallbackOffset(zone);
	const parts = zonedPartsWithZone(zone, instant);
	const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
	return Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** `UTC+8`, `UTC+5:30`, `UTC-4`, `UTC+0` — the label a person reads, never a stored value. */
export function formatOffset(minutes: number): string {
	const sign = minutes < 0 ? "-" : "+";
	const absolute = Math.abs(minutes);
	const hours = Math.floor(absolute / 60);
	const rest = absolute % 60;
	return rest === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(rest).padStart(2, "0")}`;
}

/** `UTC+8` for the zone at this instant. */
export function zoneOffsetLabel(zone: string, instant: Date = new Date()): string {
	return formatOffset(zoneOffsetMinutes(zone, instant));
}

/** The city an IANA name ends in: `America/New_York` → `New York`. */
/** The city an IANA name ends in: `America/New_York` → `New York`. */
export function timeZoneCity(zone: string): string {
	if (normalizeOffsetZone(zone) || zone === "UTC") return zone;
	const last = zone.split("/").at(-1) ?? zone;
	return last.replaceAll("_", " ");
}

/** The zone's own long name in a reader's language (`中国标准时间`), or the city when unavailable. */
export function timeZoneDisplayName(zone: string, locale: string): string {
	if (!supportsIanaTimeZones()) return timeZoneCity(zone);
	try {
		const parts = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(
			new Date(),
		);
		return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZoneCity(zone);
	} catch {
		return timeZoneCity(zone);
	}
}

/** One choice in a zone list. */
export interface TimeZoneChoice {
	zone: string;
	city: string;
	displayName: string;
	offsetMinutes: number;
	offsetLabel: string;
}

/**
 * Every zone this runtime knows, each with its offset at `instant`, sorted by offset and then by
 * city (the order Apple and Google use in their zone pickers). Offsets are read for that moment,
 * not baked in, so the list shows summer time in July.
 */
export function timeZoneChoices(locale: string, instant: Date = new Date()): TimeZoneChoice[] {
	const names = supportsIanaTimeZones() ? (Intl.supportedValuesOf?.("timeZone") ?? []) : Object.keys(FALLBACK_OFFSETS);
	const zones = [...names];
	if (!zones.includes("UTC")) zones.push("UTC");
	return zones
		.map((zone) => {
			const offsetMinutes = zoneOffsetMinutes(zone, instant);
			return {
				zone,
				city: timeZoneCity(zone),
				displayName: timeZoneDisplayName(zone, locale),
				offsetMinutes,
				offsetLabel: formatOffset(offsetMinutes),
			};
		})
		.sort((left, right) => left.offsetMinutes - right.offsetMinutes || left.city.localeCompare(right.city, "en"));
}

function toDate(input: InstantInput): Date | null {
	const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How an instant reads in a zone. An unreadable input is returned as it came, so a bad server value
 * shows what the server sent rather than an invented time.
 */
export function formatInstant(input: InstantInput, format: InstantFormat): string {
	const date = toDate(input);
	if (!date) return typeof input === "string" ? input : "";
	const zoneName = canonicalTimeZone(format.zone) ?? "UTC";
	const { locale, style, width = "medium", seconds = false, year = "never" } = format;
	if (!supportsIanaTimeZones()) return formatWithFallback(date, zoneName, { locale, style, width, seconds, year });
	const currentYear = zonedPartsWithZone(zoneName, new Date()).year;
	const instantYear = zonedPartsWithZone(zoneName, date).year;
	const withYear = year === "always" || (year === "auto" && currentYear !== instantYear);

	let options: Intl.DateTimeFormatOptions;
	if (style === "time") {
		options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(seconds && { second: "2-digit" }) };
	} else if (style === "date") {
		options =
			width === "short"
				? { dateStyle: "short" }
				: width === "medium"
					? withYear
						? { dateStyle: "medium" }
						: { month: "short", day: "numeric" }
					: { month: "short", day: "numeric", ...(withYear && { year: "numeric" }) };
	} else if (style === "dateTime") {
		options =
			width === "short"
				? { dateStyle: "short", timeStyle: "short" }
				: width === "medium"
					? { dateStyle: "medium", timeStyle: "short" }
					: {
							month: "short",
							day: "numeric",
							...(withYear && { year: "numeric" }),
							hour: "2-digit",
							minute: "2-digit",
							hourCycle: "h23",
						};
	} else if (style === "monthDay") {
		options = {
			month: width === "long" ? "long" : width === "short" ? "short" : "numeric",
			day: "numeric",
			...(withYear && { year: "numeric" }),
		};
	} else {
		options = { weekday: width === "long" ? "long" : "short" };
	}
	try {
		return new Intl.DateTimeFormat(locale, { ...options, timeZone: zoneName }).format(date);
	} catch {
		return formatWithFallback(date, zoneName, { locale, style, width, seconds, year });
	}
}

/**
 * The same reading without IANA support: a fixed offset and the reader's own clock shape. Only the
 * mini program's oldest runtime reaches this; it is correct except across daylight saving, which
 * the fallback table does not model.
 */
function formatWithFallback(date: Date, zone: string, format: Omit<InstantFormat, "zone">): string {
	const { locale, style, width = "medium", seconds = false, year = "never" } = format;
	const shifted = localPartsWithOffset(date, zone);
	const pad = (value: number) => String(value).padStart(2, "0");
	const clock = `${pad(shifted.hour)}:${pad(shifted.minute)}${seconds ? `:${pad(shifted.second)}` : ""}`;
	const currentYear = new Date().getUTCFullYear();
	const withYear = year === "always" || (year === "auto" && shifted.year !== currentYear);
	const dayName = new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		month: width === "long" ? "long" : width === "short" ? "short" : "numeric",
		day: "numeric",
		...(withYear && { year: "numeric" }),
	}).format(new Date(Date.UTC(shifted.year, shifted.month - 1, shifted.day, 12)));
	if (style === "time") return clock;
	if (style === "date") return dayName;
	if (style === "monthDay")
		return new Intl.DateTimeFormat(locale, {
			timeZone: "UTC",
			month: width === "long" ? "long" : width === "short" ? "short" : "numeric",
			day: "numeric",
		}).format(new Date(Date.UTC(shifted.year, shifted.month - 1, shifted.day, 12)));
	if (style === "weekday")
		return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: width === "long" ? "long" : "short" }).format(
			new Date(Date.UTC(shifted.year, shifted.month - 1, shifted.day, 12)),
		);
	return `${dayName} ${clock}`;
}

/** `YYYY-MM-DD` — the calendar day `instant` falls on in `zone`. The one definition of "today". */
export function localDay(input: InstantInput, zone: string): string {
	const date = toDate(input);
	if (!date) return typeof input === "string" ? input.slice(0, 10) : "";
	const parts = zonedParts(zone, date);
	return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** `day` shifted by whole calendar days, without touching any clock (safe across DST). */
export function addDays(day: string, delta: number): string {
	const [year, month, date] = day.split("-").map(Number);
	const shifted = new Date(Date.UTC(year as number, (month as number) - 1, (date as number) + delta, 12));
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** The instant at which the calendar day `day` starts in `zone`; a DST change is accounted for. */
export function startOfDayInZone(day: string, zone: string): Date {
	const [year, month, date] = day.split("-").map(Number);
	const utcGuess = Date.UTC(year as number, (month as number) - 1, date as number);
	if (!supportsIanaTimeZones()) return new Date(utcGuess - fallbackOffset(zone) * 60_000);
	const first = utcGuess - zoneOffsetMinutes(zone, new Date(utcGuess)) * 60_000;
	// One refinement lands on the right side of a change that happens at the day's own midnight.
	return new Date(utcGuess - zoneOffsetMinutes(zone, new Date(first)) * 60_000);
}

/**
 * A `YYYY-MM-DD` calendar day written out. A day has no instants of its own, so it is formatted in
 * UTC: a device zone could move it a day either way and would be wrong.
 */
export function formatCalendarDay(
	day: string,
	options: { locale: string; width?: "numeric" | "short" | "long"; year?: "auto" | "always" | "never" },
): string {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return day;
	const currentYear = new Date().getUTCFullYear();
	const includeYear = options.year === "always" || (options.year === "auto" && year !== currentYear);
	return new Intl.DateTimeFormat(options.locale, {
		timeZone: "UTC",
		month: options.width === "long" ? "long" : options.width === "short" ? "short" : "numeric",
		day: "numeric",
		...(includeYear && { year: "numeric" }),
	}).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

/** The weekday a `YYYY-MM-DD` day falls on, written out in a language. */
export function formatCalendarWeekday(day: string, locale: string, width: "short" | "long" = "short"): string {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return day;
	return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: width }).format(
		new Date(Date.UTC(year, month - 1, date, 12)),
	);
}

/** Whole calendar days from `day` to `now`'s day in `zone`; positive is the past. */
export function daysAgo(day: string, now: Date, zone: string): number {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return 0;
	const [todayYear, todayMonth, todayDate] = localDay(now, zone).split("-").map(Number);
	const start = Date.UTC(year, month - 1, date);
	const end = Date.UTC(todayYear as number, (todayMonth as number) - 1, todayDate as number);
	return Math.round((end - start) / 86_400_000);
}

/** How long to sleep to land on the next whole minute of the reader's clock. */
export function msUntilNextMinute(now: Date, zone: string): number {
	const shifted = now.getTime() + zoneOffsetMinutes(zone, now) * 60_000;
	return 60_000 - (shifted % 60_000);
}

/** Where a calendar day stands relative to `now` in `zone`, for 「今天」-style labels. */
export function relativeDay(
	day: string,
	now: Date,
	zone: string,
): "today" | "yesterday" | "tomorrow" | "past" | "future" {
	const ago = daysAgo(day, now, zone);
	if (ago === 0) return "today";
	if (ago === 1) return "yesterday";
	if (ago === -1) return "tomorrow";
	return ago > 1 ? "past" : "future";
}

/**
 * The city each zone is known by, in Chinese where there is a common name and in the IANA name's
 * own words otherwise. Apple's picker shows 纽约/New York the same way; a zone whose city has no
 * Chinese name keeps the name the tz database gives it, which every platform shows as-is.
 */
const ZH_CITY_NAMES: Record<string, string> = {
	UTC: "协调世界时",
	"Asia/Shanghai": "上海",
	"Asia/Chongqing": "重庆",
	"Asia/Harbin": "哈尔滨",
	"Asia/Hong_Kong": "香港",
	"Asia/Macau": "澳门",
	"Asia/Taipei": "台北",
	"Asia/Singapore": "新加坡",
	"Asia/Tokyo": "东京",
	"Asia/Seoul": "首尔",
	"Asia/Bangkok": "曼谷",
	"Asia/Jakarta": "雅加达",
	"Asia/Kolkata": "加尔各答",
	"Asia/Dubai": "迪拜",
	"Asia/Riyadh": "利雅得",
	"Europe/London": "伦敦",
	"Europe/Paris": "巴黎",
	"Europe/Berlin": "柏林",
	"Europe/Moscow": "莫斯科",
	"Africa/Cairo": "开罗",
	"Africa/Johannesburg": "约翰内斯堡",
	"America/New_York": "纽约",
	"America/Chicago": "芝加哥",
	"America/Denver": "丹佛",
	"America/Los_Angeles": "洛杉矶",
	"America/Vancouver": "温哥华",
	"America/Sao_Paulo": "圣保罗",
	"Pacific/Auckland": "奥克兰",
	"Australia/Sydney": "悉尼",
	"Australia/Perth": "珀斯",
};

/** A zone's city as a reader of `locale` names it. */
export function timeZoneCityLabel(zone: string, locale: string): string {
	const city = timeZoneCity(zone);
	if (locale.toLowerCase().startsWith("zh")) return ZH_CITY_NAMES[zone] ?? city;
	return city;
}

/**
 * The name a person knows a zone by in daily speech: `北京时间` for Shanghai, else its city. This
 * is what a settings row says after the zone is locked.
 */
export function timeZoneFriendlyName(zone: string, locale: string): string {
	if (locale.toLowerCase().startsWith("zh") && zone === "Asia/Shanghai") return "北京时间";
	return timeZoneCityLabel(zone, locale);
}

/** The calendar year of `instant` in `zone`. */
export function yearInZone(instant: InstantInput, zone: string): number {
	const date = toDate(instant);
	if (!date) return Number.NaN;
	return zonedParts(zone, date).year;
}

import { addDays, formatInstant, localDay, yearInZone, zoneOffsetMinutes } from "@yonder/ui-time";

function recordingDate(timestamp: number | undefined) {
	return timestamp != null && timestamp > 0 && timestamp <= 8.64e15 ? new Date(timestamp) : null;
}

/**
 * A recording's date as the reader says it — 今天, 昨天, else the calendar day — read in the
 * account's zone (2026-11-25), so a recording made at 00:30 says the same day on every device.
 */
export function recordingNoteDate(
	startedAt: number | undefined,
	locale: string | undefined,
	zone: string,
	now = new Date(),
) {
	const start = recordingDate(startedAt);
	if (!start) return null;
	const lang = locale ?? "en";
	const day = localDay(start, zone);
	const today = localDay(now, zone);
	const relative = day === today ? 0 : day === addDays(today, -1) ? -1 : null;
	if (relative !== null)
		return new Intl.RelativeTimeFormat(lang, { numeric: "auto" })
			.format(relative, "day")
			.replace(/^./, (initial) => initial.toLocaleUpperCase(lang));
	// The year is the account zone's own, compared with the reader's, so 「12月30日」 and
	// 「Dec 30, 2026」 agree on the boundary rather than following the machine's year.
	const withYear = yearInZone(start, zone) !== yearInZone(now, zone);
	return formatInstant(start, {
		zone,
		locale: lang,
		style: "date",
		width: "medium",
		year: withYear ? "always" : "never",
	});
}

export function recordingNoteDuration(durationMs: number | undefined) {
	if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return null;
	const seconds = Math.floor(durationMs / 1000);
	if (seconds < 60) return { unit: "Seconds", seconds } as const;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return { unit: "Minutes", minutes } as const;
	const hours = Math.floor(minutes / 60);
	return minutes % 60
		? ({ unit: "HoursMinutes", hours, minutes: minutes % 60 } as const)
		: ({ unit: "Hours", hours } as const);
}

// A range is optional: do not infer its end from duration or render ambiguous DST ranges.
export function recordingNoteTimeRange(
	startedAt: number | undefined,
	endedAt: number | undefined,
	locale: string | undefined,
	zone: string,
) {
	const start = recordingDate(startedAt);
	const end = recordingDate(endedAt);
	if (!start || !end || end < start) return null;
	const lang = locale ?? "en";
	// A range whose two ends fall on different sides of a daylight-saving change is ambiguous; it
	// says nothing rather than inventing an offset.
	if (zoneOffsetMinutes(zone, start) !== zoneOffsetMinutes(zone, end)) return null;
	const from = formatInstant(start, { zone, locale: lang, style: "time" });
	if (localDay(start, zone) === localDay(end, zone)) {
		const to = formatInstant(end, { zone, locale: lang, style: "time" });
		return from === to ? from : `${from}–${to}`;
	}
	const endLabel = formatInstant(end, { zone, locale: lang, style: "dateTime", width: "long", year: "auto" });
	return `${from} – ${endLabel}`;
}

/**
 * The progress line a recording shows while its transcript is still being recognized: the same
 * completed/total batches and percentage the Bot reads from `meeting_view`, so the owner and the
 * Bot state one number. Finished or unstarted recordings show nothing here.
 */
export function recordingNoteProgress(progress?: { completedBatches: number; totalBatches: number; percent: number }) {
	return progress && progress.totalBatches > 0 && progress.percent < 100 ? progress : null;
}

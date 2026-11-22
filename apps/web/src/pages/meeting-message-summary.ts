function recordingDate(timestamp: number | undefined) {
	return timestamp != null && timestamp > 0 && timestamp <= 8.64e15 ? new Date(timestamp) : null;
}

export function recordingNoteDate(startedAt: number | undefined, locale: string | undefined, now = new Date()) {
	const start = recordingDate(startedAt);
	if (!start) return null;
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	const today = start.toDateString() === now.toDateString();
	if (today || start.toDateString() === yesterday.toDateString())
		return new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
			.format(today ? 0 : -1, "day")
			.replace(/^./, (initial) => initial.toLocaleUpperCase(locale));
	return new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		...(start.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
	}).format(start);
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
) {
	const start = recordingDate(startedAt);
	const end = recordingDate(endedAt);
	if (!start || !end || end < start || start.getTimezoneOffset() !== end.getTimezoneOffset()) return null;
	const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
	const from = clock.format(start);
	if (start.toDateString() === end.toDateString()) {
		const to = clock.format(end);
		return from === to ? from : `${from}–${to}`;
	}
	const endLabel = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		...(start.getFullYear() !== end.getFullYear() ? { year: "numeric" } : {}),
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(end);
	return `${from} – ${endLabel}`;
}

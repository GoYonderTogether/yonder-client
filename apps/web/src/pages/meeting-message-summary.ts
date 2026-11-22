export function recordingNoteDate(startedAt: number | undefined, locale: string | undefined, now = new Date()) {
	if (startedAt == null || !Number.isFinite(startedAt) || startedAt <= 0 || startedAt > 8.64e15) return null;
	const start = new Date(startedAt);
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

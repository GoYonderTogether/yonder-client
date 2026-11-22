import type { Schedule, ScheduleKind, ScheduleRunResult } from "@yonder/protocol";

/**
 * How a plan reads on screen. A recurring plan is a wall-clock time in a named zone, so the text is
 * built from its own fields rather than from the reader's browser zone; only the absolute instants
 * ("next run", "last run") are formatted in the plan's zone, which is the zone the user chose.
 */

/** The local wall clock of `instant` in `timeZone`, as plain numbers. */
export function zonedParts(
	timeZone: string,
	instant: Date,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(instant);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
	return {
		year: Number(value("year")),
		month: Number(value("month")),
		day: Number(value("day")),
		hour: Number(value("hour")),
		minute: Number(value("minute")),
		second: Number(value("second")),
	};
}

function zoneOffsetMs(timeZone: string, instant: Date): number {
	const { year, month, day, hour, minute, second } = zonedParts(timeZone, instant);
	const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	return asUtc - Math.floor(instant.getTime() / 1_000) * 1_000;
}

/**
 * The instant whose wall clock in `timeZone` is the given local time. Used for a one-off plan: the
 * form shows a date and a time in the plan's own zone, not in whatever zone the browser runs in.
 */
export function zonedInstant(
	timeZone: string,
	parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
): Date {
	const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
	const first = naive - zoneOffsetMs(timeZone, new Date(naive));
	const second = naive - zoneOffsetMs(timeZone, new Date(first));
	return new Date(second);
}

/** `2026-11-17T10:00`, or `…T10:00:30` with seconds, in the plan's zone, for a `datetime-local` input. */
export function localInputValue(timeZone: string, instant: Date): string {
	const { year, month, day, hour, minute, second } = zonedParts(timeZone, instant);
	const pad = (value: number) => String(value).padStart(2, "0");
	const base = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
	return second ? `${base}:${pad(second)}` : base;
}

/** The instant a `datetime-local` value names in the plan's zone. */
export function fromLocalInput(timeZone: string, value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
	if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) return null;
	const instant = zonedInstant(timeZone, {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4]),
		minute: Number(match[5]),
		second: Number(match[6] ?? 0),
	});
	return Number.isNaN(instant.getTime()) ? null : instant;
}

/** A wall-clock time as a `time` input value; a one-off plan keeps its own instant. */
export function timeInputValue(plan: Pick<Schedule, "kind" | "at" | "timezone">): string {
	return plan.kind === "once" ? "09:00" : plan.at;
}

/** The translator shape this module needs: one key, no interpolation. */
export type Translate = (key: string) => string;

export function planKindLabel(kind: ScheduleKind, t: Translate): string {
	if (kind === "once") return t("tasks.kindOnce");
	if (kind === "daily") return t("tasks.kindDaily");
	return t("tasks.kindWeekly");
}

/**
 * The one-line plan description: "每天 09:00", "每周 周一、周三 09:00", "2026-11-17 10:00".
 * Weekday names come from the message table, so the line is translated as a whole.
 */
export function describePlan(plan: Pick<Schedule, "kind" | "at" | "weekdays" | "timezone">, t: Translate): string {
	if (plan.kind === "once") {
		const at = new Date(plan.at);
		if (Number.isNaN(at.getTime())) return plan.at;
		const { year, month, day, hour, minute } = zonedParts(plan.timezone, at);
		const pad = (value: number) => String(value).padStart(2, "0");
		return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
	}
	const time = plan.at;
	if (plan.kind === "daily") return `${t("tasks.kindDaily")} ${time}`;
	const days = [...plan.weekdays]
		.sort((left, right) => left - right)
		.map((day) => t(`tasks.weekday${day}`))
		.join("、");
	return `${t("tasks.kindWeekly")} ${days} ${time}`;
}

/** The word for one firing's outcome, as the goals tab and the side panels show it. */
export function resultWord(result: ScheduleRunResult, t: Translate): string {
	return result === "reported"
		? t("tasks.resultReported")
		: result === "skipped"
			? t("tasks.resultSkipped")
			: result === "failed"
				? t("tasks.resultFailed")
				: t("tasks.resultMissed");
}

/** An absolute instant in the plan's own zone, so "next run" never shows a different hour. */
export function formatInstant(timeZone: string, iso: string, locale: string): string {
	const instant = new Date(iso);
	if (Number.isNaN(instant.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		dateStyle: "medium",
		timeStyle: "short",
	}).format(instant);
}

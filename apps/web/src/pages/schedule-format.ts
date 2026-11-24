import type { Schedule, ScheduleRunResult } from "@yonder/protocol";

/**
 * How a plan reads on screen. A recurring plan is a wall-clock time in a named zone, so the text is
 * built from its own fields rather than from the reader's browser zone; only the absolute instants
 * ("next run", "last run") are formatted in the plan's zone, which is the zone the user chose.
 */

/** The translator shape this module needs: one key, no interpolation. */
export type Translate = (key: string) => string;

/**
 * The one status word a plan's row may show (2026-11-24, Meta Muse as the reference): a plan that
 * is not running says so, and has no control either — the Bot is told instead.
 */
export function planStatusKey(status: Schedule["status"]): string | null {
	if (status === "paused") return "tasks.goalState.paused";
	if (status === "ended") return "tasks.planEnded";
	if (status === "missed") return "tasks.resultMissed";
	return null;
}

/** The local wall clock of `instant` in `timeZone`, as plain numbers. */
export function zonedParts(
	timeZone: string,
	instant: Date,
): { year: number; month: number; day: number; hour: number; minute: number } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).formatToParts(instant);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
	return {
		year: Number(value("year")),
		month: Number(value("month")),
		day: Number(value("day")),
		hour: Number(value("hour")),
		minute: Number(value("minute")),
	};
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

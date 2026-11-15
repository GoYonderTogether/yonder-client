export type TimelineScale = "year" | "month" | "week" | "day";

export function dateKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function periodStart(date: Date, scale: TimelineScale) {
	const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	if (scale === "year") result.setMonth(0, 1);
	if (scale === "month") result.setDate(1);
	if (scale === "week") result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
	return result;
}

export function movePeriod(date: Date, scale: TimelineScale, direction: number) {
	const result = new Date(date);
	if (scale === "year" || scale === "month") {
		result.setDate(1);
		if (scale === "year") result.setFullYear(result.getFullYear() + direction);
		else result.setMonth(result.getMonth() + direction);
		result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
	} else result.setDate(result.getDate() + direction * (scale === "week" ? 7 : 1));
	return result;
}

export function periodDays(date: Date, scale: "month" | "week") {
	const start = periodStart(date, scale);
	const count = scale === "week" ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
	return Array.from(
		{ length: count },
		(_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
	);
}

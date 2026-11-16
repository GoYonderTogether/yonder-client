import type { MemoryRefType } from "@yonder/protocol";
import { useEffect, useState } from "react";

/** `YYYY-MM-DD` as a local calendar date. */
export function parseDay(date: string) {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year as number, (month as number) - 1, day as number);
}

export function dayKey(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole calendar days from `date` to `now`; positive means the past. */
export function daysAgo(date: string, now: Date) {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return Math.round((today.getTime() - parseDay(date).getTime()) / 86_400_000);
}

export const REF_LABEL_KEYS: Record<MemoryRefType, string> = {
	file: "memory.refFile",
	place: "memory.refPlace",
	web: "memory.refWeb",
	chat: "memory.refChat",
	recording: "memory.refRecording",
	photo: "memory.refPhoto",
	calendar: "memory.refCalendar",
	device: "memory.refDevice",
};

/** The current minute, so "now" markers move without re-rendering on every tick. */
export function useMinute() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

export function useMemoryFormat() {
	return {
		time: (iso: string | Date, locale: string) =>
			new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
				typeof iso === "string" ? new Date(iso) : iso,
			),
		date: (date: string, locale: string, withYear: boolean) =>
			new Intl.DateTimeFormat(locale, {
				month: "long",
				day: "numeric",
				...(withYear ? { year: "numeric" } : {}),
			}).format(parseDay(date)),
		weekday: (date: string, locale: string) =>
			new Intl.DateTimeFormat(locale, { weekday: "short" }).format(parseDay(date)),
		month: (month: string, locale: string, withYear: boolean) =>
			new Intl.DateTimeFormat(locale, { month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(
				parseDay(`${month}-01`),
			),
	};
}

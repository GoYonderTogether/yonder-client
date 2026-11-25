import type { MemoryActivity, MemoryBlock, MemoryEntry, MemoryKind } from "@yonder/protocol";
import {
	daysAgo as calendarDaysAgo,
	formatCalendarDay,
	formatCalendarWeekday,
	formatInstant,
	msUntilNextMinute,
	yearInZone,
} from "@yonder/ui-time";
import type { LucideIcon } from "lucide-react";
import {
	Bike,
	BookOpen,
	CalendarDays,
	Car,
	Circle,
	Coffee,
	FileText,
	Footprints,
	Images,
	MapPin,
	MessageCircle,
	Mic,
	Moon,
	Music,
	Plane,
	Sparkles,
	Tent,
	TrainFront,
	Trees,
	UtensilsCrossed,
	Waves,
} from "lucide-react";
import { useEffect, useState } from "react";

export const KIND_ICONS: Record<MemoryKind, LucideIcon> = {
	place: MapPin,
	photo: Images,
	doc: FileText,
	voice: Mic,
	chat: MessageCircle,
	ai: Sparkles,
	other: Circle,
};

const ACTIVITY_ICONS: Record<MemoryActivity, LucideIcon> = {
	sleep: Moon,
	walk: Footprints,
	run: Footprints,
	bike: Bike,
	car: Car,
	train: TrainFront,
	flight: Plane,
	food: UtensilsCrossed,
	coffee: Coffee,
	music: Music,
	calendar: CalendarDays,
	camp: Tent,
	book: BookOpen,
	nature: Trees,
	water: Waves,
};

export const entryIcon = (entry: MemoryEntry) =>
	entry.activity ? ACTIVITY_ICONS[entry.activity] : KIND_ICONS[entry.kind];

export const blockAt = (block: MemoryBlock) =>
	Date.parse(block.type === "entry" ? block.entry.at : block.stay.startsAt);

/** `YYYY-MM-DD` as a calendar date at noon UTC: a day has no instants of its own. */
export function parseDay(date: string) {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(Date.UTC(year as number, (month as number) - 1, day as number, 12));
}

/** Whole calendar days from `date` to `now`'s day in the account's zone; positive means the past. */
export function daysAgo(date: string, now: Date, zone: string) {
	return calendarDaysAgo(date, now, zone);
}

export const RELATIVE_DAY: Record<number, string> = {
	0: "memory.today",
	1: "memory.yesterday",
	2: "memory.dayBefore",
	[-1]: "memory.tomorrow",
};

/**
 * The current minute, so "now" markers move without re-rendering on every tick. Each tick lands on
 * the account zone's next whole minute, which is the boundary every clock label changes on.
 */
export function useMinute(zone: string) {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			const current = new Date();
			setNow(current);
			timer = setTimeout(tick, msUntilNextMinute(current, zone));
		};
		tick();
		return () => clearTimeout(timer);
	}, [zone]);
	return now;
}

export const memoryFormat = {
	/** An instant on the account's clock. */
	time: (iso: string | Date, locale: string, zone: string) => formatInstant(iso, { zone, locale, style: "time" }),
	/** A stored `YYYY-MM-DD` day, written out; the zone does not apply to a day. */
	date: (date: string, locale: string, withYear: boolean) =>
		formatCalendarDay(date, { locale, width: "long", year: withYear ? "always" : "never" }),
	weekday: (date: string, locale: string) => formatCalendarWeekday(date, locale),
	number: (value: number, locale: string) => new Intl.NumberFormat(locale).format(value),
	duration: (ms: number) => {
		const seconds = Math.round(ms / 1000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
	},
};

/** The day's name as the reader says it: today, yesterday, or the date. */
export function dayName(date: string, now: Date, t: (key: string) => string, locale: string, zone: string) {
	const ago = daysAgo(date, now, zone);
	const relative = RELATIVE_DAY[ago];
	const withYear = Number(date.slice(0, 4)) !== yearInZone(now, zone);
	return {
		name: relative ? t(relative) : memoryFormat.date(date, locale, withYear),
		sub: relative
			? `${memoryFormat.date(date, locale, false)} ${memoryFormat.weekday(date, locale)}`
			: memoryFormat.weekday(date, locale),
	};
}

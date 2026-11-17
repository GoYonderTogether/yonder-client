import type { MemoryActivity, MemoryBlock, MemoryEntry, MemoryKind } from "@yonder/protocol";
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

/** `YYYY-MM-DD` as a local calendar date. */
export function parseDay(date: string) {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(year as number, (month as number) - 1, day as number);
}

/** Whole calendar days from `date` to `now`; positive means the past. */
export function daysAgo(date: string, now: Date) {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return Math.round((today.getTime() - parseDay(date).getTime()) / 86_400_000);
}

export const RELATIVE_DAY: Record<number, string> = {
	0: "memory.today",
	1: "memory.yesterday",
	2: "memory.dayBefore",
	[-1]: "memory.tomorrow",
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

export const memoryFormat = {
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
	number: (value: number, locale: string) => new Intl.NumberFormat(locale).format(value),
	duration: (ms: number) => {
		const seconds = Math.round(ms / 1000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
	},
};

/** The day's name as the reader says it: today, yesterday, or the date. */
export function dayName(date: string, now: Date, t: (key: string) => string, locale: string) {
	const ago = daysAgo(date, now);
	const relative = RELATIVE_DAY[ago];
	const withYear = parseDay(date).getFullYear() !== now.getFullYear();
	return {
		name: relative ? t(relative) : memoryFormat.date(date, locale, withYear),
		sub: relative
			? `${memoryFormat.date(date, locale, false)} ${memoryFormat.weekday(date, locale)}`
			: memoryFormat.weekday(date, locale),
	};
}

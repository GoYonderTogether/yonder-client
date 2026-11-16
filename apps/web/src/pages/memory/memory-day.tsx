import type { MemoryDay } from "@yonder/protocol";
import { Button, cn } from "@yonder/ui-components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { daysAgo, useMemoryFormat } from "./memory-format.ts";
import { type EntryRow, MemoryEntry, rowTime } from "./memory-rows.tsx";

const RELATIVE: Record<number, string> = {
	0: "memory.today",
	1: "memory.yesterday",
	2: "memory.dayBefore",
	[-1]: "memory.tomorrow",
};

/**
 * One day: a header that pins to the top while the day is on screen (the next day's header pushes
 * it out), then one row per entry. Days older than a week fold to their one-line summary.
 */
export function MemoryDaySection({
	day,
	now,
	full,
	onExpand,
	onToday,
	onOpen,
}: {
	day: MemoryDay;
	now: Date;
	full: boolean;
	onExpand: () => void;
	onToday: () => void;
	onOpen: (row: EntryRow, day: MemoryDay) => void;
}) {
	const { t, i18n } = useTranslation();
	const format = useMemoryFormat();
	const ago = daysAgo(day.date, now);
	const relative = RELATIVE[ago];
	const refs = new Map(day.refs.map((ref) => [ref.id, ref]));
	const entries = day.rows.filter((row): row is EntryRow => row.type !== "move");
	const header = useStuck<HTMLElement>();
	return (
		<section
			id={`memory-day-${day.date}`}
			className={cn("memory-day", ago === 0 && "memory-day-today")}
			aria-labelledby={`memory-day-title-${day.date}`}
			data-month={day.date.slice(0, 7)}
		>
			<header ref={header.ref} className="memory-day-head" data-stuck={header.stuck || undefined}>
				<h3 id={`memory-day-title-${day.date}`}>
					<span className="memory-day-name">
						{relative ? t(relative) : format.date(day.date, i18n.language, ago > 300)}
					</span>
					<span className="memory-day-date">
						{relative ? `${format.date(day.date, i18n.language, false)} ` : ""}
						{format.weekday(day.date, i18n.language)}
					</span>
				</h3>
				{ago === 0 ? (
					<span className="memory-day-now">{t("memory.now", { time: format.time(now, i18n.language) })}</span>
				) : header.stuck ? (
					<Button size="sm" variant="link" onClick={onToday}>
						{t("memory.backToToday")}
					</Button>
				) : null}
			</header>
			{full ? (
				<ol className="memory-entries">
					{entries.map((row) => (
						<MemoryEntry
							key={row.id}
							row={row}
							refs={refs}
							upcoming={ago === 0 && rowTime(row) > now.getTime()}
							onOpen={(entry) => onOpen(entry, day)}
						/>
					))}
				</ol>
			) : (
				<button type="button" className="memory-summary" onClick={onExpand}>
					<span>{day.lede ?? t("memory.expandDay", { count: entries.length })}</span>
					<span className="memory-summary-count">{t("memory.entryCount", { count: entries.length })}</span>
				</button>
			)}
		</section>
	);
}

/** True while a `position: sticky` header is pinned; it sits at `top: -1px` so pinning drops its ratio below 1. */
function useStuck<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [stuck, setStuck] = useState(false);
	useEffect(() => {
		const element = ref.current;
		if (!element || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			([entry]) =>
				setStuck(
					Boolean(
						entry?.isIntersecting &&
							entry.intersectionRatio < 1 &&
							entry.boundingClientRect.top <= (entry.rootBounds?.top ?? 0) + 1,
					),
				),
			// 0 catches a jump straight into the pinned state; 1 catches scrolling into it.
			{ root: element.closest<HTMLElement>("[data-frame-scroll]"), threshold: [0, 1] },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return { ref, stuck };
}

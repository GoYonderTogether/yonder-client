import type { MemoryDay, MemoryMonth } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { ApiError, useMemoryDays, useMemoryMonths } from "@yonder/ui-data";
import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryDaySection } from "./memory-day.tsx";
import { daysAgo, useMemoryFormat, useMinute } from "./memory-format.ts";
import { MemoryRail } from "./memory-rail.tsx";
import { MemoryEntrySheet, type OpenEntry } from "./memory-ref-sheet.tsx";

/** Days within a week list every entry; older days fold to their one-line summary. */
const FULL_DAYS = 6;

/**
 * The page holds only two things: day headers with their entries, and the scroll index on the
 * right. Sources, quotes and merged raw records open in a sheet when an entry is tapped.
 */
export function MemoryTimeline() {
	const { t, i18n } = useTranslation();
	const format = useMemoryFormat();
	const now = useMinute();
	const recent = useMemoryDays();
	const months = useMemoryMonths();
	const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set());
	const [fullDays, setFullDays] = useState<Set<string>>(() => new Set());
	const [entry, setEntry] = useState<OpenEntry | null>(null);
	const [current, setCurrent] = useState<string | null>(null);
	const [pending, setPending] = useState<{ date: string; rowId?: string } | null>(null);
	const root = useRef<HTMLElement>(null);
	const days = recent.data?.items ?? [];
	const recentMonths = new Set(days.map((day) => day.date.slice(0, 7)));
	const older = (months.data?.items ?? []).filter((month) => !recentMonths.has(month.month));
	const year = String(now.getFullYear());
	const railMonths = [...recentMonths, ...older.map((month) => month.month)].map((key) => ({
		key,
		label: format.month(key, i18n.language, !key.startsWith(year)),
	}));
	const scroller = () => root.current?.closest<HTMLElement>("[data-frame-scroll]") ?? null;
	const scrollTo = (element: Element | null, block: ScrollLogicalPosition = "start") =>
		element?.scrollIntoView({ block, behavior: "auto" });
	useEffect(() => {
		if (!pending) return;
		const target = document.getElementById(
			pending.rowId ? `memory-row-${pending.rowId}` : `memory-day-${pending.date}`,
		);
		if (!target) return;
		scrollTo(target, pending.rowId ? "center" : "start");
		target.classList.remove("memory-flash");
		void target.offsetWidth;
		target.classList.add("memory-flash");
		setPending(null);
	});
	useEffect(() => {
		const element = scroller();
		if (!element) return;
		const update = () => {
			const top = element.getBoundingClientRect().top + 8;
			let month: string | null = null;
			for (const section of root.current?.querySelectorAll<HTMLElement>("[data-month]") ?? []) {
				if (section.getBoundingClientRect().top > top) break;
				month = section.dataset.month ?? null;
			}
			setCurrent(month ?? railMonths[0]?.key ?? null);
		};
		update();
		element.addEventListener("scroll", update, { passive: true });
		return () => element.removeEventListener("scroll", update);
	});
	const openRow = (date: string, rowId?: string) => {
		const month = date.slice(0, 7);
		if (!recentMonths.has(month)) setOpenMonths((set) => new Set(set).add(month));
		setFullDays((set) => new Set(set).add(date));
		setEntry(null);
		setPending({ date, ...(rowId ? { rowId } : {}) });
	};
	const toToday = () => {
		const today = root.current?.querySelector(".memory-day-today");
		if (today) scrollTo(today);
		else scroller()?.scrollTo({ top: 0 });
	};
	const dayProps = (day: MemoryDay) => ({
		day,
		now,
		full: fullDays.has(day.date) || daysAgo(day.date, now) <= FULL_DAYS,
		onExpand: () => setFullDays((set) => new Set(set).add(day.date)),
		onToday: toToday,
		onOpen: (row: OpenEntry["row"], from: MemoryDay) => setEntry({ row, day: from }),
	});
	if (recent.isError)
		return (
			<section className="memory-timeline" aria-label={t("memory.timeline")}>
				<div role="alert" className="memory-error">
					<p>{t("memory.loadFailed")}</p>
					<p>{recent.error instanceof ApiError ? t(recent.error.messageKey) : recent.error.message}</p>
					<Button size="sm" variant="secondary" onClick={() => void recent.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			</section>
		);
	if (recent.isSuccess && !days.length && !older.length)
		return (
			<EmptyState
				icon={<History size={24} strokeWidth={1.6} />}
				title={t("memory.timeline")}
				body={t("memory.timelineEmpty")}
			/>
		);
	const byMonth = new Map<string, MemoryDay[]>();
	for (const day of days) byMonth.set(day.date.slice(0, 7), [...(byMonth.get(day.date.slice(0, 7)) ?? []), day]);
	const monthTitle = (month: string) => (
		<h2 className="memory-month-title">{format.month(month, i18n.language, !month.startsWith(year))}</h2>
	);
	return (
		<section ref={root} className="memory-timeline" aria-label={t("memory.timeline")} aria-busy={recent.isPending}>
			<MemoryRail
				months={railMonths}
				current={current}
				onJump={(month) => scrollTo(document.getElementById(`memory-month-${month}`))}
			/>
			{[...byMonth].map(([month, list], index) => (
				<div key={month} id={`memory-month-${month}`} className="memory-month">
					{index > 0 ? monthTitle(month) : null}
					{list.map((day) => (
						<MemoryDaySection key={day.date} {...dayProps(day)} />
					))}
				</div>
			))}
			{older.map((month) =>
				openMonths.has(month.month) ? (
					<OpenMonth key={month.month} month={month.month} title={monthTitle(month.month)} dayProps={dayProps} />
				) : (
					<FoldedMonth
						key={month.month}
						month={month}
						title={monthTitle(month.month)}
						onOpenMonth={() => setOpenMonths((set) => new Set(set).add(month.month))}
						onOpenDay={(date) => openRow(date)}
					/>
				),
			)}
			<MemoryEntrySheet entry={entry} onClose={() => setEntry(null)} onPick={openRow} />
		</section>
	);
}

function OpenMonth({
	month,
	title,
	dayProps,
}: {
	month: string;
	title: React.ReactNode;
	dayProps: (day: MemoryDay) => React.ComponentProps<typeof MemoryDaySection>;
}) {
	const { t } = useTranslation();
	const days = useMemoryDays(month);
	return (
		<div id={`memory-month-${month}`} className="memory-month" data-month={month}>
			{title}
			{days.isError ? (
				<p role="alert" className="memory-error">
					{days.error instanceof ApiError ? t(days.error.messageKey) : days.error.message}
				</p>
			) : null}
			{days.data?.items.map((day) => (
				<MemoryDaySection key={day.date} {...dayProps(day)} />
			))}
		</div>
	);
}

/** An older month: its notable days, one line each, and a way into every day. */
function FoldedMonth({
	month,
	title,
	onOpenMonth,
	onOpenDay,
}: {
	month: MemoryMonth;
	title: React.ReactNode;
	onOpenMonth: () => void;
	onOpenDay: (date: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const format = useMemoryFormat();
	return (
		<section id={`memory-month-${month.month}`} className="memory-month" data-month={month.month}>
			{title}
			{month.note ? <p className="memory-month-note">{month.note}</p> : null}
			<ol className="memory-entries">
				{month.highlights.map((day) => (
					<li key={day.date} className="memory-entry">
						<button type="button" onClick={() => onOpenDay(day.date)}>
							<time dateTime={day.date}>{format.date(day.date, i18n.language, false)}</time>
							<span className="memory-entry-text">
								<span className="memory-entry-title">{day.lede}</span>
								<span className="memory-entry-note">{format.weekday(day.date, i18n.language)}</span>
							</span>
						</button>
					</li>
				))}
			</ol>
			<Button size="sm" variant="link" className="memory-month-all" onClick={onOpenMonth}>
				{t("memory.monthAll", { count: month.dayCount })}
			</Button>
		</section>
	);
}

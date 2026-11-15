import { Button, cn, IconButton, Segmented } from "@yonder/ui-components";
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Images, MapPin, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryDay, type MemoryMoment } from "./memory-day.tsx";
import { dateKey, movePeriod, periodDays, type TimelineScale } from "./timeline-period.ts";

const NO_MOMENTS: MemoryMoment[] = [];
const KIND_ICONS = { recording: Mic, photos: Images, place: MapPin, schedule: CalendarDays, keyMoment: Flag };
const SCALES: TimelineScale[] = ["year", "month", "week", "day"];

export function MemoryTimeline({ moments = NO_MOMENTS }: { moments?: MemoryMoment[] }) {
	const { t, i18n } = useTranslation();
	const [selected, setSelected] = useState(() => new Date());
	const [scale, setScale] = useState<TimelineScale>("day");
	const [filter, setFilter] = useState("all");
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);
	const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(i18n.language, options).format(date);
	const dayMoments = moments
		.filter(
			(moment) =>
				dateKey(new Date(moment.startsAt)) === dateKey(selected) && (filter === "all" || filter === moment.kind),
		)
		.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
	const openDay = (day: Date) => {
		setSelected(day);
		setScale("day");
	};
	const dateButton = (day: Date) => {
		const count = moments.filter((moment) => dateKey(new Date(moment.startsAt)) === dateKey(day)).length;
		return (
			<button
				key={dateKey(day)}
				type="button"
				aria-label={t("memory.openDay", { date: format(day, { dateStyle: "full" }) })}
				onClick={() => openDay(day)}
				className={cn("memory-calendar-day", dateKey(day) === dateKey(selected) && "memory-calendar-selected")}
			>
				{scale === "week" ? (
					<span className="text-micro text-[var(--color-text-secondary)]">{format(day, { weekday: "short" })}</span>
				) : null}
				<span>{day.getDate()}</span>
				<span className={cn("memory-calendar-dot", count > 0 && "memory-calendar-dot-filled")} aria-hidden="true" />
			</button>
		);
	};
	return (
		<section className="memory-timeline flex min-w-0 flex-col gap-[var(--spacing-5)]" aria-label={t("memory.timeline")}>
			<div className="flex flex-wrap items-center justify-between gap-[var(--spacing-3)]">
				<h2 className="text-h3 font-semibold">{t("memory.timeline")}</h2>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => {
						setSelected(new Date());
						setScale("day");
					}}
				>
					{t("memory.today")}
				</Button>
			</div>
			<Segmented
				aria-label={t("memory.timeline")}
				options={SCALES.map((value) => ({ value, label: t(`memory.${value}`) }))}
				value={scale}
				onChange={(value) => setScale(value as TimelineScale)}
				className="self-start"
			/>
			<div className="flex items-center justify-between gap-[var(--spacing-2)]">
				<IconButton
					size="sm"
					aria-label={t("memory.previous")}
					onClick={() => setSelected(movePeriod(selected, scale, -1))}
				>
					<ChevronLeft size={18} aria-hidden />
				</IconButton>
				<label className="relative min-w-0 rounded-[var(--radius-control-sm)] px-[var(--spacing-2)] py-[var(--spacing-2)] text-body font-medium focus-within:outline-2 focus-within:outline-[var(--color-accent)]">
					{format(
						selected,
						scale === "year"
							? { year: "numeric" }
							: scale === "month"
								? { year: "numeric", month: "long" }
								: { year: "numeric", month: "long", day: "numeric" },
					)}
					<input
						type="date"
						aria-label={t("memory.pickDate")}
						value={dateKey(selected)}
						onChange={(event) => {
							if (event.target.value) {
								const [year, month, day] = event.target.value.split("-").map(Number);
								setSelected(new Date(year as number, (month as number) - 1, day));
							}
						}}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
				<IconButton size="sm" aria-label={t("memory.next")} onClick={() => setSelected(movePeriod(selected, scale, 1))}>
					<ChevronRight size={18} aria-hidden />
				</IconButton>
			</div>
			{scale === "year" ? (
				<div className="grid grid-cols-3 gap-[var(--spacing-2)]">
					{Array.from({ length: 12 }, (_, month) => {
						const date = new Date(selected.getFullYear(), month, 1);
						const count = moments.filter((moment) => {
							const day = new Date(moment.startsAt);
							return day.getFullYear() === selected.getFullYear() && day.getMonth() === month;
						}).length;
						return (
							<button
								key={dateKey(date)}
								type="button"
								aria-label={t("memory.openMonth", { month: format(date, { year: "numeric", month: "long" }) })}
								onClick={() => {
									setSelected(date);
									setScale("month");
								}}
								className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)] text-left hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
							>
								<span className="text-body">{format(date, { month: "short" })}</span>
								<span className="text-micro text-[var(--color-text-secondary)]">
									{t("memory.momentCount", { count })}
								</span>
							</button>
						);
					})}
				</div>
			) : scale === "month" || scale === "week" ? (
				<div className="grid grid-cols-7 gap-[var(--spacing-1)]">
					{scale === "month"
						? Array.from(
								{ length: (new Date(selected.getFullYear(), selected.getMonth(), 1).getDay() + 6) % 7 },
								(_, index) => <span key={dateKey(new Date(selected.getFullYear(), selected.getMonth(), -index))} />,
							)
						: null}
					{periodDays(selected, scale).map(dateButton)}
				</div>
			) : null}
			{scale === "day" ? (
				<>
					<fieldset
						className="flex min-w-0 max-w-full gap-[var(--spacing-2)] overflow-x-auto pb-[var(--spacing-1)]"
						aria-label={t("memory.timeline")}
					>
						{(["all", "recording", "photos", "place", "schedule", "keyMoment"] as const).map((kind) => {
							const Icon = kind === "all" ? null : KIND_ICONS[kind];
							return (
								<Button
									key={kind}
									size="sm"
									variant={filter === kind ? "secondary" : "ghost"}
									aria-pressed={filter === kind}
									className="shrink-0"
									onClick={() => setFilter(kind)}
								>
									{Icon ? <Icon size={14} aria-hidden /> : null}
									{t(`memory.${kind}`)}
								</Button>
							);
						})}
					</fieldset>
					<MemoryDay selected={selected} now={now} moments={dayMoments} />
				</>
			) : null}
		</section>
	);
}

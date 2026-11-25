import type { MemoryEntry as Entry, MemoryDay, MemoryStay } from "@yonder/protocol";
import { cn } from "@yonder/ui-components";
import { useAccountTimeZone } from "@yonder/ui-data";
import { ChevronRight, Footprints, Images, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntryActions } from "./memory-actions.ts";
import { DaySummary } from "./memory-day-summary.tsx";
import { MemoryEntry } from "./memory-entry.tsx";
import { blockAt, dayName, daysAgo, memoryFormat } from "./memory-format.ts";

/** Days within a week list every entry; older days fold their one-line entries away. */
const FULL_DAYS = 6;

export type DayActions = EntryActions;

/**
 * One day: a large title that scrolls with the page (the pinned bar takes over once it reaches the
 * top), a quiet digest line, then the day's entries on the spine, newest first.
 */
export function MemoryDaySection({ day, now, actions }: { day: MemoryDay; now: Date; actions: DayActions }) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const ago = daysAgo(day.date, now, zone);
	const { name, sub } = dayName(day.date, now, t, i18n.language, zone);
	const isToday = ago === 0;
	const nowAt = now.getTime();
	const blocks = day.blocks.slice().reverse();
	const past = isToday ? blocks.filter((block) => blockAt(block) <= nowAt) : blocks;
	const ahead = isToday ? blocks.filter((block) => blockAt(block) > nowAt) : [];
	const fold = ago > FULL_DAYS;
	const foldFrom = fold
		? past.findLastIndex((block) => block.type === "stay" || block.entry.size !== "line") + 1
		: past.length;
	const shown = past.slice(0, foldFrom);
	const small = past.slice(foldFrom);
	const entry = (item: Entry, upcoming = false) => (
		<MemoryEntry key={item.id} entry={item} upcoming={upcoming} actions={actions} />
	);
	const { steps, places, photos } = day.digest;
	return (
		<section
			id={`memory-day-${day.date}`}
			className={cn("memory-day", isToday && "memory-day-today")}
			aria-labelledby={`memory-day-title-${day.date}`}
			data-day={day.date}
		>
			<h3 id={`memory-day-title-${day.date}`} className="memory-day-title">
				<strong>{name}</strong>
				<span>{sub}</span>
			</h3>
			{day.digestPath ? <DaySummary path={day.digestPath} /> : null}
			{day.state === "failed" && day.failure ? (
				<p role="alert" className="memory-error-line wrap-anywhere">
					{day.failure}
				</p>
			) : null}
			{steps != null || places || photos ? (
				<p className="memory-digest">
					{steps != null ? (
						<span>
							<Footprints aria-hidden />
							{t("memory.steps", { count: steps, value: memoryFormat.number(steps, i18n.language) })}
						</span>
					) : null}
					{places ? (
						<span>
							<MapPin aria-hidden />
							{t("memory.places", { count: places })}
						</span>
					) : null}
					{photos ? (
						<span>
							<Images aria-hidden />
							{t("memory.photoCount", { count: photos })}
						</span>
					) : null}
				</p>
			) : null}
			<ol className="memory-flow">
				{ahead.length ? (
					<li className="memory-ahead">
						<ol>
							{ahead.map((block) =>
								block.type === "entry" ? (
									entry(block.entry, true)
								) : (
									<Stay key={block.stay.id} stay={block.stay} render={(item) => entry(item, true)} />
								),
							)}
						</ol>
					</li>
				) : null}
				{isToday ? (
					<li className="memory-now">
						<time dateTime={now.toISOString()}>
							{t("memory.now", { time: memoryFormat.time(now, i18n.language, zone) })}
						</time>
					</li>
				) : null}
				{shown.map((block) =>
					block.type === "entry" ? (
						entry(block.entry)
					) : (
						<Stay key={block.stay.id} stay={block.stay} render={(item) => entry(item)} />
					),
				)}
				{small.length ? (
					<Folded count={small.length}>
						{small.map((block) => (block.type === "entry" ? entry(block.entry) : null))}
					</Folded>
				) : null}
			</ol>
		</section>
	);
}

/** A stay opens with a place marker; the spine stays green until the owner leaves. */
function Stay({ stay, render }: { stay: MemoryStay; render: (entry: Entry) => React.ReactNode }) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const from = memoryFormat.time(stay.startsAt, i18n.language, zone);
	const span = stay.endsAt
		? t("memory.span", { from, to: memoryFormat.time(stay.endsAt, i18n.language, zone) })
		: t("memory.stillHere", { from });
	return (
		<li className="memory-stay memory-kind-place">
			<p className="memory-place">
				<span className="memory-node" aria-hidden>
					<i>
						<MapPin />
					</i>
				</span>
				{stay.place}
				<small>{stay.area ? t("memory.joinNote", { first: stay.area, second: span }) : span}</small>
			</p>
			<ol>
				{stay.entries
					.slice()
					.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
					.map(render)}
			</ol>
		</li>
	);
}

function Folded({ count, children }: { count: number; children: React.ReactNode }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<li className={cn("memory-fold", open && "memory-open")}>
			<span className="memory-node" aria-hidden>
				<i />
			</span>
			<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
				{t("memory.smallThings", { count })}
				<ChevronRight aria-hidden />
			</button>
			<div className="memory-drawer" inert={!open}>
				<div>
					<ol>{children}</ol>
				</div>
			</div>
		</li>
	);
}

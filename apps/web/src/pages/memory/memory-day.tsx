import type { MemoryEntry as Entry, MemoryDay, MemoryStay } from "@yonder/protocol";
import { Button, cn } from "@yonder/ui-components";
import { ApiError } from "@yonder/ui-data";
import { ChevronRight, Footprints, Images, LoaderCircle, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type EntryActions, MemoryEntry } from "./memory-entry.tsx";
import { blockAt, dayName, daysAgo, memoryFormat } from "./memory-format.ts";

/** Days within a week list every entry; older days fold their one-line entries away. */
const FULL_DAYS = 6;

export interface DayActions extends EntryActions {
	/** Organize this day again now, after a failed pass. */
	onOrganize: (date: string) => void;
	organizing: string | null;
	organizeError: { date: string; error: Error } | null;
}

/**
 * One day: a large title that scrolls with the page (the pinned bar takes over once it reaches the
 * top), a quiet digest line, then the day's entries on the spine, oldest first.
 */
export function MemoryDaySection({ day, now, actions }: { day: MemoryDay; now: Date; actions: DayActions }) {
	const { t, i18n } = useTranslation();
	const ago = daysAgo(day.date, now);
	const { name, sub } = dayName(day.date, now, t, i18n.language);
	const isToday = ago === 0;
	const nowAt = now.getTime();
	const past = isToday ? day.blocks.filter((block) => blockAt(block) <= nowAt) : day.blocks;
	const ahead = isToday ? day.blocks.filter((block) => blockAt(block) > nowAt) : [];
	const fold = ago > FULL_DAYS;
	const small = fold ? past.filter((block) => block.type === "entry" && block.entry.size === "line") : [];
	const shown = past.filter((block) => !small.includes(block));
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
			data-name={name}
			data-sub={sub}
		>
			<h3 id={`memory-day-title-${day.date}`} className="memory-day-title">
				<strong>{name}</strong>
				<span>{sub}</span>
			</h3>
			{day.state === "organizing" ? (
				<p className="memory-day-state">
					<OrganizingMark />
					{t("memory.organizing")}
				</p>
			) : null}
			{day.state === "failed" ? <DayFailure day={day} actions={actions} /> : null}
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
				{shown.map((block) =>
					block.type === "entry" ? (
						entry(block.entry)
					) : (
						<Stay key={block.stay.id} stay={block.stay} render={(item) => entry(item)} />
					),
				)}
				{isToday ? (
					<li className="memory-now">{t("memory.now", { time: memoryFormat.time(now, i18n.language) })}</li>
				) : null}
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
				{small.length ? (
					<Folded count={small.length}>
						{small.map((block) => (block.type === "entry" ? entry(block.entry) : null))}
					</Folded>
				) : null}
			</ol>
		</section>
	);
}

/** A spinner beside the caption while the day waits for or runs its organizing pass. */
function OrganizingMark() {
	return <LoaderCircle aria-hidden className="memory-organizing-mark" />;
}

/** A failed organizing pass: the real reason and one retry, in place under the day's title. */
function DayFailure({ day, actions }: { day: MemoryDay; actions: DayActions }) {
	const { t } = useTranslation();
	const error = actions.organizeError?.date === day.date ? actions.organizeError.error : null;
	const reason = error ? (error instanceof ApiError ? t(error.messageKey) : error.message) : day.failure;
	return (
		<div role="alert" className="memory-day-failed">
			<p>{t("memory.organizeFailed")}</p>
			{reason ? <p>{reason}</p> : null}
			<Button
				size="sm"
				variant="secondary"
				loading={actions.organizing === day.date}
				onClick={() => actions.onOrganize(day.date)}
			>
				{t("app.retry")}
			</Button>
		</div>
	);
}

/** A stay opens with a place marker; the spine stays green until the owner leaves. */
function Stay({ stay, render }: { stay: MemoryStay; render: (entry: Entry) => React.ReactNode }) {
	const { t, i18n } = useTranslation();
	const from = memoryFormat.time(stay.startsAt, i18n.language);
	const span = stay.endsAt
		? t("memory.span", { from, to: memoryFormat.time(stay.endsAt, i18n.language) })
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
			<ol>{stay.entries.map(render)}</ol>
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

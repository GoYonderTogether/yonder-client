import { BrandIcon, cn } from "@yonder/ui-components";
import { Footprints, Images, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DaySummary } from "../memory-day-summary.tsx";
import { dayName, daysAgo, memoryFormat } from "../memory-format.ts";
import { isoWeek } from "./timeline-bands.tsx";
import { KindIcon } from "./timeline-kinds.tsx";
import { skyOfPart } from "./timeline-model.ts";
import { NextArrow, type NextTarget } from "./timeline-next.tsx";
import { PartIcon, partOfSky } from "./timeline-part-icons.tsx";
import type { Sky } from "./timeline-sky.tsx";
import type { DayPart, TimelineDay, TimelineEvent, TimelineStep } from "./timeline-types.ts";

/** What the page around the cards supplies: how a step's pictures are drawn, and what a message or a card opens. */
export interface TimelineHost {
	/** The pictures of a photo step, at most four, and how many there are in all. */
	photos: (step: TimelineStep) => { nodes: ReactNode[]; total: number };
	onMessage: (step: TimelineStep) => void;
	onEvent?: ((event: TimelineEvent) => void) | undefined;
	/** What an opened event shows under its title: the organized account, materials, sources and delete. */
	detail?: ((event: TimelineEvent) => ReactNode) | undefined;
	/** Whether an event is the one opened, and whether it flashes after a link jump. */
	state?: ((event: TimelineEvent) => { open: boolean; flash: boolean }) | undefined;
	/** False when an event has nothing behind it: its title is plain text, not a button. */
	openable?: ((event: TimelineEvent) => boolean) | undefined;
	/** The node this event leads to, when it is one of a chain. */
	next?: ((event: TimelineEvent) => NextTarget | null) | undefined;
}

const HostContext = createContext<TimelineHost>({ photos: () => ({ nodes: [], total: 0 }), onMessage: () => {} });
export const TimelineHostProvider = HostContext.Provider;

/** A part of the day the owner wrote as words ("从上午到下午") takes the sky it starts in. */
export const skyOfMarker = (marker = ""): Sky => {
	const first = marker.replace(/^从/u, "").split("到")[0] ?? marker;
	if (/清晨|早上/u.test(first)) return "dawn";
	if (/傍晚/u.test(first)) return "dusk";
	if (/上午|中午|下午/u.test(first)) return "day";
	return "night";
};

const skyOf = (event: TimelineEvent): Sky => (event.part ? skyOfPart(event.part) : skyOfMarker(event.marker));

/** What mattered gets a card of its own; a single quiet line of talk does not. */
const isMajor = (event: TimelineEvent) =>
	event.major ??
	(event.steps.length > 1 ||
		event.steps.some(
			(step) =>
				step.photos?.length || step.media?.length || step.from || step.kind === "decision" || step.kind === "recording",
		));

type Block = { card: TimelineEvent } | { quiet: TimelineEvent[] } | { part: string };

/** Time order is kept: neighbouring small things share one quiet list, big things break it. */
export const blocksOf = (events: TimelineEvent[]): Block[] => {
	const out: Block[] = [];
	let part = "";
	for (const event of events) {
		const next = event.marker ?? event.part ?? "";
		if (next && next !== part) {
			part = next;
			out.push({ part: next });
		}
		if (isMajor(event)) {
			out.push({ card: event });
			continue;
		}
		const last = out.at(-1);
		if (last && "quiet" in last) last.quiet.push(event);
		else out.push({ quiet: [event] });
	}
	return out;
};

const eventKey = (event: TimelineEvent, index: number) =>
	`${event.entry?.id ?? event.marker ?? ""}:${event.headline}:${index}`;

/** One day: its date sticks to the top, the narrator's line, then cards and quiet lists in time order. */
export function TimelineDaySection({ day, now, after }: { day: TimelineDay; now?: Date; after?: ReactNode }) {
	const { t, i18n } = useTranslation();
	const weekday = day.weekday ?? memoryFormat.weekday(day.date, i18n.language);
	const named = now ? dayName(day.date, now, t, i18n.language) : null;
	const isToday = now ? daysAgo(day.date, now) === 0 : false;
	const past = day.events.filter((event) => !event.upcoming);
	const ahead = day.events.filter((event) => event.upcoming);
	return (
		<section
			id={`memory-day-${day.date}`}
			className="tl-day"
			data-day={day.date}
			aria-label={named ? `${named.name} ${named.sub}` : day.date}
		>
			<header className="tl-day-head">
				<strong>{Number(day.date.slice(8))}</strong>
				<span>
					{t("memory.dayMeta", { month: Number(day.date.slice(5, 7)), week: isoWeek(day.date).week, weekday })}
				</span>
			</header>
			{day.lead ? <p className="tl-narration">{day.lead}</p> : null}
			{day.digestPath ? <DaySummary path={day.digestPath} /> : null}
			{day.state === "failed" && day.failure ? (
				<p role="alert" className="memory-error-line wrap-anywhere">
					{day.failure}
				</p>
			) : null}
			{day.digest && (day.digest.steps != null || day.digest.places || day.digest.photos) ? (
				<p className="memory-digest">
					{day.digest.steps != null ? (
						<span>
							<Footprints aria-hidden />
							{t("memory.steps", {
								count: day.digest.steps,
								value: memoryFormat.number(day.digest.steps, i18n.language),
							})}
						</span>
					) : null}
					{day.digest.places ? (
						<span>
							<MapPin aria-hidden />
							{t("memory.places", { count: day.digest.places })}
						</span>
					) : null}
					{day.digest.photos ? (
						<span>
							<Images aria-hidden />
							{t("memory.photoCount", { count: day.digest.photos })}
						</span>
					) : null}
				</p>
			) : null}
			{day.stays?.length ? (
				<div className="tl-places">
					{day.stays.map((stay) => {
						const from = memoryFormat.time(stay.startsAt, i18n.language);
						const span = stay.endsAt
							? t("memory.span", { from, to: memoryFormat.time(stay.endsAt, i18n.language) })
							: t("memory.stillHere", { from });
						return (
							<p key={stay.id} className="tl-place">
								<MapPin aria-hidden />
								{stay.place}
								<small>{stay.area ? t("memory.joinNote", { first: stay.area, second: span }) : span}</small>
							</p>
						);
					})}
				</div>
			) : null}
			{after}
			<ol className="tl-blocks">
				{blocksOf(past).map((block, index) =>
					"card" in block ? (
						<Card key={eventKey(block.card, index)} event={block.card} />
					) : "part" in block ? (
						<li key={`part-${block.part}`} className="tl-part">
							<PartHead part={block.part} />
						</li>
					) : (
						<Quiet key={eventKey(block.quiet[0] as TimelineEvent, index)} events={block.quiet} />
					),
				)}
			</ol>
			{isToday && now ? (
				<p className="tl-now">
					<time dateTime={now.toISOString()}>{t("memory.now", { time: memoryFormat.time(now, i18n.language) })}</time>
				</p>
			) : null}
			{ahead.length ? (
				<ol className="tl-blocks">
					{blocksOf(ahead).map((block, index) =>
						"card" in block ? (
							<Card key={eventKey(block.card, index)} event={block.card} />
						) : "part" in block ? (
							<li key={`part-${block.part}`} className="tl-part">
								<PartHead part={block.part} />
							</li>
						) : (
							<Quiet key={eventKey(block.quiet[0] as TimelineEvent, index)} events={block.quiet} />
						),
					)}
				</ol>
			) : null}
		</section>
	);
}

/** A thing that mattered: a card under its sky, the part of the day as a capsule, one headline, then what happened in it. */
function Card({ event }: { event: TimelineEvent }) {
	const { t } = useTranslation();
	const host = useContext(HostContext);
	const state = host.state?.(event) ?? { open: false, flash: false };
	const next = host.next?.(event);
	const sky = skyOf(event);
	const from = event.part ? t(`memory.part_${event.part}`) : "";
	const to = event.endPart ? t(`memory.part_${event.endPart}`) : "";
	const label = event.marker ?? (to ? t("memory.partSpan", { from, to }) : from);
	return (
		<li
			className={cn(
				"tl-card",
				event.upcoming && "memory-upcoming",
				state.open && "memory-open",
				state.flash && "memory-flash",
			)}
			data-sky={sky}
			data-size={event.entry?.size}
			data-part={event.part}
			data-kind={event.entry?.kind}
			data-upcoming={event.upcoming || undefined}
			id={event.entry ? `memory-entry-${event.entry.id}` : undefined}
		>
			<time className="tl-at" title={label}>
				<b>{event.entry ? memoryFormat.time(event.entry.at, "en-GB") : (event.steps[0]?.at ?? "")}</b>
				{from ? <small>{label}</small> : null}
			</time>
			<div className="tl-body">
				<h3 className="tl-card-title">
					{host.onEvent && host.openable?.(event) !== false ? (
						<button
							type="button"
							className="tl-card-open"
							aria-expanded={state.open}
							aria-controls={event.entry ? `memory-drawer-${event.entry.id}` : undefined}
							onClick={() => host.onEvent?.(event)}
						>
							{event.headline}
						</button>
					) : (
						event.headline
					)}
				</h3>
				{event.entry && (event.entry.tags.length || event.entry.place || event.entry.people.length) ? (
					<div className="tl-facts">
						{event.entry.place ? (
							<span className="tl-fact">
								<MapPin aria-hidden />
								{event.entry.place}
							</span>
						) : null}
						{event.entry.people.length ? (
							<span className="tl-fact">{t("memory.people", { count: event.entry.people.length })}</span>
						) : null}
						{event.entry.tags.map((tag) => (
							<span key={tag} className="tl-fact">
								#{tag}
							</span>
						))}
					</div>
				) : null}
				{host.detail?.(event)}
				{event.steps.length ? (
					<ol className="tl-steps">
						{event.steps.map((step) => (
							<Step key={`${step.at}:${step.text}`} step={step} />
						))}
					</ol>
				) : null}
			</div>
			{next ? <NextArrow target={next} /> : null}
		</li>
	);
}

/** Small things: one grey line each, no card, so they read as small. */
function Quiet({ events }: { events: TimelineEvent[] }) {
	const host = useContext(HostContext);
	return (
		<li className="tl-quiet">
			<ul>
				{events.map((event, index) => {
					const at = event.entry ? memoryFormat.time(event.entry.at, "en-GB") : (event.steps[0]?.at ?? "");
					const next = host.next?.(event);
					return (
						<li
							key={eventKey(event, index)}
							id={event.entry ? `memory-entry-${event.entry.id}` : undefined}
							className={cn(
								event.upcoming && "memory-upcoming",
								host.state?.(event).open && "memory-open",
								host.state?.(event).flash && "memory-flash",
							)}
						>
							<time>{at}</time>
							{host.detail?.(event)}
							{host.onEvent && host.openable?.(event) !== false ? (
								<button
									type="button"
									className="tl-quiet-open"
									aria-expanded={host.state?.(event).open ?? false}
									onClick={() => host.onEvent?.(event)}
								>
									{event.headline}
								</button>
							) : (
								<span>{event.headline}</span>
							)}
							{next ? <NextArrow target={next} /> : null}
						</li>
					);
				})}
			</ul>
		</li>
	);
}

function Step({ step }: { step: TimelineStep }) {
	const { t } = useTranslation();
	const host = useContext(HostContext);
	if (step.kind === "photo") {
		const { nodes, total } = host.photos(step);
		if (nodes.length) {
			return (
				<li className="tl-step tl-step-photo">
					<div className={`tl-strip tl-strip-${Math.min(nodes.length, 4)}`}>
						{nodes}
						{total > nodes.length ? (
							<span className="tl-strip-more" title={t("memory.photoCount", { count: total })}>
								+{total - nodes.length}
							</span>
						) : null}
					</div>
				</li>
			);
		}
	}
	if (step.from) {
		return (
			<li className="tl-step tl-step-message">
				<time className="tl-time">{step.at}</time>
				<button type="button" className="tl-msg" onClick={() => host.onMessage(step)}>
					<BrandIcon name="wechat" size={28} title={t("memory.brandWechat")} className="tl-msg-icon" />
					<div>
						<p className="tl-msg-from">{step.from.name}</p>
						<p className="tl-msg-text">{step.text}</p>
						{step.detail ? <p className="tl-msg-detail">{step.detail}</p> : null}
					</div>
				</button>
			</li>
		);
	}
	const kind = step.kind === "recording" || step.kind === "decision" || step.kind === "thought" ? step.kind : null;
	return (
		<li className={`tl-step tl-step-${step.kind}`}>
			<time className="tl-time">{step.at}</time>
			<div className="tl-step-body">
				<p className="tl-step-text">
					{kind ? <KindIcon kind={kind} size={14} /> : null}
					{step.text}
				</p>
				{step.detail ? <p className="tl-step-detail">{step.detail}</p> : null}
			</div>
		</li>
	);
}

const PART_NAMES = ["predawn", "dawn", "morning", "noon", "afternoon", "dusk", "evening", "night"];

/** The head of a part-of-day group: a small coloured scene for that part, moving only while it is on screen, then its name. */
function PartHead({ part }: { part: string }) {
	const { t } = useTranslation();
	const named = PART_NAMES.includes(part);
	const kind = named ? (part as DayPart) : partOfSky[skyOfMarker(part)];
	const mark = useRef<HTMLSpanElement>(null);
	const [live, setLive] = useState(false);
	useEffect(() => {
		const element = mark.current;
		if (!element || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver((entries) => setLive(entries.some((entry) => entry.isIntersecting)));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return (
		<>
			<span
				ref={mark}
				className="tl-part-mark"
				data-live={live || undefined}
				style={
					{
						"--part-top": `var(--color-sky-part-${kind}-top)`,
						"--part-bottom": `var(--color-sky-part-${kind}-bottom)`,
					} as React.CSSProperties
				}
			>
				<PartIcon part={kind} size={22} />
			</span>
			{named ? t(`memory.part_${part}`) : part}
		</>
	);
}

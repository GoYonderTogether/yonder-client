import type { MemoryDay, MemoryLink } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useMemoryActions, useMemoryDays } from "@yonder/ui-data";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useOpenAttachmentDetail } from "../../preview/attachment-detail.tsx";
import { AttachmentPreview } from "../../preview/attachment-preview.tsx";
import type { PreviewFile } from "../../preview/file-kind.ts";
import { localDay } from "../items-format.ts";
import type { EntryActions } from "./memory-actions.ts";
import { EntryDrawer } from "./memory-drawer.tsx";
import { dayName, useMinute } from "./memory-format.ts";
import { MemoryThumb } from "./memory-media.tsx";
import { useSourceNavigation } from "./memory-navigation.ts";
import { useOverlayBox } from "./memory-overlay.ts";
import { MemoryPinBar } from "./memory-pin.tsx";
import { MemoryRail, type RailDay } from "./memory-rail.tsx";
import { MemoryError, useErrorText } from "./memory-status.tsx";
import { TimelineDaySection, type TimelineHost, TimelineHostProvider } from "./timeline/timeline-cards.tsx";
import { toTimelineDays } from "./timeline/timeline-model.ts";
import "./timeline/timeline-cards.css";
import "./timeline/timeline-cards-parts.css";
import "./timeline/timeline-cards-drawer.css";
import "./timeline/timeline-cards-tune.css";
import "./timeline/timeline-cards-flow.css";
import "./timeline/timeline-cards-next.css";
import "./timeline/timeline-part-icons.css";

/**
 * Days newest first, each with its entries on one spine. A pinned
 * bar names the day under the top edge, and a date index waits on the right edge. Both are drawn
 * over the scroller, so neither moves the content.
 */
export function MemoryTimeline() {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const query = useMemoryDays();
	const { remove } = useMemoryActions();
	const onSource = useSourceNavigation().target;
	const openAttachment = useOpenAttachmentDetail();
	const errorText = useErrorText();
	const [open, setOpen] = useState<string | null>(null);
	const [preview, setPreview] = useState<PreviewFile>();
	const [pending, setPending] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [timeline, setTimeline] = useState<HTMLElement | null>(null);
	const scroller = timeline?.closest<HTMLElement>("[data-frame-scroll]") ?? null;
	const frame = scroller?.parentElement ?? null;
	const box = useOverlayBox(timeline, scroller);
	const today = localDay(now);
	const days = useMemo(
		() => timelineDays(query.data?.pages.flatMap((page) => page.items) ?? [], today),
		[query.data, today],
	);
	const previousDay = useRef(today);
	const more = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError, refetch } = query;
	const pageError = isFetchNextPageError ? (query.error as Error | null) : null;

	useEffect(() => {
		if (previousDay.current === today) return;
		previousDay.current = today;
		void refetch();
	}, [today, refetch]);

	// Load older days as the end of the list comes near.
	useEffect(() => {
		const element = more.current;
		if (!element || !hasNextPage || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
			},
			{ root: scroller, rootMargin: "800px" },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [scroller, hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Following a link scrolls to that entry once it is on the page, opens it and flashes it.
	useEffect(() => {
		if (!pending) return;
		const target = document.getElementById(`memory-entry-${pending}`);
		if (!target) {
			if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
			return;
		}
		target.closest(".memory-fold")?.querySelector<HTMLButtonElement>(":scope > button[aria-expanded=false]")?.click();
		target.scrollIntoView({ block: "center", behavior: "smooth" });
		setOpen(pending);
		setFlash(pending);
		setPending(null);
	});
	useEffect(() => {
		if (!flash) return;
		const timer = window.setTimeout(() => setFlash(null), 1400);
		return () => window.clearTimeout(timer);
	}, [flash]);

	const scrollToDay = (date: string, smooth = false) => {
		const section = document.getElementById(`memory-day-${date}`);
		if (!section || !scroller) return;
		const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
		// A native header can float over the scroller; land below it.
		const inset = box ? box.top - scroller.offsetTop : 0;
		scroller.scrollTo({ top: top - inset - 4, behavior: smooth ? "smooth" : "auto" });
	};
	const actions: EntryActions = {
		open,
		flash,
		onToggle: (id) => setOpen((current) => (current === id ? null : id)),
		onLink: (link: MemoryLink) => setPending(link.entryId),
		onPreview: (file) => {
			if (!openAttachment(file)) setPreview(file);
		},
		onSource,
		onDelete: (id) => remove.mutate(id),
		deleting: remove.isPending ? (remove.variables ?? null) : null,
		deleteError: remove.error ? { id: remove.variables ?? "", error: remove.error } : null,
	};
	const view = toTimelineDays(days, now);
	const byId = new Map(
		days
			.flatMap((day) => day.blocks.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries)))
			.map((entry) => [entry.id, entry] as const),
	);
	const host: TimelineHost = {
		photos: (step) => ({
			nodes: (step.media ?? []).slice(0, 4).map((media, index, shown) => (
				<MemoryThumb
					key={media.attachment.id}
					more={index === shown.length - 1 ? Math.max(0, (step.photoCount ?? shown.length) - shown.length) : 0}
					media={media}
					onOpen={(file) => {
						if (!openAttachment(file)) setPreview(file);
					}}
				/>
			)),
			total: step.photoCount ?? step.media?.length ?? 0,
		}),
		onMessage: () => {},
		next: (event) => {
			const from = event.entry;
			const link = from?.links.find((candidate) => candidate.label === "next");
			const target = link ? byId.get(link.entryId) : undefined;
			if (!from || !link || !target) return null;
			const gap = (Date.parse(link.date) - Date.parse(localDay(new Date(from.at)))) / 86_400_000;
			// An arrow only where the next node lies on another day.
			if (gap < 1) return null;
			return { id: target.id, title: target.title };
		},
		state: (event) => ({ open: event.entry?.id === open, flash: event.entry?.id === flash }),
		openable: (event) => {
			const e = event.entry;
			return Boolean(
				e &&
					(e.media.length ||
						e.materials.length ||
						e.quote ||
						e.links.length ||
						e.body ||
						e.sources.length ||
						e.deletable ||
						(e.text && e.size !== "note")),
			);
		},
		onEvent: (event) => {
			const id = event.entry?.id;
			if (id) actions.onToggle(id);
		},
		detail: (event) =>
			event.entry && open === event.entry.id ? (
				<div className="tl-detail" id={`memory-drawer-${event.entry.id}`}>
					<EntryDrawer entry={event.entry} actions={actions} />
				</div>
			) : null,
	};
	const landed = useRef(false);
	const heightBefore = useRef(0);
	// Open at the bottom, where today is. Older days arriving above keep what is on screen where it is.
	useLayoutEffect(() => {
		if (!scroller || !view.length) return;
		if (!landed.current) {
			landed.current = true;
			scroller.scrollTop = scroller.scrollHeight;
		} else {
			const grown = scroller.scrollHeight - heightBefore.current;
			if (grown > 0 && scroller.scrollTop < 400) scroller.scrollTop += grown;
		}
		heightBefore.current = scroller.scrollHeight;
	});
	// Photos and fonts settle after the first paint; keep the bottom in view until the reader scrolls on their own.
	useEffect(() => {
		if (!scroller || !timeline || typeof ResizeObserver === "undefined") return;
		let following = true;
		const stop = () => {
			following = false;
		};
		scroller.addEventListener("wheel", stop, { passive: true });
		scroller.addEventListener("touchstart", stop, { passive: true });
		const observer = new ResizeObserver(() => {
			if (following) scroller.scrollTop = scroller.scrollHeight;
		});
		observer.observe(timeline);
		return () => {
			scroller.removeEventListener("wheel", stop);
			scroller.removeEventListener("touchstart", stop);
			observer.disconnect();
		};
	}, [scroller, timeline]);
	const railDays: RailDay[] = days.map((day, i) => {
		const { name, sub } = dayName(day.date, now, t, i18n.language);
		const entries = day.blocks.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries));
		const lead = [...entries].sort((a, b) => rank(b.size) - rank(a.size))[0];
		return {
			date: day.date,
			name,
			sub,
			lead: lead && lead.size !== "line" ? lead.title : "",
			moment: entries.some((entry) => entry.size === "moment"),
			count: entries.length,
			monthStart: i === 0 || day.date.slice(0, 7) !== days[i - 1]?.date.slice(0, 7),
		};
	});

	return (
		<section
			ref={setTimeline}
			className="memory-timeline"
			aria-label={t("memory.timeline")}
			aria-busy={query.isPending}
		>
			{query.isError && !pageError ? (
				<MemoryError title={t("memory.loadFailed")} error={query.error} retry={() => void refetch()} />
			) : null}
			<div ref={more} className="memory-more">
				{pageError ? (
					<p role="alert" className="memory-error-line">
						{errorText(pageError)}
						<Button size="sm" variant="link" onClick={() => void fetchNextPage()}>
							{t("app.retry")}
						</Button>
					</p>
				) : null}
			</div>
			<TimelineHostProvider value={host}>
				{view.map((day) => (
					<TimelineDaySection key={day.date} day={day} now={now} />
				))}
			</TimelineHostProvider>
			{frame && timeline && scroller && box
				? createPortal(
						<>
							<div
								className="memory-overlay"
								style={
									{
										top: box.top,
										"--memory-column-left": `${box.left}px`,
										"--memory-column-width": `${box.width}px`,
									} as React.CSSProperties
								}
							>
								<MemoryPinBar
									timeline={timeline}
									scroller={scroller}
									today={today}
									now={now}
									onToday={() => scrollToDay(today, true)}
								/>
							</div>
							<MemoryRail
								days={railDays}
								timeline={timeline}
								scroller={scroller}
								style={{ top: box.top + 64, bottom: box.bottom + 24 }}
								onJump={(date) => scrollToDay(date)}
							/>
						</>,
						frame,
					)
				: null}
			{preview ? <AttachmentPreview file={preview} onClose={() => setPreview(undefined)} /> : null}
		</section>
	);
}

function timelineDays(days: MemoryDay[], today: string): MemoryDay[] {
	const current = days.find((day) => day.date === today) ?? {
		date: today,
		state: "ready",
		failure: null,
		digest: { steps: null, places: 0, photos: 0 },
		digestPath: null,
		blocks: [],
	};
	const history = days.flatMap((day) => {
		if (day.date === today) return [];
		// The server only projects scheduled tasks for today. Drop cached ones at midnight.
		const blocks = day.blocks.filter(
			(block) => block.type !== "entry" || block.entry.deletable || !block.entry.id.startsWith("plan-"),
		);
		return blocks.length || day.digestPath || day.state !== "ready" ? [{ ...day, blocks }] : [];
	});
	// One direction, like the Photos app: the oldest day at the top, today at the bottom.
	return [...history.reverse(), current];
}

const rank = (size: string) => ({ line: 0, note: 1, media: 2, moment: 3 })[size] ?? 0;

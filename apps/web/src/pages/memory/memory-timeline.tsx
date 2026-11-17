import type { MemoryDay, MemoryLink } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import { ApiError, useMemoryActions, useMemoryDays } from "@yonder/ui-data";
import { useShellChrome } from "@yonder/ui-shell";
import { History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AttachmentPreview } from "../../preview/attachment-preview.tsx";
import type { PreviewFile } from "../../preview/file-kind.ts";
import { type DayActions, MemoryDaySection } from "./memory-day.tsx";
import { dayName, daysAgo, useMinute } from "./memory-format.ts";
import { useSourceNavigation } from "./memory-navigation.ts";
import { useOverlayBox } from "./memory-overlay.ts";
import { MemoryPinBar } from "./memory-pin.tsx";
import { MemoryRail, type RailDay } from "./memory-rail.tsx";

/**
 * The page under the name card: days newest first, each with its entries on one spine. A pinned
 * bar names the day under the top edge, and a date index waits on the right edge. Both are drawn
 * over the scroller, so neither moves the content.
 */
export function MemoryTimeline() {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	// Wide layouts show the timeline on the white detail page; others in the chrome list column.
	const surface = useShellChrome().mode === "wide" ? "base" : "chrome";
	const query = useMemoryDays();
	const { remove, organize } = useMemoryActions();
	const onSource = useSourceNavigation();
	const [open, setOpen] = useState<string | null>(null);
	const [preview, setPreview] = useState<PreviewFile>();
	const [pending, setPending] = useState<string | null>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const [timeline, setTimeline] = useState<HTMLElement | null>(null);
	const scroller = timeline?.closest<HTMLElement>("[data-frame-scroll]") ?? null;
	const frame = scroller?.parentElement ?? null;
	const box = useOverlayBox(timeline, scroller);
	const days = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
	const today = days.find((day) => daysAgo(day.date, now) === 0)?.date ?? null;
	const more = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = query;
	const pageError = isFetchNextPageError ? (query.error as Error | null) : null;

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
		if (target.querySelector(".memory-drawer")) setOpen(pending);
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
	const actions: DayActions = {
		open,
		flash,
		onToggle: (id) => setOpen((current) => (current === id ? null : id)),
		onLink: (link: MemoryLink) => setPending(link.entryId),
		onPreview: setPreview,
		onSource,
		onDelete: (id) => remove.mutate(id),
		onOrganize: (date) => organize.mutate(date),
		deleting: remove.isPending ? (remove.variables ?? null) : null,
		deleteError: remove.error ? { id: remove.variables ?? "", error: remove.error } : null,
		organizing: organize.isPending ? (organize.variables ?? null) : null,
		organizeError: organize.error ? { date: organize.variables ?? "", error: organize.error } : null,
	};
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
			monthStart: i === 0 || day.date.slice(0, 7) !== days[i - 1]?.date.slice(0, 7),
		};
	});

	if (query.isError)
		return (
			<section className="memory-timeline" aria-label={t("memory.timeline")}>
				<div role="alert" className="memory-error">
					<p>{t("memory.loadFailed")}</p>
					<p>{query.error instanceof ApiError ? t(query.error.messageKey) : query.error.message}</p>
					<Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			</section>
		);
	if (query.isSuccess && !days.length)
		return (
			<EmptyState
				icon={<History size={24} strokeWidth={1.6} />}
				title={t("memory.timeline")}
				body={t("memory.timelineEmpty")}
			/>
		);
	return (
		<section
			ref={setTimeline}
			className="memory-timeline"
			data-memory-surface={surface}
			aria-label={t("memory.timeline")}
			aria-busy={query.isPending}
		>
			{days.map((day: MemoryDay) => (
				<MemoryDaySection key={day.date} day={day} now={now} actions={actions} />
			))}
			<div ref={more} className="memory-more">
				{pageError ? (
					<p role="alert" className="memory-error-line">
						{pageError instanceof ApiError ? t(pageError.messageKey) : pageError.message}
						<Button size="sm" variant="link" onClick={() => void fetchNextPage()}>
							{t("app.retry")}
						</Button>
					</p>
				) : null}
			</div>
			{frame && timeline && scroller && box
				? createPortal(
						<>
							<div
								className="memory-overlay"
								data-memory-surface={surface}
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
									onToday={() => today && scrollToDay(today, true)}
								/>
							</div>
							<MemoryRail
								days={railDays}
								surface={surface}
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

const rank = (size: string) => ({ line: 0, note: 1, media: 2, moment: 3 })[size] ?? 0;

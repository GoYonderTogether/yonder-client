import type { MemoryDay, MemoryLink } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useMemoryActions, useMemoryDays } from "@yonder/ui-data";
<<<<<<< Updated upstream
import { History } from "lucide-react";
=======
import { useShellChrome } from "@yonder/ui-shell";
>>>>>>> Stashed changes
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AttachmentPreview } from "../../preview/attachment-preview.tsx";
import type { PreviewFile } from "../../preview/file-kind.ts";
import { localDay } from "../items-format.ts";
import { type DayActions, MemoryDaySection } from "./memory-day.tsx";
import { dayName, useMinute } from "./memory-format.ts";
import { useSourceNavigation } from "./memory-navigation.ts";
import { useOverlayBox } from "./memory-overlay.ts";
import { MemoryPinBar } from "./memory-pin.tsx";
import { MemoryRail, type RailDay } from "./memory-rail.tsx";
import { MemoryError, useErrorText } from "./memory-status.tsx";

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
		deleting: remove.isPending ? (remove.variables ?? null) : null,
		deleteError: remove.error ? { id: remove.variables ?? "", error: remove.error } : null,
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
			{days.map((day) => (
				<MemoryDaySection key={day.date} day={day} now={now} actions={actions} />
			))}
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
	return [current, ...history];
}

const rank = (size: string) => ({ line: 0, note: 1, media: 2, moment: 3 })[size] ?? 0;

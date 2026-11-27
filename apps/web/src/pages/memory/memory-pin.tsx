import { Button, cn } from "@yonder/ui-components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dayName, memoryFormat } from "./memory-format.ts";

/** Height of the pinned bar; the rail and the title hand-off both measure from it. */
export const PIN_HEIGHT = 52;

/**
 * The pinned day bar. Each day's large title scrolls with the page; once it passes under the bar,
 * the bar shows a compact copy. The next day's title pushes it up and out, then takes its place
 * with a short slide. It overlays the top of the scroller, so it never takes layout space.
 */
export function MemoryPinBar({
	timeline,
	scroller,
	today,
	now,
	onToday,
}: {
	timeline: HTMLElement;
	scroller: HTMLElement;
	today: string;
	now: Date;
	onToday: () => void;
}) {
	const { t, i18n } = useTranslation();
	const bar = useRef<HTMLDivElement>(null);
	const inner = useRef<HTMLDivElement>(null);
	const [date, setDate] = useState("");
	const last = useRef({ date: "", top: 0, down: true });
	// biome-ignore lint/correctness/useExhaustiveDependencies: A new day can replace a section without resizing the timeline.
	useEffect(() => {
		const update = () => {
			const top = bar.current?.getBoundingClientRect().top ?? 0;
			const line = top + PIN_HEIGHT;
			const sections = [...timeline.querySelectorAll<HTMLElement>("[data-day]")];
			let index = -1;
			sections.forEach((section, i) => {
				const title = section.querySelector(".tl-day-head strong");
				if (title && title.getBoundingClientRect().top < top) index = i;
			});
			const current = sections[index];
			last.current.down = scroller.scrollTop >= last.current.top;
			last.current.top = scroller.scrollTop;
			const date = current?.dataset.day ?? "";
			if (date !== last.current.date) {
				last.current.date = date;
				setDate(date);
			}
			// The next title pushes the bar up as it arrives.
			const next = sections[index + 1]?.querySelector(".tl-day-head");
			const element = inner.current;
			if (!element) return;
			const gap = next ? next.getBoundingClientRect().top - line : PIN_HEIGHT;
			const push = Math.max(-PIN_HEIGHT, Math.min(0, gap));
			element.style.transform = push ? `translateY(${push}px)` : "";
			element.style.opacity = push ? String(1 + push / PIN_HEIGHT) : "";
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(timeline);
		return () => {
			scroller.removeEventListener("scroll", update);
			observer.disconnect();
		};
	}, [timeline, scroller, today]);
	// A new day slides in from the direction the reader is scrolling.
	useEffect(() => {
		const element = inner.current;
		if (!date || !element?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		element.animate([{ translate: `0 ${last.current.down ? 60 : -60}%`, opacity: 0 }, { translate: "0 0" }], {
			duration: 280,
			easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",
		});
	}, [date]);
	const day = date ? dayName(date, now, t, i18n.language) : null;
	const isToday = date === today;
	return (
		<div ref={bar} className={cn("memory-pin", day && "memory-pin-shown")} aria-hidden={!day}>
			<div ref={inner} className={cn("memory-pin-inner", isToday && "memory-pin-today")}>
				{day ? (
					<>
						<span className="memory-pin-name">
							<strong>{day.name}</strong>
							<span>{day.sub}</span>
						</span>
						{isToday ? (
							<span className="memory-pin-side">
								{t("memory.now", { time: memoryFormat.time(now, i18n.language) })}
							</span>
						) : (
							<Button size="sm" variant="link" className="memory-pin-side" onClick={onToday}>
								{t("memory.backToToday")}
							</Button>
						)}
					</>
				) : null}
			</div>
		</div>
	);
}

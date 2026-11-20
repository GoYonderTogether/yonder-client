import { cn } from "@yonder/ui-components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PIN_HEIGHT } from "./memory-pin.tsx";

export interface RailDay {
	date: string;
	name: string;
	sub: string;
	lead: string;
	moment: boolean;
	monthStart: boolean;
}

/** How far the magnification reaches around the pointer, in pixels. */
const REACH = 140;
const HOLD_MS = 300;
const SLOP = 8;
const IDLE_MS = 1200;

/**
 * The date index on the right edge. Invisible at rest and above today. While the timeline scrolls,
 * a small grip shows where the reader is. Pointing at the edge with a mouse, or long-pressing it on
 * touch, opens the index: days near the pointer spread apart and grow, far ones shrink to ticks,
 * like the Dock's magnification. Dragging jumps; releasing closes it.
 */
export function MemoryRail({
	days,
	timeline,
	scroller,
	style,
	onJump,
}: {
	days: RailDay[];
	timeline: HTMLElement;
	scroller: HTMLElement;
	style: React.CSSProperties;
	onJump: (date: string) => void;
}) {
	const { t } = useTranslation();
	const rail = useRef<HTMLDivElement>(null);
	const items = useRef<HTMLOListElement>(null);
	const grip = useRef<HTMLSpanElement>(null);
	const [armed, setArmed] = useState(false);
	const [scrolling, setScrolling] = useState(false);
	const [open, setOpen] = useState(false);
	const [pressing, setPressing] = useState(false);
	const [active, setActive] = useState(0);
	const s = useRef({ y: null as number | null, active: 0, press: false, hover: false, idle: 0, hold: 0 });
	s.current.active = active;

	const sections = useCallback(
		() => days.map((day) => timeline.querySelector<HTMLElement>(`[data-day="${day.date}"]`)),
		[days, timeline],
	);
	/** Each day sits on the track at its share of the timeline, so the index matches the scroll. */
	const rest = useCallback(() => {
		const list = sections();
		const height = rail.current?.clientHeight ?? 0;
		const last = list.at(-1);
		const span = Math.max(1, timeline.offsetHeight - (last ? last.offsetHeight / 2 : 0));
		return list.map((section) => ((section?.offsetTop ?? 0) / span) * height);
	}, [sections, timeline]);
	const nearest = useCallback(
		(y: number) => {
			const marks = rest();
			let best = 0;
			marks.forEach((mark, i) => {
				if (Math.abs(mark - y) < Math.abs((marks[best] ?? 0) - y)) best = i;
			});
			return best;
		},
		[rest],
	);

	// Lay out the labels straight on the DOM: this runs on every pointer move.
	const layout = useCallback(() => {
		const list = items.current;
		if (!list) return;
		const marks = rest();
		const y = s.current.y ?? (open ? (marks[s.current.active] ?? null) : null);
		const focus = y == null ? -1 : nearest(y);
		const pos = marks.map((mark) => {
			if (y == null) return mark;
			const d = mark - y;
			return mark + d * Math.max(0, 1 - Math.abs(d) / REACH) * 0.9;
		});
		// Walk out from the focused day and hide labels that would overlap.
		const shown = new Set<number>([Math.max(0, focus)]);
		const gap = (i: number) => (i === focus ? 26 : 18);
		for (const step of [-1, 1]) {
			let last = Math.max(0, focus);
			for (let i = last + step; i >= 0 && i < pos.length; i += step) {
				if (Math.abs((pos[i] ?? 0) - (pos[last] ?? 0)) >= Math.max(gap(i), gap(last))) {
					shown.add(i);
					last = i;
				}
			}
		}
		const height = rail.current?.clientHeight ?? 0;
		[...list.children].forEach((child, i) => {
			const item = child as HTMLElement;
			const p = pos[i] ?? 0;
			const scale = y == null ? 0 : Math.max(0, 1 - Math.abs(p - y) / REACH) ** 0.8;
			const label = i === focus ? 1 : (scale > 0.05 || days[i]?.monthStart) && shown.has(i) ? Math.max(0.45, scale) : 0;
			item.style.top = `${Math.min(height, Math.max(0, p))}px`;
			item.style.setProperty("--memory-rail-scale", scale.toFixed(3));
			item.style.setProperty("--memory-rail-label", label.toFixed(2));
			item.classList.toggle("memory-rail-focus", i === focus);
		});
	}, [days, nearest, open, rest]);

	const scrub = (clientY: number) => {
		const box = rail.current?.getBoundingClientRect();
		if (!box) return;
		s.current.y = Math.min(box.height, Math.max(0, clientY - box.top));
		const i = nearest(s.current.y);
		if (i !== s.current.active) {
			s.current.active = i;
			setActive(i);
			const day = days[i];
			if (day) onJump(day.date);
			navigator.vibrate?.(4);
		}
		layout();
	};

	// Track the scroll: arm the rail inside the timeline, move the grip, find the current day.
	useEffect(() => {
		const state = s.current;
		const update = () => {
			const view = (rail.current?.getBoundingClientRect().top ?? 0) - PIN_HEIGHT;
			const inside = timeline.getBoundingClientRect().top < view + PIN_HEIGHT;
			setArmed(inside);
			if (!inside) {
				setOpen(false);
				setScrolling(false);
				return;
			}
			if (!state.press) {
				let current = 0;
				sections().forEach((section, i) => {
					if (section && section.getBoundingClientRect().top <= view + PIN_HEIGHT + 12) current = i;
				});
				setActive(current);
				const mark = rest()[current] ?? 0;
				const height = rail.current?.clientHeight ?? 0;
				if (grip.current) grip.current.style.top = `${Math.max(20, Math.min(height - 20, mark))}px`;
			}
			setScrolling(true);
			window.clearTimeout(state.idle);
			state.idle = window.setTimeout(() => {
				setScrolling(false);
				if (!state.press && !state.hover) setOpen(false);
			}, IDLE_MS);
		};
		scroller.addEventListener("scroll", update, { passive: true });
		return () => {
			scroller.removeEventListener("scroll", update);
			window.clearTimeout(state.idle);
			window.clearTimeout(state.hold);
		};
	}, [scroller, timeline, sections, rest]);
	useEffect(() => {
		if (!open) s.current.y = null;
		layout();
	});

	const start = useRef<{ x: number; y: number; id: number } | null>(null);
	const capture = (target: HTMLElement, id: number) => {
		try {
			target.setPointerCapture(id);
		} catch {
			// The pointer was already released.
		}
	};
	const press = (target: HTMLElement, id: number, y: number) => {
		s.current.press = true;
		setPressing(true);
		setOpen(true);
		capture(target, id);
		scrub(y);
	};
	const release = (event: React.PointerEvent) => {
		window.clearTimeout(s.current.hold);
		start.current = null;
		if (!s.current.press) return;
		s.current.press = false;
		setPressing(false);
		if (event.pointerType !== "mouse" || !s.current.hover)
			window.setTimeout(() => !s.current.press && setOpen(false), 350);
	};
	const step = (delta: number) => {
		const i = Math.min(days.length - 1, Math.max(0, s.current.active + delta));
		setActive(i);
		const day = days[i];
		if (day) onJump(day.date);
	};
	if (days.length < 2) return null;
	return (
		<div
			ref={rail}
			role="slider"
			tabIndex={armed ? 0 : -1}
			aria-label={t("memory.jumpDay")}
			aria-orientation="vertical"
			aria-valuemin={0}
			aria-valuemax={days.length - 1}
			aria-valuenow={active}
			aria-valuetext={days[active] ? `${days[active].name} ${days[active].sub}` : undefined}
			className={cn(
				"memory-rail",
				armed && "memory-rail-armed",
				scrolling && "memory-rail-scrolling",
				open && "memory-rail-open",
				pressing && "memory-rail-pressing",
			)}
			style={style}
			onFocus={() => armed && setOpen(true)}
			onBlur={() => setOpen(false)}
			onKeyDown={(event) => {
				const delta = { ArrowDown: 1, ArrowUp: -1, PageDown: 7, PageUp: -7 }[event.key];
				if (delta === undefined) return;
				event.preventDefault();
				step(delta);
			}}
		>
			<div className="memory-rail-scrim" aria-hidden />
			<ol ref={items} className="memory-rail-items" aria-hidden>
				{days.map((day, i) => (
					<li
						key={day.date}
						className={cn(
							"memory-rail-item",
							day.monthStart && "memory-rail-month",
							day.moment && "memory-rail-moment",
							i === active && "memory-rail-active",
						)}
					>
						<span className="memory-rail-label">
							<span>
								<b>{day.name}</b> {day.sub}
							</span>
							{day.lead ? <small>{day.lead}</small> : null}
						</span>
						<span className="memory-rail-tick" />
					</li>
				))}
			</ol>
			<span ref={grip} className="memory-rail-grip" aria-hidden />
			<span
				className="memory-rail-zone"
				aria-hidden
				onContextMenu={(event) => event.preventDefault()}
				onPointerEnter={(event) => {
					if (event.pointerType !== "mouse" || !armed) return;
					s.current.hover = true;
					setOpen(true);
					s.current.y = event.clientY - (rail.current?.getBoundingClientRect().top ?? 0);
				}}
				onPointerLeave={(event) => {
					if (event.pointerType !== "mouse" || s.current.press) return;
					s.current.hover = false;
					setOpen(false);
				}}
				onPointerDown={(event) => {
					if (!armed) return;
					const target = event.currentTarget;
					if (event.pointerType === "mouse") {
						event.preventDefault();
						press(target, event.pointerId, event.clientY);
						return;
					}
					// Touch: only a long press opens it, so a swipe along the edge still scrolls.
					start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
					window.clearTimeout(s.current.hold);
					s.current.hold = window.setTimeout(() => {
						if (start.current) press(target, start.current.id, start.current.y);
					}, HOLD_MS);
				}}
				onPointerMove={(event) => {
					if (s.current.press) return scrub(event.clientY);
					const from = start.current;
					if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLOP) {
						window.clearTimeout(s.current.hold);
						start.current = null;
					}
					if (event.pointerType === "mouse" && open) {
						s.current.y = event.clientY - (rail.current?.getBoundingClientRect().top ?? 0);
						layout();
					}
				}}
				onPointerUp={release}
				onPointerCancel={release}
			/>
		</div>
	);
}

import { cn } from "@yonder/ui-components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The scroll index on the right edge. Hidden until the reader scrolls the timeline, then a thin
 * track with one tick per month and a pill showing where they are. Pressing and dragging the track
 * jumps by month; it fades out 1.2 s after scrolling stops. A zero-height sticky anchor holds it,
 * so it never takes layout space.
 */
export function MemoryRail({
	months,
	current,
	onJump,
}: {
	months: { key: string; label: string }[];
	current: string | null;
	onJump: (month: string) => void;
}) {
	const { t } = useTranslation();
	const anchor = useRef<HTMLDivElement>(null);
	const track = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [height, setHeight] = useState(0);
	const [dragging, setDragging] = useState(false);
	const hold = useRef({ over: false, dragging: false, timer: 0 });
	useEffect(() => {
		const root = anchor.current?.closest<HTMLElement>("[data-frame-scroll]");
		const timeline = anchor.current?.parentElement;
		if (!root || !timeline) return;
		const state = hold.current;
		const measure = () => setHeight(root.clientHeight);
		const onScroll = () => {
			const box = root.getBoundingClientRect();
			setVisible(timeline.getBoundingClientRect().top < box.top + box.height / 3);
			window.clearTimeout(state.timer);
			state.timer = window.setTimeout(() => {
				if (!state.over && !state.dragging) setVisible(false);
			}, 1200);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		root.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			observer.disconnect();
			root.removeEventListener("scroll", onScroll);
			window.clearTimeout(state.timer);
		};
	}, []);
	if (months.length < 2) return <div ref={anchor} className="memory-rail-anchor" />;
	const index = Math.max(
		0,
		months.findIndex((month) => month.key === current),
	);
	const position = (i: number) => `${(i / (months.length - 1)) * 100}%`;
	const pick = (y: number) => {
		const box = track.current?.getBoundingClientRect();
		if (!box) return;
		const ratio = Math.min(1, Math.max(0, (y - box.top) / box.height));
		const month = months[Math.round(ratio * (months.length - 1))];
		if (month && month.key !== current) onJump(month.key);
	};
	const release = () => {
		hold.current.dragging = false;
		setDragging(false);
	};
	const step = (delta: number) => {
		const month = months[Math.min(months.length - 1, Math.max(0, index + delta))];
		if (month) onJump(month.key);
	};
	return (
		<div ref={anchor} className="memory-rail-anchor">
			<div
				role="slider"
				tabIndex={0}
				aria-label={t("memory.jumpMonth")}
				aria-orientation="vertical"
				aria-valuemin={0}
				aria-valuemax={months.length - 1}
				aria-valuenow={index}
				aria-valuetext={months[index]?.label}
				className={cn(
					"memory-rail",
					(visible || dragging) && "memory-rail-visible",
					dragging && "memory-rail-dragging",
				)}
				style={{ height: Math.max(0, height - 128) }}
				onPointerEnter={() => {
					hold.current.over = true;
				}}
				onPointerLeave={() => {
					hold.current.over = false;
				}}
				onPointerDown={(event) => {
					hold.current.dragging = true;
					setDragging(true);
					event.currentTarget.setPointerCapture(event.pointerId);
					pick(event.clientY);
					event.preventDefault();
				}}
				onPointerMove={(event) => {
					if (hold.current.dragging) pick(event.clientY);
				}}
				onPointerUp={release}
				onPointerCancel={release}
				onFocus={() => setVisible(true)}
				onKeyDown={(event) => {
					const delta = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[event.key];
					if (delta === undefined) return;
					event.preventDefault();
					step(delta);
				}}
			>
				<div ref={track} className="memory-rail-track">
					{months.map((month, i) => (
						<span
							key={month.key}
							aria-hidden
							className={cn("memory-rail-tick", month.key.endsWith("-01") && "memory-rail-tick-year")}
							style={{ top: position(i) }}
						/>
					))}
					<span aria-hidden className="memory-rail-thumb" style={{ top: position(index) }}>
						{months[index]?.label}
					</span>
				</div>
			</div>
		</div>
	);
}

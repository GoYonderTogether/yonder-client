import { useLayoutEffect, useState } from "react";

export interface OverlayBox {
	/** The scroller's visible top inside the frame, below any native header that floats over it. */
	top: number;
	bottom: number;
	/** The timeline column, so overlay content lines up with the entries. */
	left: number;
	width: number;
}

/**
 * Where the timeline's overlays (pinned day bar, date rail) sit inside the frame. They are drawn
 * over the scroller rather than inside it, so they span its full width and never take layout space.
 */
export function useOverlayBox(timeline: HTMLElement | null, scroller: HTMLElement | null) {
	const [box, setBox] = useState<OverlayBox | null>(null);
	useLayoutEffect(() => {
		const frame = scroller?.parentElement;
		if (!timeline || !scroller || !frame) return;
		const measure = () => {
			const outer = frame.getBoundingClientRect();
			const view = scroller.getBoundingClientRect();
			const column = timeline.getBoundingClientRect();
			const style = getComputedStyle(scroller);
			const padTop = Number.parseFloat(style.paddingTop) || 0;
			const padBottom = Number.parseFloat(style.paddingBottom) || 0;
			const next = {
				top: view.top - outer.top + (document.documentElement.dataset.nativeMobile === "true" ? padTop : 0),
				bottom: outer.bottom - view.bottom + (document.documentElement.dataset.nativeMobile === "true" ? padBottom : 0),
				left: column.left - outer.left,
				width: column.width,
			};
			setBox((current) =>
				current &&
				current.top === next.top &&
				current.bottom === next.bottom &&
				current.left === next.left &&
				current.width === next.width
					? current
					: next,
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		observer.observe(timeline);
		return () => observer.disconnect();
	}, [timeline, scroller]);
	return box;
}

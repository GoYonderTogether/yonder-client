import { useCallback, useEffect, useRef, useState } from "react";
import { LIST_PANE_DEFAULT, LIST_PANE_MIN } from "../responsive/layout-mode.ts";

/** Measure the space shared by the two panes, excluding the navigation rail. */
export function usePaneLayout() {
	const panes = useRef<HTMLDivElement>(null);
	const [available, setAvailable] = useState(1024);
	const [width, setWidth] = useState(LIST_PANE_DEFAULT);
	const [dragging, setDragging] = useState(false);
	useEffect(() => {
		const element = panes.current;
		if (!element) return;
		const update = (value: number) => {
			if (value > 0) setAvailable(value);
		};
		const observer = new ResizeObserver(([entry]) => update(entry?.contentRect.width ?? 0));
		observer.observe(element);
		update(element.getBoundingClientRect().width);
		return () => observer.disconnect();
	}, []);
	const resize = useCallback((value: number) => {
		setWidth(Math.max(LIST_PANE_MIN, value));
	}, []);
	const current = Math.min(available, width);
	return {
		panes,
		available,
		width: current,
		resize,
		dragging,
		setDragging,
		collapsed: current / available > 0.82,
	};
}

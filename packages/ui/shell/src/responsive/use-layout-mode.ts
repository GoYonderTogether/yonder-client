import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { LayoutMode } from "./layout-mode.ts";
import { layoutMode } from "./layout-mode.ts";

/**
 * Watch one element's width and answer which layout fits. `ResizeObserver` rather than `matchMedia`
 * because the pane can be narrow inside a wide window, and because the desktop shell can resize
 * the window without firing a media query the app trusts.
 */
export function useLayoutMode(ref: RefObject<HTMLElement | null>, fallbackWidth = 1024): LayoutMode {
	const [mode, setMode] = useState<LayoutMode>(() => layoutMode(fallbackWidth));

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width !== undefined) setMode(layoutMode(width));
		});
		observer.observe(element);
		setMode(layoutMode(element.getBoundingClientRect().width || fallbackWidth));
		return () => observer.disconnect();
	}, [ref, fallbackWidth]);

	return mode;
}

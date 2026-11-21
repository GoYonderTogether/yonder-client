import type { RefObject } from "react";
import { useEffect } from "react";

const INTERACTIVE = "input, textarea, select, button, a, label, [contenteditable=true], [role=button], [role=option]";

/**
 * While the keyboard is up, dragging the page content down or tapping an empty part of it puts the
 * keyboard away, as in Messages and WeChat. The composer and the controls keep their own taps.
 */
export function useKeyboardDismiss(ref: RefObject<HTMLElement | null>, keyboard: boolean) {
	useEffect(() => {
		const root = ref.current;
		if (!keyboard || !root) return;
		let start: { x: number; y: number; tap: boolean } | null = null;
		const dismiss = () => {
			const focused = document.activeElement;
			if (focused instanceof HTMLElement && root.contains(focused)) focused.blur();
		};
		const down = (event: TouchEvent) => {
			const touch = event.touches[0];
			const target = event.target as Element | null;
			start =
				touch && target?.closest("[data-frame-scroll]") && !target.closest("[data-mobile-dock]")
					? { x: touch.clientX, y: touch.clientY, tap: true }
					: null;
		};
		const move = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!start || !touch) return;
			const dy = touch.clientY - start.y;
			if (dy > 24 && dy > Math.abs(touch.clientX - start.x)) {
				start = null;
				dismiss();
			} else if (Math.abs(dy) > 8 || Math.abs(touch.clientX - start.x) > 8) start.tap = false;
		};
		const up = (event: TouchEvent) => {
			const target = event.target as Element | null;
			if (start?.tap && !target?.closest(INTERACTIVE) && !window.getSelection()?.toString()) dismiss();
			start = null;
		};
		root.addEventListener("touchstart", down, { passive: true });
		root.addEventListener("touchmove", move, { passive: true });
		root.addEventListener("touchend", up, { passive: true });
		return () => {
			root.removeEventListener("touchstart", down);
			root.removeEventListener("touchmove", move);
			root.removeEventListener("touchend", up);
		};
	}, [ref, keyboard]);
}

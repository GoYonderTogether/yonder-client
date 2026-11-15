/**
 * Dispatch Escape to the topmost active layer; buttons, history and gestures use the same callback.
 * Layout cleanup removes an exiting layer before another Escape can reach its stale callback.
 */
import { useLayoutEffect, useRef } from "react";

const activeLayers: { priority: number }[] = [];

export function useDismiss(active: boolean, onDismiss: () => void, priority = 0): void {
	const dismiss = useRef(onDismiss);
	dismiss.current = onDismiss;
	useLayoutEffect(() => {
		if (!active) return;
		const layer = { priority };
		activeLayers.push(layer);
		const handler = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const top = activeLayers.reduce((current, item) => (item.priority >= current.priority ? item : current));
			if (top !== layer || event.isComposing) return;
			if (event.defaultPrevented) return;
			event.preventDefault();
			dismiss.current();
		};
		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("keydown", handler);
			activeLayers.splice(activeLayers.indexOf(layer), 1);
		};
	}, [active, priority]);
}

/**
 * A horizontal swipe that closes a panel: right on desktop and on iOS, left or right on a phone
 * detail page. Deliberately simple — one axis, one threshold, no velocity.
 */
export interface SwipeHandlers {
	onPointerDown: (event: React.PointerEvent) => void;
	onPointerUp: (event: React.PointerEvent) => void;
}

export function swipeToDismiss(onDismiss: () => void, options: { threshold?: number } = {}): SwipeHandlers {
	const threshold = options.threshold ?? 80;
	let startX: number | null = null;
	let startY: number | null = null;

	return {
		onPointerDown(event) {
			startX = event.clientX;
			startY = event.clientY;
		},
		onPointerUp(event) {
			if (startX === null || startY === null) return;
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			startX = null;
			startY = null;
			if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) onDismiss();
		},
	};
}

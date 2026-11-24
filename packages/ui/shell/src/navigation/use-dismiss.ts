/**
 * Dispatch Escape, the system's Back and a swipe to the topmost active layer; buttons and history
 * use the same callback. Layout cleanup removes an exiting layer before another press can reach its
 * stale callback.
 */
import { useLayoutEffect, useRef } from "react";

interface ActiveLayer {
	priority: number;
	dismiss: () => void;
}

const activeLayers: ActiveLayer[] = [];

/** The topmost open layer, the one Escape, the system's Back and a gesture close first. */
export function topLayer<T extends { priority: number }>(layers: readonly T[]): T | null {
	return layers.reduce<T | null>((top, layer) => (!top || layer.priority >= top.priority ? layer : top), null);
}

/** Whether any layer is open, so the system's Back should close one before it moves history. */
export function hasOpenLayer(): boolean {
	return activeLayers.length > 0;
}

/** Closes the topmost open layer. False when nothing is open, so the caller can carry on outward. */
export function dismissTopLayer(): boolean {
	const top = topLayer(activeLayers);
	if (!top) return false;
	top.dismiss();
	return true;
}

export function useDismiss(active: boolean, onDismiss: () => void, priority = 0): void {
	const dismiss = useRef(onDismiss);
	dismiss.current = onDismiss;
	useLayoutEffect(() => {
		if (!active) return;
		const layer: ActiveLayer = { priority, dismiss: () => dismiss.current() };
		activeLayers.push(layer);
		const handler = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (topLayer(activeLayers) !== layer || event.isComposing) return;
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

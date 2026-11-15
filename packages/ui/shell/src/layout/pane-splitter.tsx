import type { KeyboardEvent, PointerEvent } from "react";
import { useCallback, useRef } from "react";

export interface PaneSplitterProps {
	width: number;
	min: number;
	max: number;
	onResize: (width: number) => void;
	label: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/**
 * The drag handle on a column's trailing edge: invisible until hovered, 8px of hit area, and a
 * focusable separator so it can be moved with the arrow keys (10-质量 第二节).
 */
export function PaneSplitter({ width, min, max, onResize, label }: PaneSplitterProps) {
	const dragStart = useRef<{ x: number; width: number } | null>(null);

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			dragStart.current = { x: event.clientX, width };
		},
		[width],
	);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!dragStart.current) return;
			onResize(clamp(dragStart.current.width + event.clientX - dragStart.current.x, min, max));
		},
		[onResize, min, max],
	);

	const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
		dragStart.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			const step = event.shiftKey ? 48 : 16;
			if (event.key === "ArrowLeft") onResize(clamp(width - step, min, max));
			else if (event.key === "ArrowRight") onResize(clamp(width + step, min, max));
			else if (event.key === "Home") onResize(min);
			else if (event.key === "End") onResize(max);
			else return;
			event.preventDefault();
		},
		[width, onResize, min, max],
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: a separator with a value is not a native input.
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={width}
			tabIndex={0}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onKeyDown={handleKeyDown}
			className="group absolute inset-y-0 -end-1 z-10 w-2 cursor-col-resize outline-none"
		>
			<span className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-[var(--duration-fast)] group-hover:bg-[var(--color-border-strong)] group-focus-visible:bg-[var(--color-accent)]" />
		</div>
	);
}

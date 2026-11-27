import type { KeyboardEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { stepPaneSpring } from "./pane-spring.ts";

export interface PaneSplitterProps {
	width: number;
	min: number;
	max: number;
	onResize: (width: number) => void;
	label: string;
	onDragChange?: (dragging: boolean) => void;
	onReset?: () => void;
	edge?: "start" | "end";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/** Captured pointer dragging and keyboard resizing share the same width bounds. */
export function PaneSplitter({
	width,
	min,
	max,
	onResize,
	label,
	onDragChange,
	onReset,
	edge = "end",
}: PaneSplitterProps) {
	const direction = edge === "end" ? 1 : -1;
	const drag = useRef<{
		x: number;
		width: number;
		target: number;
		position: number;
		velocity: number;
		time: number;
		pointer: number;
		element: HTMLDivElement;
		frame: number | null;
		released: boolean;
	} | null>(null);

	const finish = useCallback(
		(restore: boolean) => {
			const current = drag.current;
			if (!current) return;
			drag.current = null;
			if (current.frame !== null) cancelAnimationFrame(current.frame);
			onResize(restore ? current.width : current.target);
			onDragChange?.(false);
			if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
		},
		[onResize, onDragChange],
	);

	useEffect(() => {
		const onEscape = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape" || event.isComposing || !drag.current || drag.current.released) return;
			event.preventDefault();
			event.stopPropagation();
			finish(true);
		};
		window.addEventListener("keydown", onEscape, true);
		return () => {
			window.removeEventListener("keydown", onEscape, true);
			const current = drag.current;
			if (!current) return;
			drag.current = null;
			if (current.frame !== null) cancelAnimationFrame(current.frame);
			if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
			onDragChange?.(false);
		};
	}, [finish, onDragChange]);

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current || current.released || current.pointer !== event.pointerId) return;
		current.target = clamp(current.width + direction * (event.clientX - current.x), min, max);
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
			current.position = current.target;
			onResize(current.target);
			return;
		}
		if (current.frame !== null) return;
		const tick = (now: number) => {
			if (drag.current !== current) return;
			const next = stepPaneSpring(
				current.position,
				current.velocity,
				current.target,
				Math.min((now - current.time) / 1000, 0.064),
			);
			current.time = now;
			current.position = Math.min(
				Math.max(next.position, Math.min(current.position, current.target)),
				Math.max(current.position, current.target),
			);
			current.velocity = current.position === next.position ? next.velocity : 0;
			onResize(clamp(current.position, min, max));
			if (Math.abs(current.target - current.position) < 0.1 && Math.abs(current.velocity) < 0.1) {
				current.frame = null;
				onResize(current.target);
				if (current.released) drag.current = null;
			} else current.frame = requestAnimationFrame(tick);
		};
		current.time = performance.now();
		current.frame = requestAnimationFrame(tick);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? 48 : 16;
		if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) finish(false);
		if (event.key === "ArrowLeft") onResize(clamp(width - direction * step, min, max));
		else if (event.key === "ArrowRight") onResize(clamp(width + direction * step, min, max));
		else if (event.key === "Home") onResize(min);
		else if (event.key === "End") onResize(max);
		else if (event.key === "Enter") onReset?.();
		else return;
		event.preventDefault();
	};

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
			onPointerDown={(event) => {
				if (event.button !== 0 || (drag.current && !drag.current.released)) return;
				if (drag.current?.frame !== null && drag.current?.frame !== undefined) cancelAnimationFrame(drag.current.frame);
				event.preventDefault();
				event.currentTarget.focus();
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = {
					x: event.clientX,
					width,
					target: width,
					position: width,
					velocity: 0,
					time: performance.now(),
					pointer: event.pointerId,
					element: event.currentTarget,
					frame: null,
					released: false,
				};
				onDragChange?.(true);
			}}
			onPointerMove={handlePointerMove}
			onPointerUp={() => {
				const current = drag.current;
				if (!current) return;
				current.released = true;
				onDragChange?.(false);
				if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
				if (current.frame === null) drag.current = null;
			}}
			onPointerCancel={() => finish(true)}
			onLostPointerCapture={() => {
				if (!drag.current?.released) finish(true);
			}}
			onDoubleClick={() => {
				finish(false);
				onReset?.();
			}}
			onKeyDown={handleKeyDown}
			className={`group absolute inset-y-0 ${edge === "end" ? "-end-1" : "-start-1"} z-40 w-2 touch-none cursor-col-resize select-none outline-none`}
		>
			<span className="pointer-events-none absolute inset-y-0 start-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-[var(--duration-fast)] group-hover:bg-[var(--color-border-strong)] group-focus-visible:bg-[var(--color-accent)]" />
		</div>
	);
}

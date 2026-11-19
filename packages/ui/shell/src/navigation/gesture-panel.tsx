import { cn } from "@yonder/ui-components";
import { SPRING } from "@yonder/ui-tokens";
import { animate, motion, useMotionValue, usePresence, useReducedMotion } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "./use-dismiss.ts";

export interface GesturePanelProps {
	open: boolean;
	inline?: boolean;
	initial?: boolean;
	active?: boolean;
	side?: "left" | "right" | "bottom";
	layerKey: string;
	onBack: () => void;
	children: ReactNode;
	className?: string;
	label?: string;
	modal?: boolean;
	role?: "dialog" | "region";
	priority?: number;
}

/** Shared navigation surface: direct pointer tracking, interruptible spring settling, one exit. */
export function GesturePanel({
	open,
	inline = false,
	initial = true,
	active = true,
	side = "right",
	layerKey,
	onBack,
	children,
	className,
	label,
	modal = false,
	role = modal ? "dialog" : "region",
	priority = 0,
}: GesturePanelProps) {
	const panel = useRef<HTMLElement>(null);
	const x = useMotionValue(0);
	const reduced = useReducedMotion();
	const [present, remove] = usePresence();
	const shown = open && present !== false;
	const retained = useRef(children);
	if (shown || inline) retained.current = children;
	const [visible, setVisible] = useState(open || inline);
	const initialized = useRef(false);
	const animation = useRef<ReturnType<typeof animate> | null>(null);
	const direction = side === "left" ? -1 : 1;
	const vertical = side === "bottom";
	const gesture = useRef<{
		id: number;
		startX: number;
		startY: number;
		offset: number;
		lastX: number;
		lastTime: number;
		velocity: number;
		dragging: boolean;
	} | null>(null);
	const dragged = useRef(false);
	const dismiss = useRef(onBack);
	dismiss.current = onBack;
	useDismiss(shown && active && !inline, onBack, priority);

	useLayoutEffect(() => {
		const element = panel.current;
		if (!element) return;
		const bounds = element.getBoundingClientRect();
		const width = vertical ? bounds.height : bounds.width;
		animation.current?.stop();
		if (inline) {
			x.set(0);
			setVisible(true);
			initialized.current = true;
			return;
		}
		if (shown) {
			setVisible(true);
			if (!initialized.current) x.jump(reduced || !initial ? 0 : direction * width);
		}
		initialized.current = true;
		if (reduced) {
			x.set(shown ? 0 : direction * width);
			if (!shown) {
				setVisible(false);
			}
			return;
		}
		animation.current = animate(x, shown ? 0 : direction * width, {
			type: "spring",
			...SPRING.panel,
			velocity: x.getVelocity(),
			onComplete: () => {
				if (!shown) {
					setVisible(false);
					remove?.();
				}
			},
		});
		return () => animation.current?.stop();
	}, [shown, inline, initial, direction, vertical, reduced, remove, x]);

	// Complete immediate exits after Motion has committed its presence bookkeeping.
	useEffect(() => {
		if ((inline || reduced) && !shown) remove?.();
	}, [inline, reduced, shown, remove]);

	useEffect(() => {
		if (!shown || !active || role !== "dialog") return;
		const previous = document.activeElement as HTMLElement | null;
		panel.current?.focus({ preventScroll: true });
		return () => {
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, [shown, active, role]);

	function finish(event: PointerEvent<HTMLElement>, cancel: boolean) {
		const current = gesture.current;
		if (!current || current.id !== event.pointerId) return;
		gesture.current = null;
		if (!current.dragging) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
		const bounds = event.currentTarget.getBoundingClientRect();
		const width = vertical ? bounds.height : bounds.width;
		const velocity = performance.now() - current.lastTime > 100 ? 0 : current.velocity;
		const projected = direction * (x.get() + velocity * 0.18);
		if (!cancel && direction * velocity > -200 && projected > width * 0.35) dismiss.current();
		// A router blocker can reject the exit. Settle back unless the controlled route actually closes.
		if (reduced) {
			x.set(0);
			return;
		}
		animation.current = animate(x, 0, {
			type: "spring",
			...SPRING.panel,
			velocity,
		});
	}

	return (
		<motion.section
			ref={panel}
			data-page-layer={layerKey}
			data-page-side={side}
			aria-label={label}
			role={role}
			aria-modal={modal && shown && active ? true : undefined}
			aria-hidden={!visible || !active || undefined}
			inert={(!shown && !inline) || !active}
			tabIndex={-1}
			style={{
				...(vertical ? { y: x } : { x }),
				visibility: visible || inline ? "visible" : "hidden",
				touchAction: inline || vertical ? "auto" : "pan-y",
			}}
			className={cn(
				inline
					? "relative flex min-h-0 min-w-0 flex-1 flex-col"
					: "absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[var(--color-bg-base)]",
				className,
			)}
			onPointerDown={(event) => {
				if (!shown || !active || inline || event.button !== 0 || !event.isPrimary) return;
				dragged.current = false;
				const target = event.target as HTMLElement;
				if (target.closest("[data-page-layer]") !== event.currentTarget) return;
				if (vertical && !target.closest("[data-sheet-handle]")) return;
				if (
					target.closest("input, textarea, select, button, a, [contenteditable=true], [role=slider], [role=separator]")
				)
					return;
				const rect = event.currentTarget.getBoundingClientRect();
				// Edge initiation preserves text selection and horizontal controls in the page body.
				const edge = vertical
					? event.clientY - rect.top
					: direction > 0
						? event.clientX - rect.left
						: rect.right - event.clientX;
				if (edge > 32) return;
				gesture.current = {
					id: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					offset: x.get(),
					lastX: vertical ? event.clientY : event.clientX,
					lastTime: performance.now(),
					velocity: 0,
					dragging: false,
				};
			}}
			onPointerMove={(event) => {
				const current = gesture.current;
				if (!current || current.id !== event.pointerId) return;
				const dx = vertical ? event.clientY - current.startY : event.clientX - current.startX;
				const dy = vertical ? event.clientX - current.startX : event.clientY - current.startY;
				if (!current.dragging) {
					if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
						gesture.current = null;
						return;
					}
					if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
					animation.current?.stop();
					current.offset = x.get();
					if (vertical) current.startY = event.clientY;
					else current.startX = event.clientX;
					current.dragging = true;
					dragged.current = true;
					event.currentTarget.setPointerCapture(event.pointerId);
				}
				event.preventDefault();
				const now = performance.now();
				const point = vertical ? event.clientY : event.clientX;
				current.velocity = ((point - current.lastX) / Math.max(1, now - current.lastTime)) * 1000;
				current.lastX = point;
				current.lastTime = now;
				const bounds = event.currentTarget.getBoundingClientRect();
				const width = vertical ? bounds.height : bounds.width;
				const start = vertical ? current.startY : current.startX;
				x.set(direction * Math.min(width, Math.max(0, direction * (current.offset + point - start))));
			}}
			onPointerUp={(event) => finish(event, false)}
			onPointerCancel={(event) => finish(event, true)}
			onLostPointerCapture={(event) => {
				// Touch initially captures the child under the finger. Transferring capture to this
				// panel bubbles the child's loss here, even though the panel now owns the pointer.
				if (event.target === event.currentTarget) finish(event, true);
			}}
			onClickCapture={(event) => {
				if (dragged.current) {
					event.preventDefault();
					event.stopPropagation();
					dragged.current = false;
				}
			}}
			onKeyDown={(event) => {
				if (!modal || !active || event.key !== "Tab") return;
				const controls = panel.current?.querySelectorAll<HTMLElement>(
					"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']",
				);
				const available = [...(controls ?? [])].filter(
					(element) => !element.closest("[inert], [hidden], [aria-hidden=true]"),
				);
				const first = available[0];
				const last = available.at(-1);
				if (!first) {
					event.preventDefault();
					panel.current?.focus();
				} else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
					event.preventDefault();
					first.focus();
				}
			}}
		>
			{retained.current}
		</motion.section>
	);
}

import { cn } from "@yonder/ui-components";
import { SPRING } from "@yonder/ui-tokens";
import { animate, motion, useMotionValue, usePresence, useReducedMotion, useTransform } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	closeDistance,
	EDGE_WIDTH,
	releasedToClose,
	releaseVelocity,
	type Sample,
	SLOP,
	SLOP_RATIO,
	track,
} from "./back-gesture.ts";
import { shellHaptic } from "./feedback.ts";
import { clearRecede, coversPageBelow, pageBelow, recede } from "./page-below.ts";
import { useDismiss } from "./use-dismiss.ts";

export interface GesturePanelProps {
	open: boolean;
	inline?: boolean;
	initial?: boolean;
	/** Let a history-backed page exit immediately unless this panel already owns the drag. */
	instantBack?: boolean;
	active?: boolean;
	side?: "left" | "right" | "bottom";
	layerKey: string;
	onBack: () => void;
	onExpand?: (() => void) | undefined;
	children: ReactNode;
	className?: string;
	label?: string;
	modal?: boolean;
	role?: "dialog" | "region";
	priority?: number;
}

/** One finger's gesture, measured once: a move never has to read layout again. */
interface Drag {
	id: number;
	startX: number;
	startY: number;
	/** Distance toward closing when the finger took the layer. */
	moved: number;
	/** Room above a tall sheet it can expand into, 0 for every other layer. */
	room: number;
	size: number;
	fromBackdrop: boolean;
	dragging: boolean;
	samples: Sample[];
	lastTime: number;
}

/**
 * Shared navigation surface: a page follows a finger from its closing edge and settles where the
 * release leaves it. With `inline` it is the visible page itself, and back is a button.
 *
 * The release thresholds and their unit tests live alongside `back-gesture.ts`.
 */
export function GesturePanel({
	open,
	inline = false,
	initial = true,
	instantBack = false,
	active = true,
	side = "right",
	layerKey,
	onBack,
	onExpand,
	children,
	className,
	label,
	modal = false,
	role = modal ? "dialog" : "region",
	priority = 0,
}: GesturePanelProps) {
	const panel = useRef<HTMLElement>(null);
	const x = useMotionValue(0);
	const sheetOffset = useTransform(x, (value) => Math.max(0, value));
	const sheetExpansion = useTransform(x, (value) => `${Math.max(0, -value)}px`);
	const handedOff = useRef(false);
	const reduced = useReducedMotion();
	const [present, remove] = usePresence();
	const shown = open && present !== false;
	const retained = useRef(children);
	if (shown || inline) retained.current = children;
	const [visible, setVisible] = useState(open || inline);
	// An exit animation can finish after the layer is back open; completion reads the live state.
	const openRef = useRef(shown);
	openRef.current = shown;
	const initialized = useRef(false);
	const animation = useRef<ReturnType<typeof animate> | null>(null);
	const settle = useRef<ReturnType<typeof animate> | null>(null);
	const direction = side === "left" ? -1 : 1;
	const vertical = side === "bottom";
	const gesture = useRef<Drag | null>(null);
	/** The size the layer is measured at, for the page beneath and for release distances. */
	const size = useRef(0);
	/** The page under this one, while a gesture or a transition shows it. */
	const under = useRef<HTMLElement | null>(null);
	/** A drag's release speed, including zero. Button and system Back have no drag to hand off. */
	const handoff = useRef<number | null>(null);
	const skipExit =
		!shown &&
		(!initialized.current || inline || reduced || handedOff.current || (instantBack && handoff.current === null));
	const dragged = useRef(false);
	const armed = useRef(false);
	const dismiss = useRef(onBack);
	dismiss.current = onBack;
	useDismiss(shown && active && !inline, onBack, priority);
	// A layer removed mid-transition must not leave the page it revealed held aside.
	useEffect(() => () => clearRecede(under.current), []);

	/** How far the layer is dragged toward closing, positive on either side. */
	const distance = () => direction * x.get();
	/** The share of the page beneath that this layer currently exposes: 0 covered, 1 gone. */
	const showUnder = useCallback(
		(moved: number) => recede(under.current, size.current ? moved / size.current : 1, size.current, direction),
		[direction],
	);
	const hideUnder = useCallback(() => clearRecede(under.current), []);
	const attachUnder = useCallback(
		(element: HTMLElement) => {
			under.current = !vertical && coversPageBelow(element) ? pageBelow(element) : null;
		},
		[vertical],
	);
	function expansionRoom(element: HTMLElement, height: number) {
		return Math.max(0, (element.parentElement?.clientHeight ?? height) - height - Math.min(0, x.get()));
	}

	function expand(velocity = 0) {
		const element = panel.current;
		if (!element || !onExpand) return;
		const complete = () => {
			handedOff.current = true;
			onExpand();
		};
		const room = expansionRoom(element, element.getBoundingClientRect().height);
		animation.current?.stop();
		settle.current?.stop();
		if (reduced || !room) complete();
		else animation.current = animate(x, -room, { type: "spring", ...SPRING.panel, velocity, onComplete: complete });
	}

	useLayoutEffect(() => {
		const element = panel.current;
		if (!element) return;
		const bounds = element.getBoundingClientRect();
		const width = vertical ? bounds.height : bounds.width;
		size.current = width;
		animation.current?.stop();
		if (inline) {
			hideUnder();
			x.set(0);
			setVisible(true);
			initialized.current = true;
			return;
		}
		if (skipExit) {
			x.jump(direction * width);
			hideUnder();
			setVisible(false);
			return;
		}
		attachUnder(element);
		const velocity = shown ? x.getVelocity() : (handoff.current ?? x.getVelocity());
		if (shown) {
			setVisible(true);
			if (!initialized.current) x.jump(reduced || !initial ? 0 : direction * width);
			handoff.current = null;
		}
		initialized.current = true;
		if (reduced) {
			x.set(0);
			hideUnder();
			return;
		}
		animation.current = animate(x, shown ? 0 : direction * width, {
			type: "spring",
			...SPRING.panel,
			velocity,
			onUpdate: (value) => showUnder(direction * value),
			onComplete: () => {
				hideUnder();
				// The layer may have been reopened while this exit was still animating.
				if (!openRef.current) {
					setVisible(false);
					remove?.();
				}
			},
		});
		return () => animation.current?.stop();
	}, [shown, inline, initial, direction, vertical, reduced, remove, skipExit, x, attachUnder, hideUnder, showUnder]);

	// Complete immediate exits after motion has committed its presence bookkeeping.
	useEffect(() => {
		if (skipExit) remove?.();
	}, [skipExit, remove]);

	useEffect(() => {
		if (!shown || !active || role !== "dialog") return;
		const previous = document.activeElement as HTMLElement | null;
		panel.current?.focus({ preventScroll: true });
		return () => {
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, [shown, active, role]);

	/** Settles a layer the finger let go of, toward where it now sits: open or gone. */
	function animateTo(target: number, speed: number, done?: () => void) {
		settle.current?.stop();
		if (reduced) {
			x.set(target);
			done?.();
			return;
		}
		settle.current = animate(x, target, {
			type: "spring",
			...SPRING.panel,
			velocity: speed,
			onUpdate: (value) => showUnder(direction * value),
			onComplete: () => done?.(),
		});
	}

	function finish(event: PointerEvent<HTMLElement>, cancel: boolean) {
		const current = gesture.current;
		if (!current || current.id !== event.pointerId) return;
		gesture.current = null;
		if (!current.dragging) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
		current.dragging = false;
		armed.current = false;
		const now = performance.now();
		const speed = cancel ? 0 : direction * releaseVelocity(current.samples, now);
		const moved = distance();
		const room = current.room;
		// A tall sheet expands on an upward pull before a short downward one can close it.
		if (!cancel && onExpand && !current.fromBackdrop && speed < 200 && moved < -Math.min(64, room / 2)) {
			expand(speed);
			return;
		}
		const threshold = onExpand ? Math.min(52, current.size * 0.35) : closeDistance(current.size);
		const projected = moved + Math.max(0, speed) * 0.18;
		// A sheet is opened by pulling it up and closed by throwing it down; a fling the other way is
		// the gesture for the other. Every page layer just closes.
		const closes = onExpand
			? !cancel && projected > threshold && speed > -200
			: !cancel && releasedToClose({ distance: moved, speed, closeThreshold: threshold });
		if (!closes) {
			animateTo(0, direction * speed, hideUnder);
			return;
		}
		handoff.current = direction * speed;
		dismiss.current();
		// A router blocker can reject the exit. If the route stayed, settle back from here.
		requestAnimationFrame(() => {
			if (!panel.current?.isConnected) return;
			if (!openRef.current) {
				hideUnder();
				return;
			}
			handoff.current = null;
			animateTo(0, 0, hideUnder);
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
				...(vertical ? { y: onExpand ? sheetOffset : x } : { x }),
				...(onExpand ? { "--sheet-expansion": sheetExpansion } : {}),
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
				const fromBackdrop = Boolean(onExpand && target.closest("[data-overlay-backdrop]"));
				if (vertical && !fromBackdrop && !target.closest("[data-sheet-handle]")) return;
				// Text fields, sliders and separators keep their own pointer. Rows and buttons do not:
				// a gesture that starts on one still goes back, and the click it would have fired is
				// cancelled once the finger actually moves.
				if (
					!(vertical && onExpand) &&
					target.closest(
						"input, textarea, select, [contenteditable=true], [role=slider], [role=separator], [data-no-back-gesture]",
					)
				)
					return;
				const rect = event.currentTarget.getBoundingClientRect();
				const edge = vertical
					? event.clientY - rect.top
					: direction > 0
						? event.clientX - rect.left
						: rect.right - event.clientX;
				if (edge > EDGE_WIDTH && !(vertical && onExpand)) return;
				armed.current = false;
				gesture.current = {
					id: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					moved: direction * x.get(),
					room: onExpand ? expansionRoom(event.currentTarget, rect.height) : 0,
					size: vertical ? rect.height : rect.width,
					fromBackdrop,
					dragging: false,
					samples: [],
					lastTime: performance.now(),
				};
			}}
			onPointerMove={(event) => {
				const current = gesture.current;
				if (!current || current.id !== event.pointerId) return;
				const point = vertical ? event.clientY : event.clientX;
				if (!current.dragging) {
					const across = point - (vertical ? current.startY : current.startX);
					const acrossOther = (vertical ? event.clientX : event.clientY) - (vertical ? current.startX : current.startY);
					// Sideways, deliberate, and mostly along this layer's axis: a tap, a scroll or a drag the
					// other way stays whatever it was. A sheet moves both ways, so either one arms it.
					const along = vertical ? Math.abs(across) : direction * across;
					if (along < SLOP || Math.abs(across) <= Math.abs(acrossOther) * SLOP_RATIO) return;
					animation.current?.stop();
					settle.current?.stop();
					attachUnder(event.currentTarget);
					current.moved = direction * x.get();
					current.startX = event.clientX;
					current.startY = event.clientY;
					current.dragging = true;
					dragged.current = true;
					current.lastTime = performance.now();
					current.samples = [];
					track(current.samples, { time: current.lastTime, point });
					event.currentTarget.setPointerCapture(event.pointerId);
				}
				event.preventDefault();
				const now = performance.now();
				track(current.samples, { time: now, point });
				const start = vertical ? current.startY : current.startX;
				// Stored as distance toward closing, so the same arithmetic serves both edges: a layer that
				// leaves toward the left travels the same positive distance as one that leaves right.
				const moved = current.moved + direction * (point - start);
				x.set(direction * Math.min(current.size, Math.max(-current.room, moved)));
				showUnder(distance());
				// One tick when the page would leave on release; drifting back and over again stays quiet.
				if (!armed.current && distance() > closeDistance(current.size)) {
					armed.current = true;
					shellHaptic("selection");
				}
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
				} else if (onExpand && (event.target as HTMLElement).closest("[data-sheet-handle]")) {
					expand();
				}
			}}
			onKeyDown={(event) => {
				if (!modal || !active || event.key !== "Tab") return;
				const controls = panel.current?.querySelectorAll<HTMLElement>(
					"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']",
				);
				const available = [...(controls ?? [])].filter(
					(element) => element.tabIndex >= 0 && !element.closest("[inert], [hidden], [aria-hidden=true]"),
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

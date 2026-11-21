import { cn } from "@yonder/ui-components";
import { SPRING } from "@yonder/ui-tokens";
import {
	animate,
	motion,
	type PanInfo,
	useDragControls,
	useMotionValue,
	usePresence,
	useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { shellHaptic } from "./feedback.ts";
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

/** Letting go closes past a quarter of the panel (at least 64px), or on a flick of 300px/s or more. */
const FLING_SPEED = 300;
const closeDistance = (size: number) => Math.max(64, size / 4);

/** Shared navigation surface: Motion drag from the edge, interruptible spring settling, one exit. */
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
	const openRef = useRef(shown);
	openRef.current = shown;
	const retained = useRef(children);
	if (shown || inline) retained.current = children;
	const [visible, setVisible] = useState(open || inline);
	const initialized = useRef(false);
	const animation = useRef<ReturnType<typeof animate> | null>(null);
	const direction = side === "left" ? -1 : 1;
	const vertical = side === "bottom";
	const controls = useDragControls();
	const [size, setSize] = useState(0);
	const armed = useRef(false);
	const dragged = useRef(false);
	const dismiss = useRef(onBack);
	dismiss.current = onBack;
	useDismiss(shown && active && !inline, onBack, priority);

	useLayoutEffect(() => {
		const element = panel.current;
		if (!element) return;
		const measure = () => {
			const bounds = element.getBoundingClientRect();
			setSize(vertical ? bounds.height : bounds.width);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [vertical]);

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

	function release(info: PanInfo) {
		const axis = vertical ? "y" : "x";
		// Toward closing is positive. Motion samples the release frame too, so a held finger reads ~0.
		const speed = direction * info.velocity[axis];
		const offset = direction * info.offset[axis];
		const close = speed > -FLING_SPEED && (offset >= closeDistance(size) || (speed >= FLING_SPEED && offset >= 16));
		if (close) dismiss.current();
		// A router blocker can reject the exit; if the layer stayed, settle back from where the finger left it.
		requestAnimationFrame(() => {
			if (!panel.current?.isConnected || !openRef.current) return;
			if (reduced) x.set(0);
			else animation.current = animate(x, 0, { type: "spring", ...SPRING.panel, velocity: direction * speed });
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
			drag={inline ? false : vertical ? "y" : "x"}
			dragControls={controls}
			dragListener={false}
			dragMomentum={false}
			dragElastic={0}
			dragConstraints={{
				left: direction > 0 || vertical ? 0 : -size,
				right: direction > 0 && !vertical ? size : 0,
				top: 0,
				bottom: vertical ? size : 0,
			}}
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
				animation.current?.stop();
				armed.current = false;
				controls.start(event);
			}}
			onDragStart={() => {
				dragged.current = true;
			}}
			onDrag={(_, info) => {
				// One tick when the page would leave on release; drifting back and over again stays quiet.
				const offset = direction * info.offset[vertical ? "y" : "x"];
				if (!armed.current && offset > closeDistance(size)) {
					armed.current = true;
					shellHaptic("selection");
				}
			}}
			onDragEnd={(_, info) => release(info)}
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

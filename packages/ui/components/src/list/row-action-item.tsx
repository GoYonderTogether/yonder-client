import {
	type ButtonHTMLAttributes,
	type CSSProperties,
	cloneElement,
	type MouseEvent,
	type PointerEvent,
	type ReactElement,
	type ReactNode,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn.ts";

export interface RowAction {
	label: string;
	icon: ReactNode;
	onSelect: () => void;
	tone?: "default" | "danger";
	disabled?: boolean;
}

interface RowActionItemProps {
	actions?: readonly RowAction[] | undefined;
	className?: string | undefined;
	children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
}

const HOLD_MS = 450;
const MOVE_SLOP = 8;
const SWIPE_THRESHOLD = 32;
const TRANSITION =
	"motion-safe:transition-transform motion-safe:duration-[var(--duration-fast)] motion-safe:ease-[var(--ease-standard)]";

interface RowGesture {
	id: number;
	x: number;
	y: number;
	lastX: number;
	origin: number;
	offset: number;
	width: number;
	wasExpanded: boolean;
	mode: "pending" | "vertical" | "horizontal" | "hold";
}

function clampOffset(offset: number, width: number) {
	return Math.max(0, Math.min(width, offset));
}

export function RowActionItem({ actions, className, children }: RowActionItemProps) {
	if (!actions?.length) return <li className={className}>{children}</li>;
	return (
		<GestureRow actions={actions} className={className}>
			{children}
		</GestureRow>
	);
}

function GestureRow({ actions, children, className }: RowActionItemProps & { actions: readonly RowAction[] }) {
	const row = useRef<HTMLLIElement>(null);
	const strip = useRef<HTMLDivElement>(null);
	const control = useRef<HTMLDivElement>(null);
	const id = useId();
	const [expanded, setExpanded] = useState(false);
	const [drag, setDrag] = useState<number | null>(null);
	const hold = useRef<number>(undefined);
	const suppressClick = useRef(false);
	const gesture = useRef<RowGesture | null>(null);

	useEffect(() => () => window.clearTimeout(hold.current), []);

	useEffect(() => {
		if (!expanded) return;
		function dismissOutside(event: Event) {
			if (event.target instanceof Node && !row.current?.contains(event.target)) setExpanded(false);
		}
		document.addEventListener("pointerdown", dismissOutside, true);
		document.addEventListener("focusin", dismissOutside);
		return () => {
			document.removeEventListener("pointerdown", dismissOutside, true);
			document.removeEventListener("focusin", dismissOutside);
		};
	}, [expanded]);

	function renderedOffset(width: number) {
		const edge = row.current?.getBoundingClientRect().right ?? 0;
		const cardEdge = control.current?.getBoundingClientRect().right ?? edge;
		return clampOffset(edge - cardEdge, width);
	}

	function beginHold(start: RowGesture) {
		start.mode = "hold";
		suppressClick.current = true;
		setDrag(null);
		setExpanded(true);
	}

	function finish(event: PointerEvent, cancelled: boolean) {
		const start = gesture.current;
		if (!start || start.id !== event.pointerId) return;
		gesture.current = null;
		window.clearTimeout(hold.current);
		setDrag(null);
		suppressClick.current = cancelled || start.mode !== "pending";
		if (cancelled) {
			// WebKit can report lost capture after a completed hold moves the row away from the touch.
			if (start.mode !== "hold") setExpanded(start.wasExpanded);
			return;
		}
		if (start.mode !== "horizontal") return;
		start.offset = clampOffset(start.offset + start.lastX - event.clientX, start.width);
		const threshold = Math.min(SWIPE_THRESHOLD, start.width / 2);
		if (start.offset === 0 || start.origin - start.offset >= threshold) setExpanded(false);
		else if (start.offset === start.width || start.offset - start.origin >= threshold) setExpanded(true);
	}

	function focusRow() {
		control.current?.querySelector("button")?.focus({ preventScroll: true });
	}

	// The release click can land on an action revealed under the original press.
	function consumeGestureClick(event: MouseEvent<HTMLButtonElement>) {
		if (event.detail === 0 || !suppressClick.current) return false;
		suppressClick.current = false;
		event.preventDefault();
		event.stopPropagation();
		return true;
	}

	const cardOffset =
		drag === null ? (expanded ? "var(--row-actions-width)" : "0px") : `min(${drag}px, var(--row-actions-width))`;
	const stripOffset = drag === null ? (expanded ? "0px" : "100%") : `max(0px, calc(100% - ${drag}px))`;
	return (
		<li
			ref={row}
			className={cn(
				"relative isolate overflow-clip [--row-actions-width:min(60%,var(--row-actions-natural-width))] [[data-layout-mode=mobile]_&]:[--row-actions-width:60%]",
				className,
			)}
			style={{ "--row-actions-natural-width": `calc(${actions.length} * var(--control-lg))` } as CSSProperties}
			onPointerUp={(event) => finish(event, event.defaultPrevented)}
			onPointerCancel={(event) => finish(event, true)}
		>
			<div
				ref={control}
				className={cn(
					"relative z-1 touch-pan-y touch-pinch-zoom select-none [-webkit-touch-callout:none]",
					drag === null && TRANSITION,
				)}
				style={{ transform: `translateX(calc(0px - ${cardOffset}))` }}
			>
				{cloneElement(children, {
					"aria-controls": id,
					"aria-expanded": expanded,
					"aria-keyshortcuts": "Shift+F10 ContextMenu ArrowLeft",
					onPointerDown(event) {
						children.props.onPointerDown?.(event);
						if (event.defaultPrevented || event.button !== 0 || !event.isPrimary) return;
						suppressClick.current = false;
						event.currentTarget.setPointerCapture?.(event.pointerId);
						const width = strip.current?.getBoundingClientRect().width ?? 0;
						const offset = renderedOffset(width);
						// Freeze an in-flight settle at its painted position until this press commits.
						setDrag(offset);
						const start: RowGesture = {
							id: event.pointerId,
							x: event.clientX,
							y: event.clientY,
							lastX: event.clientX,
							origin: offset,
							offset,
							width,
							wasExpanded: expanded,
							mode: "pending",
						};
						gesture.current = start;
						window.clearTimeout(hold.current);
						hold.current = window.setTimeout(() => {
							if (gesture.current === start && start.mode === "pending") beginHold(start);
						}, HOLD_MS);
					},
					onPointerMove(event) {
						children.props.onPointerMove?.(event);
						const start = gesture.current;
						if (!start || start.id !== event.pointerId || start.mode === "vertical") return;
						if (start.mode !== "horizontal") {
							const dx = start.x - event.clientX;
							const dy = start.y - event.clientY;
							if (Math.hypot(dx, dy) < MOVE_SLOP) return;
							window.clearTimeout(hold.current);
							if (Math.abs(dx) <= Math.abs(dy)) {
								start.mode = "vertical";
								setDrag(null);
								return;
							}
							if (start.mode === "hold") {
								start.origin = renderedOffset(start.width);
								start.offset = start.origin;
							}
							start.mode = "horizontal";
							suppressClick.current = true;
						}
						start.offset = clampOffset(start.offset + start.lastX - event.clientX, start.width);
						start.lastX = event.clientX;
						setDrag(start.offset);
					},
					onLostPointerCapture(event) {
						children.props.onLostPointerCapture?.(event);
						if (event.target === event.currentTarget) finish(event, true);
					},
					onContextMenu(event) {
						children.props.onContextMenu?.(event);
						if (event.defaultPrevented) return;
						event.preventDefault();
						const start = gesture.current;
						if (start?.mode === "pending") beginHold(start);
						else if (!start) setExpanded(true);
					},
					onClick(event) {
						if (consumeGestureClick(event)) return;
						if (expanded || !children.props.onClick) {
							event.preventDefault();
							setExpanded(!expanded);
							return;
						}
						children.props.onClick(event);
					},
					onKeyDown(event) {
						children.props.onKeyDown?.(event);
						if (event.defaultPrevented) return;
						if (event.key === "Escape" && expanded) {
							event.preventDefault();
							setExpanded(false);
						} else if (
							event.key === "ContextMenu" ||
							(event.key === "F10" && event.shiftKey) ||
							event.key === "ArrowLeft"
						) {
							event.preventDefault();
							setExpanded(true);
						}
					},
				})}
			</div>
			<div
				id={id}
				ref={strip}
				inert={!expanded || drag !== null}
				aria-hidden={!expanded || drag !== null || undefined}
				className={cn("absolute inset-y-0 right-0 flex w-[var(--row-actions-width)]", drag === null && TRANSITION)}
				style={{ transform: `translateX(${stripOffset})` }}
			>
				{actions.map((action) => (
					<Button
						key={action.label}
						size="lg"
						variant={action.tone === "danger" ? "danger" : "secondary"}
						className="h-full! min-w-0 flex-1 rounded-none! px-0! focus-visible:outline-offset-[-2px]!"
						aria-label={action.label}
						title={action.label}
						disabled={action.disabled}
						onPointerDown={() => {
							if (!gesture.current) suppressClick.current = false;
						}}
						onClick={(event) => {
							if (consumeGestureClick(event) || gesture.current) return;
							focusRow();
							setExpanded(false);
							action.onSelect();
						}}
						onKeyDown={(event) => {
							if (event.key !== "Escape") return;
							event.preventDefault();
							focusRow();
							setExpanded(false);
						}}
					>
						<span aria-hidden="true">{action.icon}</span>
					</Button>
				))}
			</div>
		</li>
	);
}

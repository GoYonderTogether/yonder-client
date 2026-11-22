import {
	type ButtonHTMLAttributes,
	cloneElement,
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
	"motion-safe:transition-[width,transform] motion-safe:duration-[var(--duration-fast)] motion-safe:ease-[var(--ease-standard)]";
export const HIDE_WITH_ROW_ACTIONS = "group-data-[actions-revealed]/action-row:hidden";

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
	const gesture = useRef<{
		id: number;
		x: number;
		y: number;
		width: number;
		mode: "pending" | "vertical" | "horizontal" | "hold";
	} | null>(null);

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

	function finish(event: PointerEvent, cancelled: boolean) {
		const start = gesture.current;
		if (!start || start.id !== event.pointerId) return;
		gesture.current = null;
		window.clearTimeout(hold.current);
		setDrag(null);
		suppressClick.current = cancelled || start.mode !== "pending";
		if (cancelled || start.mode !== "horizontal") return;
		const distance = start.x - event.clientX;
		if (distance > SWIPE_THRESHOLD) setExpanded(true);
		if (distance < -SWIPE_THRESHOLD) setExpanded(false);
	}

	function focusRow() {
		control.current?.querySelector("button")?.focus({ preventScroll: true });
	}

	const offset = drag === null ? (expanded ? `calc(${actions.length} * var(--control-lg))` : "0px") : `${drag}px`;
	return (
		<li
			ref={row}
			className={cn("group/action-row relative overflow-clip", className)}
			data-actions-revealed={expanded || (drag ?? 0) > 0 || undefined}
		>
			<div
				ref={control}
				className={cn(
					"touch-pan-y touch-pinch-zoom select-none [-webkit-touch-callout:none]",
					drag === null && TRANSITION,
				)}
				style={{ width: `calc(100% - ${offset})` }}
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
						gesture.current = {
							id: event.pointerId,
							x: event.clientX,
							y: event.clientY,
							width: strip.current?.offsetWidth ?? 0,
							mode: "pending",
						};
						window.clearTimeout(hold.current);
						hold.current = window.setTimeout(() => {
							if (gesture.current?.mode !== "pending") return;
							gesture.current.mode = "hold";
							setExpanded(true);
						}, HOLD_MS);
					},
					onPointerMove(event) {
						children.props.onPointerMove?.(event);
						const start = gesture.current;
						if (!start || start.id !== event.pointerId || start.mode === "hold") return;
						const dx = start.x - event.clientX;
						const dy = start.y - event.clientY;
						if (start.mode === "pending") {
							if (Math.hypot(dx, dy) < MOVE_SLOP) return;
							window.clearTimeout(hold.current);
							start.mode = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
						}
						if (start.mode === "horizontal") {
							setDrag(Math.max(0, Math.min(start.width, (expanded ? start.width : 0) + dx)));
						}
					},
					onPointerUp(event) {
						children.props.onPointerUp?.(event);
						finish(event, event.defaultPrevented);
					},
					onPointerCancel(event) {
						children.props.onPointerCancel?.(event);
						finish(event, true);
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
						if (start && start.mode !== "pending" && start.mode !== "hold") return;
						if (start) start.mode = "hold";
						setExpanded(true);
					},
					onClick(event) {
						if (event.detail !== 0 && suppressClick.current) {
							suppressClick.current = false;
							event.preventDefault();
							event.stopPropagation();
							return;
						}
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
				inert={!expanded}
				aria-hidden={!expanded || undefined}
				className={cn("absolute inset-y-0 right-0 flex", drag === null && TRANSITION)}
				style={{ transform: `translateX(calc(100% - ${offset}))` }}
			>
				{actions.map((action) => (
					<Button
						key={action.label}
						size="lg"
						variant={action.tone === "danger" ? "danger" : "secondary"}
						className="h-full! w-[var(--control-lg)] rounded-none! px-0! focus-visible:outline-offset-[-2px]!"
						aria-label={action.label}
						title={action.label}
						disabled={action.disabled}
						onClick={() => {
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

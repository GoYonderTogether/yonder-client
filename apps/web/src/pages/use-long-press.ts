import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

const PRESS_MS = 150;
const HOLD_MS = 450;
const MOVE_PX = 8;

export interface MenuPoint {
	x: number;
	y: number;
	from: HTMLElement;
}

type Press = {
	id: number;
	x: number;
	y: number;
	feedback: ReturnType<typeof setTimeout>;
	hold: ReturnType<typeof setTimeout>;
};

function clearPress(press: Press | null) {
	if (!press) return;
	clearTimeout(press.feedback);
	clearTimeout(press.hold);
}

/** One context-menu gesture for touch, pen, mouse and keyboard. */
export function useLongPress(
	onOpen: ((point: MenuPoint) => void) | undefined,
	ignore?: (target: EventTarget) => boolean,
) {
	const press = useRef<Press | null>(null);
	const clickGuard = useRef<AbortController | null>(null);
	const touchPointer = useRef(false);
	const [pressed, setPressed] = useState(false);
	useEffect(
		() => () => {
			clearPress(press.current);
			clickGuard.current?.abort();
		},
		[],
	);
	const swallowClick = () => {
		clickGuard.current?.abort();
		const guard = new AbortController();
		clickGuard.current = guard;
		const stop = () => guard.abort();
		const options = { signal: guard.signal, capture: true };
		// Touch can hit-test its compatibility click after the menu has covered the trigger.
		document.addEventListener("mousedown", (event) => event.preventDefault(), options);
		document.addEventListener(
			"click",
			(event) => {
				event.preventDefault();
				event.stopImmediatePropagation();
				stop();
			},
			options,
		);
		document.addEventListener("pointerdown", stop, options);
		document.addEventListener("keydown", stop, options);
	};
	const cancel = () => {
		clearPress(press.current);
		press.current = null;
		setPressed(false);
	};
	const finish = (event: PointerEvent<HTMLElement>) => {
		if (event.pointerId === press.current?.id) cancel();
	};
	const handlers = onOpen
		? {
				onPointerDown: (event: PointerEvent<HTMLElement>) => {
					if (!event.isPrimary) return;
					touchPointer.current = event.pointerType !== "mouse";
					if (!touchPointer.current || event.button !== 0 || ignore?.(event.target)) return;
					cancel();
					const { clientX: x, clientY: y, currentTarget: from, pointerId: id } = event;
					press.current = {
						id,
						x,
						y,
						feedback: setTimeout(() => setPressed(true), PRESS_MS),
						hold: setTimeout(() => {
							cancel();
							swallowClick();
							onOpen({ x, y, from });
						}, HOLD_MS),
					};
				},
				onPointerMove: (event: PointerEvent<HTMLElement>) => {
					const start = press.current;
					if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_PX)
						cancel();
				},
				onPointerUp: finish,
				onPointerCancel: finish,
				onLostPointerCapture: finish,
				onPointerLeave: finish,
				onContextMenu: (event: MouseEvent<HTMLElement>) => {
					if (event.defaultPrevented || ignore?.(event.target)) return;
					event.preventDefault();
					event.stopPropagation();
					if (touchPointer.current) return;
					onOpen({ x: event.clientX, y: event.clientY, from: event.currentTarget });
				},
				onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
					if (event.defaultPrevented || event.target !== event.currentTarget) return;
					if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
					event.preventDefault();
					event.stopPropagation();
					const { right, top } = event.currentTarget.getBoundingClientRect();
					onOpen({ x: right, y: top, from: event.currentTarget });
				},
			}
		: {};
	return { handlers, pressed };
}

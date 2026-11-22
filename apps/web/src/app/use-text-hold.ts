import { type RefObject, useEffectEvent, useLayoutEffect } from "react";

export function useTextHold(
	editor: RefObject<HTMLTextAreaElement | null>,
	handlers: {
		allowed: () => boolean;
		start: (event: PointerEvent, context: AudioContext) => void;
		move: (event: PointerEvent) => void;
		release: (event: PointerEvent) => void;
		cancel: (event: PointerEvent) => void;
	},
) {
	const allowed = useEffectEvent(handlers.allowed);
	const start = useEffectEvent(handlers.start);
	const move = useEffectEvent(handlers.move);
	const release = useEffectEvent(handlers.release);
	const cancel = useEffectEvent(handlers.cancel);
	useLayoutEffect(() => {
		const input = editor.current;
		if (!input) return;
		type Hold = { event: PointerEvent; context: AudioContext; timer: ReturnType<typeof setTimeout>; started: boolean };
		let hold: Hold | undefined;
		function take() {
			const next = hold;
			hold = undefined;
			if (next) clearTimeout(next.timer);
			return next;
		}
		function down(event: PointerEvent) {
			if (
				hold ||
				event.pointerType === "mouse" ||
				!event.isPrimary ||
				event.button !== 0 ||
				!allowed() ||
				!globalThis.AudioContext ||
				document.activeElement === input ||
				input?.value
			)
				return;
			let context: AudioContext;
			try {
				context = new AudioContext();
				void context.resume().catch(() => {});
			} catch {
				return;
			}
			event.preventDefault();
			const timer = setTimeout(() => {
				if (hold?.event !== event) return;
				if (!allowed()) {
					take();
					void context.close().catch(() => {});
					return;
				}
				hold.started = true;
				start(event, context);
			}, 350);
			hold = { event, context, timer, started: false };
		}
		function moved(event: PointerEvent) {
			if (hold?.event.pointerId !== event.pointerId) return;
			if (hold.started) move(event);
			else if (Math.hypot(event.clientX - hold.event.clientX, event.clientY - hold.event.clientY) > 10) {
				void take()
					?.context.close()
					.catch(() => {});
			}
		}
		function up(event: PointerEvent) {
			if (hold?.event.pointerId !== event.pointerId) return;
			const active = take();
			if (active?.started) release(event);
			else if (active) {
				void active.context.close().catch(() => {});
				input?.focus({ preventScroll: true });
			}
		}
		function cancelled(event: PointerEvent) {
			if (hold?.event.pointerId !== event.pointerId) return;
			const active = take();
			if (active?.started) cancel(event);
			else void active?.context.close().catch(() => {});
		}
		function hide() {
			if (document.hidden) {
				const active = take();
				if (active?.started) cancel(active.event);
				else void active?.context.close().catch(() => {});
			}
		}
		input.addEventListener("pointerdown", down);
		document.addEventListener("pointermove", moved);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancelled);
		document.addEventListener("visibilitychange", hide);
		return () => {
			input.removeEventListener("pointerdown", down);
			document.removeEventListener("pointermove", moved);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancelled);
			document.removeEventListener("visibilitychange", hide);
			const active = take();
			if (!active?.started) void active?.context.close().catch(() => {});
		};
	}, [editor]);
}

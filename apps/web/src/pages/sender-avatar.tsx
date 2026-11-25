import { type PointerEvent, type ReactNode, useRef } from "react";

/** A long press is a press held still; moving a finger means the reader is scrolling the list. */
const HOLD_MS = 500;
const MOVE_SLOP_PX = 8;

/**
 * A sender's avatar. A tap opens who they are (WeChat, QQ); in a group a long press is the touch
 * way to @ them (both apps do it on the avatar), which is why the desktop hover control and the
 * touch hold are separate entries for one action. A completed hold consumes the click that follows,
 * so it never opens the profile as well.
 */
export function SenderAvatar({
	label,
	mentionLabel,
	onOpen,
	onMention,
	children,
}: {
	label: string;
	mentionLabel?: string | undefined;
	onOpen?: (() => void) | undefined;
	onMention?: (() => void) | undefined;
	children: ReactNode;
}) {
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const origin = useRef<{ x: number; y: number } | null>(null);
	const held = useRef(false);
	const clear = () => {
		clearTimeout(timer.current);
		timer.current = undefined;
		origin.current = null;
	};
	if (!onOpen) return <>{children}</>;
	return (
		<button
			type="button"
			data-message-avatar-button
			aria-label={label}
			title={mentionLabel && onMention ? mentionLabel : undefined}
			className="m-0 inline-flex border-0 bg-transparent p-0 rounded-[var(--radius-full)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
			onClick={() => {
				if (held.current) {
					held.current = false;
					return;
				}
				onOpen();
			}}
			onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
				if (!onMention || event.pointerType === "mouse") return;
				origin.current = { x: event.clientX, y: event.clientY };
				timer.current = setTimeout(() => {
					held.current = true;
					onMention();
				}, HOLD_MS);
			}}
			onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
				const start = origin.current;
				if (!start) return;
				if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_SLOP_PX) clear();
			}}
			onPointerUp={clear}
			onPointerCancel={clear}
			onPointerLeave={clear}
			onContextMenu={(event) => {
				// A hold on touch is not a browser menu; the control above already did its job.
				if (onMention) event.preventDefault();
			}}
		>
			{children}
		</button>
	);
}

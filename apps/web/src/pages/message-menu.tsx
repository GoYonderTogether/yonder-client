import { MENU_ITEM, MENU_SURFACE } from "@yonder/ui-components";
import { AtSign, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

/** One row of the message menu; the menu draws only what can run right now, never a greyed placeholder. */
export interface MessageMenuItem {
	id: "copy" | "mention";
	label: string;
	icon: ReactNode;
	run: () => void;
}

export interface MessageMenuTarget {
	/** The trigger point in viewport coordinates, so the panel sits under the pointer. */
	x: number;
	y: number;
	items: MessageMenuItem[];
}

const EDGE_PX = 8;

/**
 * A message's own context menu (desktop): right-click a message, or Shift+F10 from the message's
 * action button. Only rows that will do something are drawn — messages have no delete, report or
 * raw-source endpoint in this client, so none is offered as a greyed placeholder. Arrow keys move,
 * Home/End jump, Esc and a click outside close, and the caller restores focus to where it was.
 */
export function MessageMenu({ target, onClose }: { target: MessageMenuTarget | null; onClose: () => void }) {
	const { t } = useTranslation();
	const id = useId();
	const panel = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ left: number; top: number } | null>(null);
	const [active, setActive] = useState(0);
	const enabled = target?.items ?? [];

	// Measured after mount so the panel stays inside the viewport instead of running off an edge.
	useLayoutEffect(() => {
		if (!target) {
			setAt(null);
			return;
		}
		const width = panel.current?.offsetWidth ?? 0;
		const height = panel.current?.offsetHeight ?? 0;
		setAt({
			left: Math.min(target.x, Math.max(EDGE_PX, window.innerWidth - width - EDGE_PX)),
			top: Math.min(target.y, Math.max(EDGE_PX, window.innerHeight - height - EDGE_PX)),
		});
		setActive(0);
		// The menu takes focus so arrow keys and Esc reach it at once, as a native context menu does.
		panel.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
	}, [target]);

	useEffect(() => {
		if (!target) return;
		const outside = (event: Event) => {
			if (!panel.current?.contains(event.target as Node)) onClose();
		};
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("focusin", outside);
		// A viewport change moves the panel under the pointer, so it closes like a native menu would.
		const onResize = () => onClose();
		window.addEventListener("resize", onResize);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			document.removeEventListener("focusin", outside);
			window.removeEventListener("resize", onResize);
		};
	}, [target, onClose]);

	if (!target || typeof document === "undefined") return null;
	const move = (step: number) => setActive((current) => (current + step + enabled.length) % enabled.length);
	const style = at
		? { left: `${at.left}px`, top: `${at.top}px` }
		: { left: target.x, top: target.y, visibility: "hidden" as const };
	return createPortal(
		<div
			ref={panel}
			id={id}
			role="menu"
			aria-label={t("chat.messageMenu")}
			className={`fixed z-[var(--z-popover)] min-w-max ${MENU_SURFACE}`}
			style={style}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					onClose();
				} else if (event.key === "ArrowDown") {
					event.preventDefault();
					move(1);
				} else if (event.key === "ArrowUp") {
					event.preventDefault();
					move(-1);
				} else if (event.key === "Home") {
					event.preventDefault();
					setActive(0);
				} else if (event.key === "End") {
					event.preventDefault();
					setActive(enabled.length - 1);
				} else if (event.key === "Tab") {
					onClose();
				}
			}}
		>
			{enabled.map((item, index) => (
				<button
					key={item.id}
					type="button"
					role="menuitem"
					tabIndex={index === active ? 0 : -1}
					onFocus={() => setActive(index)}
					onClick={() => {
						onClose();
						item.run();
					}}
					className={`${MENU_ITEM} text-[var(--color-text-primary)]`}
				>
					<span aria-hidden className="flex shrink-0 items-center">
						{item.icon}
					</span>
					<span className="min-w-0 flex-1 truncate">{item.label}</span>
				</button>
			))}
		</div>,
		document.body,
	);
}

/**
 * The rows a message can offer, in the order chat apps list them: copy when there are words, and
 * @Ta for somebody else's message in a group, where an @ is what asks that member in. `onCopied`
 * reports whether the clipboard took it, so the app can say so the way it says anything else.
 */
export function messageMenuItems({
	t,
	body,
	mention,
	onCopied,
}: {
	t: (key: string) => string;
	body: string | null | undefined;
	mention?: (() => void) | undefined;
	onCopied: (ok: boolean) => void;
}): MessageMenuItem[] {
	const rows: MessageMenuItem[] = [];
	if (body?.trim())
		rows.push({
			id: "copy",
			label: t("app.copy"),
			icon: <Copy size={16} aria-hidden="true" />,
			run: () =>
				void navigator.clipboard.writeText(body ?? "").then(
					() => onCopied(true),
					() => onCopied(false),
				),
		});
	if (mention) rows.push({ id: "mention", label: t("chat.mentionTa"), icon: <AtSign size={16} />, run: mention });
	return rows;
}

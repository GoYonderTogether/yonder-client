import { MENU_ITEM, MENU_SURFACE } from "@yonder/ui-components";
import { AtSign } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { MenuPoint } from "./use-long-press.ts";

const ROW_ORDER = [
	"profile",
	"download",
	"copy",
	"quote",
	"forward",
	"mention",
	"like",
	"dislike",
	"recall",
	"delete",
] as const;

export type MessageMenuRowId = (typeof ROW_ORDER)[number];

export interface MessageMenuItem {
	id: MessageMenuRowId;
	label: string;
	icon: ReactNode;
	run: () => void;
}

export interface MessageMenuTarget extends MenuPoint {
	items: readonly MessageMenuItem[];
}

export function mentionMenuItem(label: string, run: () => void): MessageMenuItem {
	return { id: "mention", label, icon: <AtSign size={16} />, run };
}

const EDGE_PX = 8;

export function MessageMenu({ target, onClose }: { target: MessageMenuTarget; onClose: () => void }) {
	const { t } = useTranslation();
	const panel = useRef<HTMLDivElement>(null);
	const previousFocus = useRef(target.from);
	const items = target.items.toSorted((a, b) => ROW_ORDER.indexOf(a.id) - ROW_ORDER.indexOf(b.id));
	const close = (restoreFocus: boolean) => {
		onClose();
		if (restoreFocus) previousFocus.current.focus({ preventScroll: true });
	};

	useLayoutEffect(() => {
		const element = panel.current;
		if (!element) return;
		const previous = document.activeElement;
		if (!element.contains(previous))
			previousFocus.current = previous instanceof HTMLElement && previous !== document.body ? previous : target.from;

		const viewport = window.visualViewport;
		const position = () => {
			const left = (viewport?.offsetLeft ?? 0) + EDGE_PX;
			const top = (viewport?.offsetTop ?? 0) + EDGE_PX;
			const width = (viewport?.width ?? window.innerWidth) - 2 * EDGE_PX;
			const height = (viewport?.height ?? window.innerHeight) - 2 * EDGE_PX;
			element.style.maxWidth = `${width}px`;
			element.style.maxHeight = `${height}px`;
			element.style.left = `${Math.max(left, Math.min(target.x, left + width - element.offsetWidth))}px`;
			element.style.top = `${Math.max(top, Math.min(target.y, top + height - element.offsetHeight))}px`;
		};
		position();
		element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });

		const outside = (event: Event) => {
			if (event.target instanceof Node && !element.contains(event.target)) onClose();
		};
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("focusin", outside);
		window.addEventListener("resize", position);
		viewport?.addEventListener("resize", position);
		viewport?.addEventListener("scroll", position);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			document.removeEventListener("focusin", outside);
			window.removeEventListener("resize", position);
			viewport?.removeEventListener("resize", position);
			viewport?.removeEventListener("scroll", position);
		};
	}, [target, onClose]);

	return createPortal(
		<div
			ref={panel}
			role="menu"
			aria-label={t("chat.messageMenu")}
			className={`fixed z-[var(--z-popover)] w-max overflow-auto ${MENU_SURFACE}`}
			onKeyDown={(event) => {
				const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
				const active = document.activeElement;
				const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
				const length = buttons.length;
				switch (event.key) {
					case "Escape":
						event.preventDefault();
						event.stopPropagation();
						close(true);
						break;
					case "ArrowDown":
					case "ArrowUp": {
						event.preventDefault();
						const step = event.key === "ArrowDown" ? 1 : -1;
						buttons[(index + step + length) % length]?.focus();
						break;
					}
					case "Home":
					case "End":
						event.preventDefault();
						buttons[event.key === "Home" ? 0 : length - 1]?.focus();
						break;
					case "Tab":
						close(false);
						break;
				}
			}}
		>
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					role="menuitem"
					tabIndex={-1}
					onClick={() => {
						close(true);
						item.run();
					}}
					className={`${MENU_ITEM} text-[var(--color-text-primary)]`}
				>
					<span aria-hidden className="flex shrink-0 items-center">
						{item.icon}
					</span>
					<span className="min-w-0 wrap-anywhere">{item.label}</span>
				</button>
			))}
		</div>,
		document.body,
	);
}

import { type KeyboardEvent, type MouseEvent, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.ts";
import { MENU_ITEM, MENU_SURFACE } from "../menu/menu.tsx";
import type { RowAction } from "./row-action-item.tsx";

interface RowContextMenuProps {
	id: string;
	labelledBy: string;
	point: { x: number; y: number };
	actions: readonly RowAction[];
	onDismiss: () => void;
	onEscape: () => void;
	onPointerDown: () => void;
	onSelect: (event: MouseEvent<HTMLButtonElement>, action: RowAction) => void;
}

function fitAnchor(coordinate: number, size: number, edge: number) {
	return Math.max(0, Math.min(coordinate + size > edge ? coordinate - size : coordinate, edge - size));
}

export function RowContextMenu({
	id,
	labelledBy,
	point,
	actions,
	onDismiss,
	onEscape,
	onPointerDown,
	onSelect,
}: RowContextMenuProps) {
	const menu = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const panel = menu.current;
		if (!panel) return;
		const { width, height } = panel.getBoundingClientRect();
		panel.style.left = `${fitAnchor(point.x, width, window.innerWidth)}px`;
		panel.style.top = `${fitAnchor(point.y, height, window.innerHeight)}px`;
		(panel.querySelector<HTMLButtonElement>("button:enabled") ?? panel).focus({ preventScroll: true });
	}, [point]);

	useEffect(() => {
		function dismissOutside(event: Event) {
			if (event.target instanceof Node && !menu.current?.contains(event.target)) onDismiss();
		}
		document.addEventListener("pointerdown", dismissOutside, true);
		document.addEventListener("focusin", dismissOutside);
		document.addEventListener("scroll", dismissOutside, true);
		window.addEventListener("resize", onDismiss);
		return () => {
			document.removeEventListener("pointerdown", dismissOutside, true);
			document.removeEventListener("focusin", dismissOutside);
			document.removeEventListener("scroll", dismissOutside, true);
			window.removeEventListener("resize", onDismiss);
		};
	}, [onDismiss]);

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onEscape();
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
		event.preventDefault();
		const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:enabled")];
		const current = event.target instanceof HTMLButtonElement ? items.indexOf(event.target) : -1;
		const step = event.key === "ArrowDown" ? 1 : -1;
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? items.length - 1
					: (current + step + items.length) % items.length;
		items[next]?.focus({ preventScroll: true });
	}

	return createPortal(
		<div
			ref={menu}
			id={id}
			role="menu"
			aria-labelledby={labelledBy}
			tabIndex={-1}
			className={cn("fixed top-0 left-0 z-[var(--z-popover)] w-max max-w-[100vw]", MENU_SURFACE)}
			onKeyDown={onKeyDown}
		>
			{actions.map((action) => (
				<button
					key={action.label}
					type="button"
					role="menuitem"
					disabled={action.disabled}
					tabIndex={-1}
					className={cn(
						MENU_ITEM,
						action.tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]",
					)}
					onPointerDown={onPointerDown}
					onClick={(event) => onSelect(event, action)}
				>
					<span aria-hidden className="flex size-[var(--icon-sm)] shrink-0 items-center [&>svg]:size-full">
						{action.icon}
					</span>
					<span className="min-w-0 truncate">{action.label}</span>
				</button>
			))}
		</div>,
		document.body,
	);
}

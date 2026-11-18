import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../cn.ts";

/**
 * The one floating surface for menus, listboxes and pickers: control radius, a subtle border, the
 * large shadow, 4px padding. `Popover` and `Menu` both use it, so every anchored panel matches.
 */
export const MENU_SURFACE =
	"rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-1)] shadow-[var(--shadow-lg)]";

/** One row inside the surface: body text, 12/8 padding, the small control radius. */
export const MENU_ITEM =
	"flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-body hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]";

export interface MenuSurfaceProps {
	children: ReactNode;
	/** Opens below the trigger by default; `top` for a trigger near the bottom edge. */
	side?: "bottom" | "top";
	/** Which trigger edge the panel lines up with. */
	align?: "start" | "end";
	className?: string;
	id?: string;
	role?: string;
	"aria-label"?: string;
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** The positioned panel. Its parent must be `relative`. */
export function MenuSurface({ children, side = "bottom", align = "start", className, ...rest }: MenuSurfaceProps) {
	return (
		<div
			{...rest}
			className={cn(
				"absolute z-[var(--z-popover)] min-w-max",
				side === "bottom" ? "top-full mt-[var(--spacing-1)]" : "bottom-full mb-[var(--spacing-1)]",
				align === "start" ? "start-0" : "end-0",
				MENU_SURFACE,
				className,
			)}
		>
			{children}
		</div>
	);
}

export interface MenuItem {
	id: string;
	label: string;
	/** A lucide icon at `ICON_SIZE.sm`. */
	icon?: ReactNode;
	tone?: "default" | "danger";
	disabled?: boolean;
}

export interface MenuTriggerProps {
	ref: Ref<HTMLButtonElement>;
	"aria-haspopup": "menu";
	"aria-expanded": boolean;
	"aria-controls": string | undefined;
	onClick: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
	/** The menu's accessible name. */
	label: string;
	items: readonly MenuItem[];
	onSelect: (id: string) => void;
	/** Render the button that opens the menu, usually an `IconButton`, spreading these props. */
	trigger: (props: MenuTriggerProps) => ReactNode;
	side?: "bottom" | "top";
	align?: "start" | "end";
	className?: string;
}

/**
 * An action menu anchored to a button: the 「+」 menu, a row's 「更多」. Arrow keys, Home and End
 * move; Enter or a click picks; Escape and a click outside close and return focus to the trigger.
 */
export function Menu({ label, items, onSelect, trigger, side = "bottom", align = "end", className }: MenuProps) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const nodes = useRef<(HTMLButtonElement | null)[]>([]);
	const id = useId();
	const enabled = items.flatMap((item, index) => (item.disabled ? [] : [index]));

	useEffect(() => {
		if (!open) return;
		const outside = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("focusin", outside);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("focusin", outside);
		};
	}, [open]);

	useEffect(() => {
		if (open) nodes.current[active]?.focus();
	}, [open, active]);

	const show = () => {
		setActive(enabled[0] ?? 0);
		setOpen(true);
	};
	const close = () => {
		setOpen(false);
		button.current?.focus();
	};
	const move = (step: number) => {
		if (enabled.length === 0) return;
		const position = Math.max(0, enabled.indexOf(active));
		setActive(enabled[(position + step + enabled.length) % enabled.length] ?? 0);
	};

	const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			move(event.key === "ArrowDown" ? 1 : -1);
		} else if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			setActive((event.key === "Home" ? enabled[0] : enabled.at(-1)) ?? 0);
		} else if (event.key === "Tab") {
			setOpen(false);
		}
	};

	return (
		<div ref={root} className={cn("relative inline-flex", className)}>
			{trigger({
				ref: button,
				"aria-haspopup": "menu",
				"aria-expanded": open,
				"aria-controls": open ? id : undefined,
				onClick: () => (open ? close() : show()),
				onKeyDown: (event) => {
					if (event.key === "ArrowDown" && !open) {
						event.preventDefault();
						show();
					}
				},
			})}
			{open ? (
				<MenuSurface id={id} role="menu" aria-label={label} side={side} align={align} onKeyDown={onMenuKeyDown}>
					{items.map((item, index) => (
						<button
							key={item.id}
							ref={(node) => {
								nodes.current[index] = node;
							}}
							type="button"
							role="menuitem"
							disabled={item.disabled}
							tabIndex={index === active ? 0 : -1}
							onFocus={() => setActive(index)}
							onClick={() => {
								close();
								onSelect(item.id);
							}}
							className={cn(
								MENU_ITEM,
								item.tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]",
							)}
						>
							{item.icon ? (
								<span aria-hidden className="flex shrink-0 items-center">
									{item.icon}
								</span>
							) : null}
							<span className="min-w-0 flex-1 truncate">{item.label}</span>
						</button>
					))}
				</MenuSurface>
			) : null}
		</div>
	);
}

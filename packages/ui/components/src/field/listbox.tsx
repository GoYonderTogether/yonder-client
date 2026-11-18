import { ChevronDown } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../cn.ts";
import { MenuSurface } from "../menu/menu.tsx";

export interface ListboxOption {
	value: string;
	label: string;
}

/** The listbox's panel: the shared menu surface, at least as wide as its trigger. */
export function Popover({ children }: { children: ReactNode }) {
	return <MenuSurface className="min-w-full">{children}</MenuSurface>;
}

export interface ListboxProps {
	label: string;
	value: string;
	options: readonly ListboxOption[];
	onChange: (value: string) => void;
	disabled?: boolean | undefined;
	id?: string;
	invalid?: boolean | undefined;
	describedBy?: string | undefined;
	className?: string;
	triggerClassName?: string;
	children?: ReactNode;
}

/** A small anchored picker. The opened list owns focus; Escape returns it to the trigger. */
export function Listbox({
	label,
	value,
	options,
	onChange,
	disabled,
	id,
	invalid,
	describedBy,
	className,
	triggerClassName,
	children,
}: ListboxProps) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const items = useRef<(HTMLButtonElement | null)[]>([]);
	const listId = useId();
	const selected = options.find((option) => option.value === value);

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
		if (open) items.current[active]?.focus();
	}, [open, active]);

	function close() {
		setOpen(false);
		trigger.current?.focus();
	}

	function show() {
		setActive(
			Math.max(
				0,
				options.findIndex((option) => option.value === value),
			),
		);
		setOpen(true);
	}

	function select(index: number) {
		const option = options[index];
		if (option) onChange(option.value);
		close();
	}
	function onKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key === "Escape" && open) {
			event.preventDefault();
			close();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) show();
			else if (options.length)
				setActive((active + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
		} else if (open && event.key === "Home") {
			event.preventDefault();
			setActive(0);
		} else if (open && event.key === "End") {
			event.preventDefault();
			setActive(options.length - 1);
		} else if (open && event.key === "Enter") {
			event.preventDefault();
			select(active);
		}
	}

	return (
		<div ref={root} className={cn("relative min-w-0", className)}>
			<button
				ref={trigger}
				id={id}
				type="button"
				disabled={disabled}
				aria-label={`${label}: ${selected?.label ?? value}`}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				aria-controls={open ? listId : undefined}
				onClick={() => (open ? close() : show())}
				onKeyDown={onKeyDown}
				className={cn(
					"inline-flex h-full min-w-0 max-w-full items-center justify-between gap-[var(--spacing-1)] rounded-[var(--radius-control-sm)] text-body text-[var(--color-text-primary)]",
					"focus-visible:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed",
					"[[data-input-frame]_&]:focus-visible:outline-none",
					triggerClassName,
				)}
			>
				{children ?? <span className="min-w-0 flex-1 truncate text-start">{selected?.label ?? value}</span>}
				<ChevronDown size={16} aria-hidden="true" className="shrink-0" />
			</button>
			{open && !disabled ? (
				<Popover>
					<div
						id={listId}
						role="listbox"
						aria-label={label}
						onKeyDown={onKeyDown}
						className="max-h-60 min-w-40 overflow-auto"
					>
						{options.map((option, index) => (
							<button
								key={option.value}
								ref={(node) => {
									items.current[index] = node;
								}}
								type="button"
								role="option"
								aria-selected={option.value === value}
								tabIndex={index === active ? 0 : -1}
								onClick={() => select(index)}
								onFocus={() => setActive(index)}
								className="block w-full rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-left text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)] aria-selected:bg-[var(--color-bg-selected)] aria-selected:hover:bg-[var(--color-bg-selected)] aria-selected:focus-visible:bg-[var(--color-bg-selected)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
							>
								{option.label}
							</button>
						))}
					</div>
				</Popover>
			) : null}
		</div>
	);
}

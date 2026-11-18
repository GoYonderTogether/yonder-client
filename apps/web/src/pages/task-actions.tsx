import { IconButton } from "@yonder/ui-components";
import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function TaskActions({
	scheduled,
	onAdd,
	onCreateSchedule,
}: {
	scheduled: boolean;
	onAdd: () => void;
	onCreateSchedule: () => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const id = useId();
	const actions = scheduled ? (["addGoal", "newSchedule"] as const) : (["addItem"] as const);
	const label = t(scheduled ? "tasks.addGoal" : "tasks.addItem");
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", dismiss);
		document.addEventListener("focusin", dismiss);
		return () => {
			document.removeEventListener("pointerdown", dismiss);
			document.removeEventListener("focusin", dismiss);
		};
	}, [open]);
	useEffect(() => {
		if (open) buttons.current[active]?.focus();
	}, [open, active]);
	return (
		<div ref={root} className="relative">
			<IconButton
				ref={trigger}
				size="md"
				aria-label={label}
				aria-haspopup={scheduled ? "menu" : undefined}
				aria-expanded={scheduled ? open : undefined}
				aria-controls={open ? id : undefined}
				onClick={() => {
					setActive(0);
					if (scheduled) setOpen(!open);
					else onAdd();
				}}
				onKeyDown={(event) => {
					if (scheduled && event.key === "ArrowDown") {
						event.preventDefault();
						setActive(0);
						setOpen(true);
					}
				}}
			>
				<Plus size={20} aria-hidden="true" />
			</IconButton>
			{open ? (
				<div
					id={id}
					role="menu"
					aria-label={label}
					className="absolute right-0 top-full z-50 mt-[var(--spacing-2)] min-w-max rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-1)] shadow-[var(--shadow-lg)]"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							setOpen(false);
							trigger.current?.focus();
						} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							setActive((active + (event.key === "ArrowDown" ? 1 : actions.length - 1)) % actions.length);
						} else if (event.key === "Home" || event.key === "End") {
							event.preventDefault();
							setActive(event.key === "Home" ? 0 : actions.length - 1);
						}
					}}
				>
					{actions.map((action, index) => {
						const Icon = action === "newSchedule" ? CalendarClock : Plus;
						return (
							<button
								key={action}
								ref={(element) => {
									buttons.current[index] = element;
								}}
								type="button"
								role="menuitem"
								tabIndex={index === active ? 0 : -1}
								onFocus={() => setActive(index)}
								onClick={() => {
									setOpen(false);
									trigger.current?.focus();
									if (action === "newSchedule") onCreateSchedule();
									else onAdd();
								}}
								className="flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control-sm)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-left text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)]"
							>
								<Icon size={18} aria-hidden="true" />
								<span>{t(`tasks.${action}`)}</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

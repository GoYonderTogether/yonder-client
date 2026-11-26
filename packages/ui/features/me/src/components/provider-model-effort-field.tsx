import { Field, InputFrame, MENU_ITEM, MenuSurface } from "@yonder/ui-components";
import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EFFORT_LEVELS, type EffortLevel } from "./provider-model-slots.ts";

export function EffortField({
	selected,
	disabled,
	onChange,
}: {
	selected: readonly EffortLevel[];
	disabled: boolean;
	onChange: (efforts: EffortLevel[]) => void;
}) {
	const { t } = useTranslation();
	const label = t("models.slotEfforts");
	const id = useId();
	const menuId = `${id}-menu`;
	const chosenId = `${id}-chosen`;
	const [open, setOpen] = useState(false);
	const [side, setSide] = useState<"top" | "bottom">("bottom");
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const items = useRef<(HTMLButtonElement | null)[]>([]);
	const visible = open && !disabled;

	useLayoutEffect(() => {
		const button = trigger.current;
		const menu = document.getElementById(menuId);
		if (!visible || !button || !menu) return;
		const bounds = button.getBoundingClientRect();
		let top = 0;
		let bottom = window.innerHeight;
		for (let parent = button.parentElement; parent; parent = parent.parentElement) {
			if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
				const clip = parent.getBoundingClientRect();
				top = Math.max(top, clip.top);
				bottom = Math.min(bottom, clip.bottom);
			}
		}
		const below = bottom - bounds.bottom;
		setSide(below < menu.getBoundingClientRect().height && bounds.top - top > below ? "top" : "bottom");
	}, [visible, menuId]);

	useEffect(() => {
		if (!visible) return;
		items.current[0]?.focus();
		const outside = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("focusin", outside);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("focusin", outside);
		};
	}, [visible]);

	const close = () => {
		setOpen(false);
		trigger.current?.focus();
	};
	const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		const count = EFFORT_LEVELS.length;
		const index = event.target instanceof HTMLButtonElement ? items.current.indexOf(event.target) : -1;
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? count - 1
					: event.key === "ArrowDown"
						? (index + 1) % count
						: event.key === "ArrowUp"
							? (index + count - 1) % count
							: -1;
		if (next !== -1) {
			event.preventDefault();
			items.current[next]?.focus();
		}
	};
	return (
		<Field label={label} htmlFor={id}>
			<div ref={root} className="relative min-w-0">
				<InputFrame disabled={disabled} focused={visible} className="h-auto! min-h-[var(--control-md)]">
					<button
						ref={trigger}
						id={id}
						type="button"
						aria-label={label}
						aria-haspopup="menu"
						aria-expanded={visible}
						aria-controls={visible ? menuId : undefined}
						aria-describedby={selected.length ? chosenId : undefined}
						disabled={disabled}
						onClick={() => (visible ? close() : setOpen(true))}
						onKeyDown={(event) => {
							if (!visible && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
								event.preventDefault();
								setOpen(true);
							}
						}}
						className="flex min-h-[var(--control-md)] w-full min-w-0 items-center justify-between gap-[var(--spacing-2)] py-[var(--spacing-1)] text-body text-[var(--color-text-primary)] outline-none disabled:cursor-not-allowed"
					>
						<span id={chosenId} className="flex min-w-0 flex-1 flex-wrap items-center gap-[var(--spacing-1)]">
							{selected.length ? (
								selected.map((level) => (
									<span
										key={level}
										className="rounded-[var(--radius-control-sm)] bg-[var(--color-bg-selected)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-caption"
									>
										{level}
									</span>
								))
							) : (
								<span aria-hidden="true" className="text-[var(--color-text-tertiary)]">
									—
								</span>
							)}
						</span>
						<ChevronDown size={16} aria-hidden="true" className="shrink-0" />
					</button>
				</InputFrame>
				{visible ? (
					<MenuSurface
						id={menuId}
						side={side}
						role="menu"
						aria-label={label}
						className="w-full min-w-0"
						onKeyDown={onMenuKeyDown}
					>
						{EFFORT_LEVELS.map((level, index) => {
							const checked = selected.includes(level);
							return (
								<button
									key={level}
									ref={(node) => {
										items.current[index] = node;
									}}
									type="button"
									role="menuitemcheckbox"
									tabIndex={-1}
									aria-checked={checked}
									onClick={() =>
										onChange(EFFORT_LEVELS.filter((each) => (each === level ? !checked : selected.includes(each))))
									}
									className={`${MENU_ITEM} text-[var(--color-text-primary)]`}
								>
									<span aria-hidden="true" className="grid shrink-0 place-items-center">
										<Check size={16} className={checked ? "" : "invisible"} />
									</span>
									<span className="min-w-0 flex-1">{level}</span>
								</button>
							);
						})}
					</MenuSurface>
				) : null}
			</div>
		</Field>
	);
}

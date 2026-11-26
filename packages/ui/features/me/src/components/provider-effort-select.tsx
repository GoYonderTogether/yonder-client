import { Popover } from "@yonder/ui-components";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EFFORT_LEVELS, type EffortLevel } from "./provider-model-slots.ts";

/**
 * The reasoning levels a model declares, as one multi-select.
 *
 * Five loose checkboxes read as five separate questions; this is one field with one answer ("which
 * levels does this model take?"), so it is a closed control that opens a list. What it shows and
 * what it stores are the upstream's own words — `low`, `high`, `max` — never a translated label,
 * because these are the exact strings the provider is sent and a person comparing two providers
 * needs to see the same word both places.
 */
export function EffortSelect({
	value,
	disabled,
	onChange,
}: {
	value: readonly EffortLevel[];
	disabled: boolean;
	onChange: (levels: EffortLevel[]) => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	// Kept in the one order the host ranks them, whatever order they were ticked in.
	const chosen = EFFORT_LEVELS.filter((level) => value.includes(level));
	const summary = chosen.length ? chosen.join(" / ") : t("models.effort.none");
	const toggle = (level: EffortLevel, on: boolean) =>
		onChange(EFFORT_LEVELS.filter((each) => (each === level ? on : value.includes(each))));

	useEffect(() => {
		if (!open) return;
		const outside = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);

	return (
		<div ref={root} className="relative flex min-w-0 flex-col gap-[var(--spacing-1)]">
			<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotEfforts")}</span>
			<button
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={`${t("models.slotEfforts")}: ${summary}`}
				onClick={() => setOpen((each) => !each)}
				className="inline-flex h-9 min-w-0 items-center justify-between gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-input)] px-[var(--spacing-3)] text-start text-body disabled:cursor-not-allowed disabled:opacity-60"
			>
				<span
					className={`min-w-0 truncate text-caption ${chosen.length ? "font-mono" : "text-[var(--color-text-tertiary)]"}`}
					title={summary}
				>
					{summary}
				</span>
				<ChevronDown size={16} aria-hidden="true" className="shrink-0" />
			</button>
			{open && !disabled ? (
				<Popover>
					<div role="listbox" aria-multiselectable="true" aria-label={t("models.slotEfforts")}>
						{EFFORT_LEVELS.map((level) => {
							const checked = value.includes(level);
							return (
								<button
									key={level}
									type="button"
									role="option"
									aria-selected={checked}
									onClick={() => toggle(level, !checked)}
									className="flex w-full items-center gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-body hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
								>
									<span
										aria-hidden="true"
										className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-control-sm)] border text-caption ${
											checked
												? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
												: "border-[var(--color-border-strong)]"
										}`}
									>
										{checked ? "✓" : ""}
									</span>
									<span className="w-16 font-mono">{level}</span>
									<span className="text-caption text-[var(--color-text-tertiary)]">
										{t(`models.effortHint.${level}`)}
									</span>
								</button>
							);
						})}
					</div>
				</Popover>
			) : null}
		</div>
	);
}

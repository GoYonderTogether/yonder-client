import { ListGroup } from "@yonder/ui-components";
import { useTheme } from "@yonder/ui-data";
import { STYLE_CHOICES, THEME_CHOICES, UI_SIZE_CHOICES } from "@yonder/ui-tokens";
import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSection, TimeZoneDeviceNote, TimeZoneSection } from "./account-preferences-sections.tsx";

/**
 * 通用: the account's zone and language, then appearance and interface size — grouped lists with a
 * check mark on the choice in force, the iOS pattern for "pick one". The zone and language rows are
 * account-wide (2026-11-25); the others are this device's look.
 */
export function GeneralSection({ children, onOpenTimeZone }: { children?: ReactNode; onOpenTimeZone: () => void }) {
	const { t } = useTranslation();
	const theme = useTheme();
	const id = useId();

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
				<fieldset aria-label={t("common.timezone.title")} className="min-w-0">
					<TimeZoneSection onOpenPicker={onOpenTimeZone} />
				</fieldset>
				<TimeZoneDeviceNote />
			</div>
			<fieldset aria-label={t("common.language")} className="min-w-0">
				<LanguageSection />
			</fieldset>
			<fieldset aria-label={t("common.appearance")} className="min-w-0">
				<ListGroup title={t("common.appearance")}>
					{THEME_CHOICES.map((option) => (
						<Choice
							key={option}
							group={`${id}-theme`}
							selected={theme.choice === option}
							onSelect={() => theme.setChoice(option)}
							label={t(`common.theme.${option}`)}
						/>
					))}
				</ListGroup>
			</fieldset>
			<fieldset aria-label={t("common.style.title")} className="min-w-0">
				<ListGroup title={t("common.style.title")}>
					{STYLE_CHOICES.map((option) => (
						<Choice
							key={option}
							group={`${id}-style`}
							selected={theme.style === option}
							onSelect={() => theme.setStyle(option)}
							label={t(`common.style.${option}`)}
						/>
					))}
				</ListGroup>
			</fieldset>
			<fieldset aria-label={t("common.uiSize.title")} className="min-w-0">
				<ListGroup title={t("common.uiSize.title")} footer={t("common.uiSize.footer")}>
					{UI_SIZE_CHOICES.map((option) => (
						<Choice
							key={option}
							group={`${id}-size`}
							selected={theme.size === option}
							onSelect={() => theme.setSize(option)}
							label={t(`common.uiSize.${option}`)}
						/>
					))}
				</ListGroup>
			</fieldset>
			{children}
		</div>
	);
}

function Choice({
	group,
	selected,
	onSelect,
	label,
}: {
	group: string;
	selected: boolean;
	onSelect: () => void;
	label: string;
}) {
	return (
		<li className="group/row relative">
			<label className="relative block cursor-pointer">
				{/* The native radio covers its row, as in Segmented, so pointer, touch and assistive
				    technology all hit the same target. */}
				<input
					type="radio"
					name={group}
					checked={selected}
					onChange={onSelect}
					className="peer absolute inset-0 size-full cursor-pointer opacity-0"
				/>
				<span className="flex min-h-[var(--row-height)] items-center justify-between px-[var(--spacing-4)] text-body text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] peer-hover:bg-[var(--color-bg-hover)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-[var(--color-accent)]">
					{label}
					{selected ? <Check size={18} strokeWidth={2.2} aria-hidden="true" /> : null}
				</span>
			</label>
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}

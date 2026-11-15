import { EmptyState, ListGroup } from "@yonder/ui-components";
import { useLocalePreference, useTheme } from "@yonder/ui-data";
import type { Locale } from "@yonder/ui-i18n";
import type { ThemeChoice } from "@yonder/ui-tokens";
import { Check, Laptop } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The sections whose feature is not built yet.
 */
export function DevicesSection() {
	const { t } = useTranslation();
	return <EmptyState icon={<Laptop size={24} strokeWidth={1.6} />} title={t("me.devices.emptyTitle")} />;
}

/** 通用: language and appearance, as checkmark lists — the iOS pattern for "pick one". */
export function GeneralSection() {
	const { t } = useTranslation();
	const theme = useTheme();
	const locale = useLocalePreference();

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<ListGroup title={t("common.appearance")}>
				{(["system", "light", "dark"] as const).map((option) => (
					<Choice
						key={option}
						group="theme"
						selected={theme.choice === option}
						onSelect={() => theme.setChoice(option as ThemeChoice)}
						label={t(`common.theme.${option}`)}
					/>
				))}
			</ListGroup>
			<ListGroup title={t("common.language")}>
				{(["zh-CN", "en"] as const).map((option) => (
					<Choice
						key={option}
						group="locale"
						selected={locale.locale === option}
						onSelect={() => locale.setLocale(option as Locale)}
						label={option === "zh-CN" ? t("common.locale.zhCN") : t("common.locale.en")}
					/>
				))}
			</ListGroup>
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
			{/* biome-ignore lint/a11y/useSemanticElements: an iOS-style checkmark row, announced as a radio. */}
			<button
				type="button"
				role="radio"
				aria-checked={selected}
				data-group={group}
				onClick={onSelect}
				className="flex min-h-[var(--row-height)] w-full items-center justify-between px-[var(--spacing-4)] text-start text-body text-[var(--color-text-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
			>
				{label}
				{selected ? (
					<Check size={18} strokeWidth={2.2} className="text-[var(--color-accent-text)]" aria-hidden="true" />
				) : null}
			</button>
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}

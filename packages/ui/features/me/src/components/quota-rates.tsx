import { ListGroup } from "@yonder/ui-components";
import { useQuotaRates } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * The billing explanation: one sentence of rule, then the published rate card. Prices are quota
 * per token, which for a CNY price is the same number as yuan per million tokens.
 */
export function QuotaRates() {
	const { t, i18n } = useTranslation();
	const rates = useQuotaRates();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
	if (!rates.data) return rates.isError ? <p className="text-caption">{t("me.quota.ratesFailed")}</p> : null;
	return (
		<ListGroup title={t("me.quota.rates")} footer={t("me.quota.ratesRule")}>
			<li className="grid grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
				<span>{t("me.quota.rateModel")}</span>
				<span className="text-end">{t("me.quota.rateInput")}</span>
				<span className="text-end">{t("me.quota.rateOutput")}</span>
				<span className="text-end">{t("me.quota.rateCacheWrite")}</span>
				<span className="text-end">{t("me.quota.rateCacheRead")}</span>
			</li>
			{rates.data.items.map((item) => (
				<li
					key={item.model}
					className="grid grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-body text-[var(--color-text-primary)] last:border-0"
				>
					<span className="min-w-0 break-words">
						{item.displayName}
						<span className="block text-caption text-[var(--color-text-tertiary)]">
							{t("me.quota.rateMultiple", { multiple: format(item.multiple) })}
						</span>
					</span>
					<span className="text-end tabular-nums">{format(item.input)}</span>
					<span className="text-end tabular-nums">{format(item.output)}</span>
					<span className="text-end tabular-nums">{format(item.cacheWrite)}</span>
					<span className="text-end tabular-nums">{format(item.cacheRead)}</span>
				</li>
			))}
		</ListGroup>
	);
}

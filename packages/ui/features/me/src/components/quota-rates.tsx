import type { RateCardResponse } from "@yonder/protocol";
import { ListGroup } from "@yonder/ui-components";
import { useQuotaRates } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * The billing explanation: one sentence of rule, then the published price tiers. Prices are quota
 * per token, which for a CNY price is the same number as yuan per million tokens. Tiers are named
 * by the catalog, so nothing here knows a vendor or a model.
 */
export function QuotaRates({ rates }: { rates: RateCardResponse }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
	return (
		<ListGroup title={t("me.quota.rates")} footer={t("me.quota.ratesRule", { baseline: rates.baseline })}>
			<li className="grid grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
				<span>{t("me.quota.rateModel")}</span>
				<span className="text-end">{t("me.quota.rateInput")}</span>
				<span className="text-end">{t("me.quota.rateOutput")}</span>
				<span className="text-end">{t("me.quota.rateCacheWrite")}</span>
				<span className="text-end">{t("me.quota.rateCacheRead")}</span>
			</li>
			{rates.items.map((item) => (
				<li
					key={item.name}
					className="grid grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-body text-[var(--color-text-primary)] last:border-0"
				>
					<span className="min-w-0 break-words">
						{item.name}
						<span className="block text-caption text-[var(--color-text-tertiary)]">
							{t("me.quota.rateMultiple", { multiple: format(item.multiple), baseline: rates.baseline })}
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

/** The quota page's own section: the published tiers, loaded on their own because it is optional. */
export function QuotaRatesSection() {
	const { t } = useTranslation();
	const rates = useQuotaRates();
	if (!rates.data) return rates.isError ? <p className="text-caption">{t("me.quota.ratesFailed")}</p> : null;
	return <QuotaRates rates={rates.data} />;
}

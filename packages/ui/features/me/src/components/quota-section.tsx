import { Button, ListGroup } from "@yonder/ui-components";
import { useQuota, useQuotaLedger } from "@yonder/ui-data";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuotaNumber } from "./quota-number.tsx";
import { QuotaPools } from "./quota-pools.tsx";
import { QuotaRatesSection } from "./quota-rates.tsx";
import { QuotaUsage } from "./quota-usage.tsx";

export function QuotaSection() {
	const { t, i18n } = useTranslation();
	const quota = useQuota();
	const ledger = useQuotaLedger();
	const locale = i18n.resolvedLanguage ?? i18n.language;

	if (!quota.data) {
		return quota.isError ? (
			<Button variant="link" onClick={() => void quota.refetch()}>
				{t("app.retry")}
			</Button>
		) : (
			<p role="status">{t("app.loading")}</p>
		);
	}

	const entries = ledger.data?.pages.flatMap((page) => page.items) ?? [];
	const reset = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(quota.data.cycle.resetsAt));
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<QuotaPools quota={quota.data} />
			<div className="flex flex-wrap gap-x-[var(--spacing-8)] gap-y-[var(--spacing-3)] text-body text-[var(--color-text-secondary)]">
				<p>
					{t("me.quota.granted")} <QuotaNumber value={quota.data.pools.main.granted} locale={locale} />
				</p>
				<p>
					{t("me.quota.used")} <QuotaNumber value={quota.data.pools.main.used} locale={locale} />
				</p>
				<p>{t("me.quota.resetsAt", { date: reset })}</p>
			</div>
			<ListGroup title={t("me.quota.ledger")}>
				{entries.map((entry) => (
					<li
						key={entry.id}
						className="flex items-center justify-between gap-[var(--spacing-3)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
					>
						<div className="min-w-0">
							<p className="text-body text-[var(--color-text-primary)]">
								{t(`me.quota.kinds.${entry.kind}`)}
								{entry.pool === "legacy" ? "" : ` · ${t(`me.quota.pools.${entry.pool}`)}`}
							</p>
							<time dateTime={entry.at} className="text-caption text-[var(--color-text-secondary)]">
								{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
									new Date(entry.at),
								)}
							</time>
						</div>
						<span className="shrink-0 text-body text-[var(--color-text-primary)]">
							<QuotaNumber value={entry.amount} locale={locale} signed />
						</span>
					</li>
				))}
				{ledger.isLoading ? <li className="p-[var(--spacing-4)] text-caption">{t("app.loading")}</li> : null}
				{ledger.isError ? (
					<li className="px-[var(--spacing-4)]">
						<Button variant="link" onClick={() => void ledger.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				) : null}
				{!ledger.isLoading && !ledger.isError && entries.length === 0 ? (
					<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
						{t("me.quota.ledgerEmpty")}
					</li>
				) : null}
			</ListGroup>
			{ledger.hasNextPage ? (
				<Button variant="secondary" onClick={() => void ledger.fetchNextPage()} loading={ledger.isFetchingNextPage}>
					{t("me.quota.more")}
				</Button>
			) : null}
			<QuotaUsage />
			<QuotaRatesSection />
			<a
				href="/pricing"
				className="inline-flex items-center gap-[var(--spacing-2)] self-start text-caption text-[var(--color-accent-text)] hover:underline"
			>
				<ExternalLink size={16} aria-hidden="true" />
				{t("me.quota.pricing")}
			</a>
		</div>
	);
}

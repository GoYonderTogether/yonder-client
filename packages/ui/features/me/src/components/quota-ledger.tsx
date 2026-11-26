import { Button, ListGroup } from "@yonder/ui-components";
import { useQuotaLedger } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { QuotaNumber } from "./quota-number.tsx";

/** Grants, invite rewards, refunds and month-end expiry: everything that moved a balance other than use. */
export function QuotaLedger() {
	const { t, i18n } = useTranslation();
	const ledger = useQuotaLedger();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const entries = ledger.data?.pages.flatMap((page) => page.items) ?? [];
	return (
		<>
			<ListGroup>
				{entries.map((entry) => (
					<li
						key={entry.id}
						className="flex items-center justify-between gap-[var(--spacing-3)] border-b border-dashed border-[var(--color-border)] px-[var(--spacing-1)] py-[var(--spacing-3)] last:border-b-0"
					>
						<div className="min-w-0">
							<p className="text-body text-[var(--color-text-primary)]">
								{t(`me.quota.kinds.${entry.kind}`)}
								{entry.pool === "legacy" ? "" : ` · ${t(`me.quota.pools.${entry.pool}`)}`}
							</p>
							<time dateTime={entry.at} className="text-caption text-[var(--color-text-tertiary)]">
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
					<li className="px-[var(--spacing-1)]">
						<Button variant="link" onClick={() => void ledger.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				) : null}
				{!ledger.isLoading && !ledger.isError && entries.length === 0 ? (
					<li className="px-[var(--spacing-1)] py-[var(--spacing-4)] text-caption text-[var(--color-text-tertiary)]">
						{t("me.quota.ledgerEmpty")}
					</li>
				) : null}
			</ListGroup>
			{ledger.hasNextPage ? (
				<Button variant="secondary" onClick={() => void ledger.fetchNextPage()} loading={ledger.isFetchingNextPage}>
					{t("me.quota.more")}
				</Button>
			) : null}
		</>
	);
}

import type { QuotaPool, UsagePurpose } from "@yonder/protocol";
import { Button, FormSection, ListGroup, ListRow } from "@yonder/ui-components";
import { useQuota, useUsageOverview } from "@yonder/ui-data";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QuotaChart } from "./quota-chart.tsx";
import { QuotaLedger } from "./quota-ledger.tsx";
import { POOL_ORDER, QuotaMeters } from "./quota-meters.tsx";
import { formatDay, formatQuota } from "./quota-number.tsx";
import { QuotaDayPage, QuotaPoolPage, QuotaPurposePage } from "./quota-pages.tsx";
import { type QuotaRange, RangeSwitch } from "./quota-range.tsx";
import { QuotaRatesSection } from "./quota-rates.tsx";
import { QuotaRunList } from "./quota-runs.tsx";

/**
 * The pages under 「我 › 额度」, one level deep: a pool, a day, a purpose, every run, the ledger, the
 * billing explanation. A page is a path segment so back, the browser and a shared link all work.
 */
export type QuotaPage =
	| { kind: "pool"; pool: QuotaPool }
	| { kind: "day"; date: string }
	| { kind: "purpose"; purpose: UsagePurpose }
	| { kind: "runs" }
	| { kind: "ledger" }
	| { kind: "rates" };

const PURPOSES: readonly UsagePurpose[] = [
	"chat",
	"subtask",
	"scheduled",
	"meeting",
	"memory",
	"compact",
	"outward",
	"visiting",
	"other",
];

export function parseQuotaPage(page: string | null): QuotaPage | null {
	if (!page) return null;
	if (page === "runs" || page === "ledger" || page === "rates") return { kind: page };
	const [kind, value = ""] = [page.slice(0, page.indexOf("-")), page.slice(page.indexOf("-") + 1)];
	if (kind === "pool" && (POOL_ORDER as string[]).includes(value)) return { kind, pool: value as QuotaPool };
	if (kind === "day" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { kind, date: value };
	if (kind === "purpose" && (PURPOSES as string[]).includes(value)) return { kind, purpose: value as UsagePurpose };
	return null;
}

export function quotaPagePath(page: QuotaPage): string {
	switch (page.kind) {
		case "pool":
			return `pool-${page.pool}`;
		case "day":
			return `day-${page.date}`;
		case "purpose":
			return `purpose-${page.purpose}`;
		default:
			return page.kind;
	}
}

export function quotaPageTitle(page: QuotaPage, t: TFunction, locale: string): string {
	switch (page.kind) {
		case "pool":
			return t(`me.quota.pools.${page.pool}`);
		case "day":
			return formatDay(page.date, locale, true);
		case "purpose":
			return t(`me.quota.purposes.${page.purpose}`);
		case "runs":
			return t("me.quota.allRuns");
		case "ledger":
			return t("me.quota.ledger");
		case "rates":
			return t("me.quota.rates");
	}
}

/**
 * 「我 › 额度」. The first screen answers "how much is left and where did it go" on one phone screen:
 * the pool meters, a month of daily spending by pool, and spending by purpose. Every figure opens
 * the page behind it; per-call detail lives only in the runs, a tap further down.
 */
export function QuotaSection({
	page = null,
	onOpenPage = () => undefined,
}: {
	page?: string | null;
	onOpenPage?: (page: string) => void;
}) {
	const { t } = useTranslation();
	const quota = useQuota();
	const [range, setRange] = useState<QuotaRange>("cycle");
	const open = (next: QuotaPage) => onOpenPage(quotaPagePath(next));
	const sub = parseQuotaPage(page);

	if (!quota.data) {
		return quota.isError ? (
			<Button variant="link" onClick={() => void quota.refetch()}>
				{t("app.retry")}
			</Button>
		) : (
			<p role="status">{t("app.loading")}</p>
		);
	}
	switch (sub?.kind) {
		case "pool":
			return (
				<QuotaPoolPage
					quota={quota.data}
					pool={sub.pool}
					range={range}
					onRange={setRange}
					onOpenDay={(date) => open({ kind: "day", date })}
				/>
			);
		case "day":
			return <QuotaDayPage date={sub.date} />;
		case "purpose":
			return <QuotaPurposePage purpose={sub.purpose} range={range} />;
		case "runs":
			return <QuotaRunList filter={{}} />;
		case "ledger":
			return <QuotaLedger />;
		case "rates":
			return <QuotaRatesSection />;
	}
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<QuotaMeters quota={quota.data} onOpenPool={(pool) => open({ kind: "pool", pool })} />
			<Overview
				range={range}
				onRange={setRange}
				onOpenDay={(date) => open({ kind: "day", date })}
				onOpenPurpose={(purpose) => open({ kind: "purpose", purpose })}
			/>
			<ListGroup>
				<ListRow title={t("me.quota.allRuns")} chevron onClick={() => open({ kind: "runs" })} />
				<ListRow title={t("me.quota.ledger")} chevron onClick={() => open({ kind: "ledger" })} />
				<ListRow title={t("me.quota.rates")} chevron onClick={() => open({ kind: "rates" })} />
			</ListGroup>
		</div>
	);
}

function Overview({
	range,
	onRange,
	onOpenDay,
	onOpenPurpose,
}: {
	range: QuotaRange;
	onRange: (range: QuotaRange) => void;
	onOpenDay: (date: string) => void;
	onOpenPurpose: (purpose: UsagePurpose) => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const overview = useUsageOverview(range);
	const total = overview.data?.totals.cost ?? 0;
	return (
		<>
			<FormSection
				title={
					<span className="flex items-center justify-between gap-[var(--spacing-3)]">
						{t("me.quota.chartTitle")}
						<RangeSwitch range={range} onRange={onRange} />
					</span>
				}
			>
				{overview.data ? (
					<QuotaChart overview={overview.data} onOpenDay={onOpenDay} />
				) : overview.isError ? (
					<Button variant="link" onClick={() => void overview.refetch()}>
						{t("app.retry")}
					</Button>
				) : (
					<p role="status" className="text-caption">
						{t("app.loading")}
					</p>
				)}
			</FormSection>
			{overview.data?.byPurpose.length ? (
				<ListGroup title={t("me.quota.whereTitle")}>
					{overview.data.byPurpose.map((entry) => (
						<ListRow
							key={entry.purpose}
							title={t(`me.quota.purposes.${entry.purpose}`)}
							subtitle={t("me.quota.times", { count: entry.runs })}
							trailing={
								<span className="tabular-nums text-[var(--color-text-primary)]">
									{formatQuota(entry.cost, locale)}
									<span className="ms-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
										{total ? `${Math.round((entry.cost / total) * 100)}%` : ""}
									</span>
								</span>
							}
							chevron
							onClick={() => onOpenPurpose(entry.purpose)}
						/>
					))}
				</ListGroup>
			) : null}
		</>
	);
}

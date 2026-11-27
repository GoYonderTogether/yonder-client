import type { QuotaPool, QuotaResponse, UsagePurpose } from "@yonder/protocol";
import { Button, FormSection, ListGroup, ListValue } from "@yonder/ui-components";
import { useConversations, usePerson, useQuotaConfig, useUsageOverview } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { QuotaChart } from "./quota-chart.tsx";
import { PoolMeter, poolRule } from "./quota-meters.tsx";
import { formatQuota, QuotaNumber } from "./quota-number.tsx";
import { type QuotaRange, RangeSwitch } from "./quota-range.tsx";
import { conversationName, QuotaRunList } from "./quota-runs.tsx";

/**
 * One pool: its balance and the rule it follows in plain words, its own daily chart, the
 * conversations that spent it, then every run that drew on it.
 */
export function QuotaPoolPage({
	quota,
	pool,
	range,
	onRange,
	onOpenDay,
}: {
	quota: QuotaResponse;
	pool: QuotaPool;
	range: QuotaRange;
	onRange: (range: QuotaRange) => void;
	onOpenDay: (date: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const balance = quota.pools[pool];
	const config = useQuotaConfig(quota.configVersion);
	const overview = useUsageOverview(range, pool);
	const conversations = useConversations();
	const person = usePerson();
	const rule = poolRule(pool, quota, t);
	const monthly = config.data?.monthly[pool];
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-1)]">
				<p className="text-display font-semibold text-[var(--color-text-primary)]">
					{formatQuota(balance.remaining, locale)}
				</p>
				<PoolMeter pool={pool} percent={balance.remainingPercent} large />
				<p className="text-end text-caption tabular-nums text-[var(--color-text-tertiary)]">
					{t("me.quota.remainingPercent", { percent: Math.round(balance.remainingPercent) })}
				</p>
			</div>
			<ListGroup title={t("me.quota.poolFacts")}>
				<ListValue title={t("me.quota.poolGranted")} value={<QuotaNumber value={balance.granted} locale={locale} />} />
				<ListValue title={t("me.quota.poolUsed")} value={<QuotaNumber value={balance.used} locale={locale} />} />
				{monthly !== undefined ? (
					<ListValue title={t("me.quota.poolRefill")} value={formatQuota(monthly, locale)} />
				) : null}
				{rule ? <ListValue title={t("me.quota.poolWhenEmpty")} value={rule} /> : null}
			</ListGroup>
			<FormSection
				title={
					<span className="flex items-center justify-between gap-[var(--spacing-3)]">
						{t("me.quota.chartTitle")}
						<RangeSwitch range={range} onRange={onRange} />
					</span>
				}
			>
				{overview.data ? (
					<QuotaChart overview={overview.data} pools={[pool]} onOpenDay={onOpenDay} />
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
			{overview.data?.topConversations.length ? (
				<ListGroup title={t("me.quota.topConversations")}>
					{overview.data.topConversations.map((entry) => (
						<ListValue
							key={entry.conversationId}
							title={
								conversationName(
									conversations.data?.items.find((item) => item.id === entry.conversationId),
									person?.id,
								) ?? t("me.quota.untitledConversation")
							}
							value={formatQuota(entry.cost, locale)}
						/>
					))}
				</ListGroup>
			) : null}
			<QuotaRunList filter={{ pool }} title={t("me.quota.runsTitle")} />
		</div>
	);
}

/** One day, from a column of the chart: every run that day, newest first. */
export function QuotaDayPage({ date }: { date: string }) {
	const { t } = useTranslation();
	return <QuotaRunList filter={{ date }} empty={t("me.quota.dayRunsEmpty")} />;
}

/** One purpose, from 「用在哪里」: every run of that kind, newest first. */
export function QuotaPurposePage({ purpose, range }: { purpose: UsagePurpose; range: QuotaRange }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const overview = useUsageOverview(range);
	const entry = overview.data?.byPurpose.find((item) => item.purpose === purpose);
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			{entry ? (
				<p className="px-[var(--spacing-1)] text-body text-[var(--color-text-secondary)]">
					{t(range === "cycle" ? "me.quota.rangeCycle" : "me.quota.range7d")} ·{" "}
					<span className="text-h2 font-semibold text-[var(--color-text-primary)]">
						{formatQuota(entry.cost, locale)}
					</span>{" "}
					· {t("me.quota.times", { count: entry.runs })}
				</p>
			) : null}
			<QuotaRunList filter={{ purpose }} />
		</div>
	);
}

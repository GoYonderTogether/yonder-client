import type { QuotaPool, QuotaResponse } from "@yonder/protocol";
import { useQuotaConfig, useQuotaRates } from "@yonder/ui-data";
import type { TFunction } from "i18next";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatQuota, formatTokens } from "./quota-number.tsx";

export const POOL_ORDER: readonly QuotaPool[] = ["main", "background", "coding", "external", "tools"];

/** Each pool's colour, validated as a set for both themes (tokens.css, quota pools). */
export const POOL_COLOR: Record<QuotaPool, string> = {
	main: "var(--color-pool-main)",
	background: "var(--color-pool-background)",
	coding: "var(--color-pool-coding)",
	external: "var(--color-pool-external)",
	tools: "var(--color-pool-tools)",
};

/** What happens when a pool runs out, in one line; the main pool has no such rule. */
export function poolRule(pool: QuotaPool, quota: QuotaResponse, t: TFunction): string | null {
	if (pool === "main") return null;
	const rule = quota.overflow[pool];
	if (!rule?.overflow) return t("me.quota.poolNoOverflow");
	return rule.rate === 1 ? t("me.quota.poolOverflowSame") : t("me.quota.poolOverflow", { rate: rule.rate });
}

/** The amount the main pool keeps for the user when other pools draw on it; null when none does. */
export function mainFloor(quota: QuotaResponse): number | null {
	const floors = POOL_ORDER.map((pool) => quota.overflow[pool]?.floor ?? null).filter((floor) => floor !== null);
	return floors.length ? Math.max(...floors) : null;
}

export function PoolMeter({ pool, percent, large = false }: { pool: QuotaPool; percent: number; large?: boolean }) {
	return (
		<div
			className={`w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-pool-track)] ${large ? "h-[var(--spacing-3)]" : "h-[var(--spacing-1)]"}`}
		>
			<div
				className="h-full rounded-[var(--radius-full)]"
				style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: POOL_COLOR[pool] }}
			/>
		</div>
	);
}

/**
 * The top of the quota page: the main pool as one large meter, the other three as a row of small
 * ones, every figure in millions. Each meter opens its pool's own page. The tick on the main meter is
 * the floor other pools stop drawing at, because that is the part of main nobody else can spend.
 */
export function QuotaMeters({ quota, onOpenPool }: { quota: QuotaResponse; onOpenPool: (pool: QuotaPool) => void }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const config = useQuotaConfig(quota.configVersion);
	const main = quota.pools.main;
	const floor = mainFloor(quota);
	const floorAt = floor !== null && main.granted > 0 ? Math.min(100, (floor / main.granted) * 100) : null;
	const reset = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(
		new Date(quota.cycle.resetsAt),
	);
	const monthly = config.data?.monthly.main;
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<button
				type="button"
				aria-label={t("me.quota.openPool", { pool: t("me.quota.pools.main") })}
				onClick={() => onOpenPool("main")}
				className="group flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-control)] p-[var(--spacing-1)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<span className="flex items-center justify-between gap-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]">
					<span className="flex items-center gap-[var(--spacing-1)]">
						{t("me.quota.pools.main")}
						<ChevronRight size={16} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
					</span>
					{monthly ? <span>{t("me.quota.refill", { date: reset, amount: formatQuota(monthly, locale) })}</span> : null}
				</span>
				<span className="flex flex-wrap items-baseline gap-x-[var(--spacing-2)]">
					<span className="text-display font-semibold text-[var(--color-text-primary)]">
						{formatQuota(main.remaining, locale)}
					</span>
					<span className="text-body text-[var(--color-text-secondary)]">
						{t("me.quota.ofGranted", { amount: formatQuota(main.granted, locale) })}
					</span>
				</span>
				<span className="relative block">
					<PoolMeter pool="main" percent={main.remainingPercent} large />
					{floorAt !== null ? (
						<span
							aria-hidden="true"
							className="absolute -top-[var(--spacing-1)] h-[calc(var(--spacing-3)+var(--spacing-2))] w-[2px] -translate-x-1/2 rounded-[var(--radius-full)] bg-[var(--color-text-secondary)]"
							style={{ left: `${floorAt}%` }}
						/>
					) : null}
				</span>
				<span className="flex justify-between gap-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]">
					<span>{floor !== null ? t("me.quota.floorMark", { amount: formatQuota(floor, locale) }) : null}</span>
					<span className="tabular-nums">
						{t("me.quota.remainingPercent", { percent: Math.round(main.remainingPercent) })}
					</span>
				</span>
			</button>
			<div className="grid grid-cols-4 gap-[var(--spacing-2)]">
				{POOL_ORDER.filter((pool) => pool !== "main" && pool in quota.pools).map((pool) => (
					<button
						key={pool}
						type="button"
						aria-label={t("me.quota.openPool", { pool: t(`me.quota.pools.${pool}`) })}
						onClick={() => onOpenPool(pool)}
						className="flex min-w-0 flex-col gap-[var(--spacing-1)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-3)] text-start hover:bg-[var(--color-bg-subtle-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
					>
						<span className="truncate text-caption text-[var(--color-text-secondary)]">
							{t(`me.quota.pools.${pool}`)}
						</span>
						<span className="text-h3 font-semibold text-[var(--color-text-primary)]">
							{formatQuota(quota.pools[pool].remaining, locale)}
						</span>
						<PoolMeter pool={pool} percent={quota.pools[pool].remainingPercent} />
						<span className="line-clamp-2 text-micro text-[var(--color-text-tertiary)]">
							{poolRule(pool, quota, t)}
						</span>
					</button>
				))}
			</div>
			<UnitNote />
		</div>
	);
}

/** What one million quota buys, from the published rate card; the yuan alone when it has not loaded. */
function UnitNote() {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const rates = useQuotaRates();
	if (!rates.data) return null;
	const yuan = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(1_000_000 / rates.data.quotaPerYuan);
	const baseline = rates.data.items.find((item) => item.name === rates.data.baseline);
	return (
		<p className="px-[var(--spacing-1)] text-caption text-[var(--color-text-tertiary)]">
			{baseline && baseline.input > 0
				? t("me.quota.unitNoteTokens", {
						yuan,
						name: baseline.name,
						tokens: formatTokens(1_000_000 / baseline.input, locale),
					})
				: t("me.quota.unitNote", { yuan })}
		</p>
	);
}

import type { QuotaPool, UsageOverview } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { POOL_COLOR, POOL_ORDER } from "./quota-meters.tsx";
import { formatDay, formatQuota } from "./quota-number.tsx";

type Day = UsageOverview["daily"][number];

const dayTotal = (day: Day) => POOL_ORDER.reduce((sum, pool) => sum + (day.cost[pool] ?? 0), 0);

/**
 * Daily spending, one stacked column per day in the fixed pool order (main at the base). Two of the
 * four pool colours sit under 3:1 on the light surface, so values are never colour-alone: the
 * legend names every pool, the readout above the plot prints the hovered or focused day pool by
 * pool, and a table view carries every number. Tapping a column opens that day's usage.
 */
export function QuotaChart({
	overview,
	pools = POOL_ORDER,
	onOpenDay,
}: {
	overview: UsageOverview;
	/** The pools drawn; a pool page draws only its own, in its own colour. */
	pools?: readonly QuotaPool[];
	onOpenDay: (date: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const [active, setActive] = useState<string | null>(null);
	const [table, setTable] = useState(false);
	const days = overview.daily;
	const total = (day: Day) => pools.reduce((sum, pool) => sum + (day.cost[pool] ?? 0), 0);
	const max = Math.max(0, ...days.map(total));
	const focused = days.find((day) => day.date === active);
	const rangeTotal = days.reduce((sum, day) => sum + total(day), 0);
	if (max === 0)
		return (
			<p className="py-[var(--spacing-6)] text-center text-caption text-[var(--color-text-tertiary)]">
				{t("me.quota.chartEmpty")}
			</p>
		);
	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			<div className="flex min-h-[var(--spacing-12)] items-start justify-between gap-[var(--spacing-3)]">
				<Readout day={focused} pools={pools} total={rangeTotal} locale={locale} />
				<Button size="sm" variant="link" onClick={() => setTable(!table)} aria-pressed={table}>
					{table ? t("me.quota.chartBars") : t("me.quota.chartTable")}
				</Button>
			</div>
			{table ? (
				<DayTable days={days} pools={pools} locale={locale} onOpenDay={onOpenDay} />
			) : (
				<div className="pt-[var(--spacing-4)]">
					<div className="relative h-[calc(var(--spacing-16)*2)] border-b border-[var(--color-border)]">
						<span
							aria-hidden="true"
							className="absolute inset-x-0 top-0 border-t border-[var(--color-border-subtle)]"
						/>
						<span
							aria-hidden="true"
							className="absolute top-0 left-0 -translate-y-full pb-[2px] text-micro tabular-nums text-[var(--color-text-tertiary)]"
						>
							{formatQuota(max, locale)}
						</span>
						<div className="absolute inset-0 flex items-stretch">
							{days.map((day) => {
								const value = total(day);
								const parts = pools.filter((pool) => (day.cost[pool] ?? 0) > 0);
								return (
									<button
										key={day.date}
										type="button"
										disabled={value === 0}
										aria-label={t("me.quota.chartBar", {
											date: formatDay(day.date, locale),
											total: formatQuota(value, locale),
										})}
										onPointerEnter={() => setActive(day.date)}
										onPointerLeave={() => setActive(null)}
										onFocus={() => setActive(day.date)}
										onBlur={() => setActive(null)}
										onClick={() => onOpenDay(day.date)}
										className={`group flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-[2px] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${active === day.date ? "bg-[var(--color-bg-hover)]" : ""}`}
									>
										{parts.map((pool, index) => (
											<span
												key={pool}
												className={`block w-[min(24px,70%)] shrink-0 ${index === parts.length - 1 ? "rounded-t-[var(--radius-xs)]" : ""}`}
												style={{
													height: `calc(${((day.cost[pool] ?? 0) / max) * 100}% - 2px)`,
													minHeight: "2px",
													background: POOL_COLOR[pool],
												}}
											/>
										))}
									</button>
								);
							})}
						</div>
					</div>
					<div
						aria-hidden="true"
						className="flex justify-between pt-[var(--spacing-1)] text-micro text-[var(--color-text-tertiary)]"
					>
						<span>{days[0] ? formatDay(days[0].date, locale) : null}</span>
						<span>{days.at(-1) ? formatDay(days.at(-1)?.date ?? "", locale) : null}</span>
					</div>
				</div>
			)}
			{pools.length > 1 ? (
				<ul className="flex flex-wrap gap-x-[var(--spacing-4)] gap-y-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]">
					{pools.map((pool) => (
						<li key={pool} className="flex items-center gap-[var(--spacing-1)]">
							<span
								aria-hidden="true"
								className="size-[var(--spacing-2)] rounded-[var(--radius-xs)]"
								style={{ background: POOL_COLOR[pool] }}
							/>
							{t(`me.quota.pools.${pool}`)}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** The hovered or focused day pool by pool, or the range total when nothing is under the pointer. */
function Readout({
	day,
	pools,
	total,
	locale,
}: {
	day: Day | undefined;
	pools: readonly QuotaPool[];
	total: number;
	locale: string;
}) {
	const { t } = useTranslation();
	if (!day)
		return (
			<p className="text-body text-[var(--color-text-secondary)]">
				{t("me.quota.chartTotal", { amount: formatQuota(total, locale) })}
			</p>
		);
	return (
		<div aria-live="polite" className="min-w-0 text-caption text-[var(--color-text-secondary)]">
			<p className="text-body text-[var(--color-text-primary)]">
				{formatDay(day.date, locale, true)} ·{" "}
				{formatQuota(
					pools.reduce((sum, pool) => sum + (day.cost[pool] ?? 0), 0),
					locale,
				)}
			</p>
			{pools.length > 1 ? (
				<p className="flex flex-wrap gap-x-[var(--spacing-3)]">
					{pools
						.filter((pool) => (day.cost[pool] ?? 0) > 0)
						.map((pool) => (
							<span key={pool} className="tabular-nums">
								{t(`me.quota.pools.${pool}`)} {formatQuota(day.cost[pool] ?? 0, locale)}
							</span>
						))}
				</p>
			) : null}
		</div>
	);
}

/** The same figures as a table: the view for screen readers, print and anyone who wants numbers. */
function DayTable({
	days,
	pools,
	locale,
	onOpenDay,
}: {
	days: Day[];
	pools: readonly QuotaPool[];
	locale: string;
	onOpenDay: (date: string) => void;
}) {
	const { t } = useTranslation();
	const rows = days.filter((day) => dayTotal(day) > 0).reverse();
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-caption tabular-nums">
				<thead className="text-[var(--color-text-tertiary)]">
					<tr>
						<th scope="col" className="py-[var(--spacing-1)] text-start font-normal">
							{t("me.quota.chartDate")}
						</th>
						{pools.length > 1
							? pools.map((pool) => (
									<th key={pool} scope="col" className="py-[var(--spacing-1)] text-end font-normal">
										{t(`me.quota.pools.${pool}`)}
									</th>
								))
							: null}
						<th scope="col" className="py-[var(--spacing-1)] text-end font-normal">
							{t("me.quota.chartDayTotal")}
						</th>
					</tr>
				</thead>
				<tbody className="text-[var(--color-text-primary)]">
					{rows.map((day) => (
						<tr key={day.date} className="border-t border-dashed border-[var(--color-border)]">
							<th scope="row" className="py-[var(--spacing-2)] text-start font-normal">
								<button
									type="button"
									className="text-[var(--color-accent-text)] hover:underline"
									onClick={() => onOpenDay(day.date)}
								>
									{formatDay(day.date, locale, true)}
								</button>
							</th>
							{pools.length > 1
								? pools.map((pool) => (
										<td key={pool} className="py-[var(--spacing-2)] text-end">
											{(day.cost[pool] ?? 0) ? formatQuota(day.cost[pool] ?? 0, locale) : "–"}
										</td>
									))
								: null}
							<td className="py-[var(--spacing-2)] text-end">
								{formatQuota(
									pools.reduce((sum, pool) => sum + (day.cost[pool] ?? 0), 0),
									locale,
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

import type { QuotaPool, QuotaResponse } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatExact, QuotaNumber } from "./quota-number.tsx";

const POOL_ORDER: QuotaPool[] = ["main", "background", "coding", "external", "tools"];

/** A single horizontal bar; the main pool gets a large one, the others a short line each. */
function PoolBar({ percent, large = false }: { percent: number; large?: boolean }) {
	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(percent)}
			className={`w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-bg-subtle)] ${
				large ? "h-[var(--spacing-3)]" : "h-[var(--spacing-1)]"
			}`}
		>
			<div
				className="h-full rounded-[var(--radius-full)] bg-[var(--color-accent)]"
				style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
			/>
		</div>
	);
}

/**
 * The main pool as one large bar, the other three as one quiet line of percentages. Tapping the
 * line reveals the exact numbers and the rule each pool follows; nothing here is a marketing
 * claim, only the balance and the rule from the published catalog.
 */
export function QuotaPools({ quota }: { quota: QuotaResponse }) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const [expanded, setExpanded] = useState(false);
	const main = quota.pools.main;
	// A server from before the `tools` pool lists four pools; show the ones it sent.
	const shown = POOL_ORDER.filter((pool) => pool in quota.pools);
	const others = shown.filter((pool) => pool !== "main");
	const percent = (pool: QuotaPool) => `${Math.round(quota.pools[pool].remainingPercent)}%`;
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<div className="flex flex-col gap-[var(--spacing-2)]">
				<p className="text-caption text-[var(--color-text-secondary)]">{t("me.quota.pools.main")}</p>
				<p className="break-all text-display font-semibold tabular-nums text-[var(--color-text-primary)]">
					{formatExact(main.remaining, locale)}
				</p>
				<PoolBar percent={main.remainingPercent} large />
				<p className="text-end text-caption tabular-nums text-[var(--color-text-secondary)]">
					{Math.round(main.remainingPercent)}%
				</p>
			</div>
			<Button
				variant="link"
				onClick={() => setExpanded(!expanded)}
				className="justify-start text-caption"
				aria-expanded={expanded}
			>
				{others.map((pool) => `${t(`me.quota.pools.${pool}`)} ${percent(pool)}`).join(" · ")}
			</Button>
			{expanded ? (
				<ul className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
					{shown.map((pool) => (
						<li key={pool} className="flex flex-col gap-[var(--spacing-1)]">
							<div className="flex items-baseline justify-between gap-[var(--spacing-3)]">
								<span className="text-body text-[var(--color-text-primary)]">{t(`me.quota.pools.${pool}`)}</span>
								<span className="text-body tabular-nums text-[var(--color-text-primary)]">
									<QuotaNumber value={quota.pools[pool].remaining} locale={locale} />
								</span>
							</div>
							<p className="text-caption text-[var(--color-text-secondary)]">
								{t("me.quota.poolDetail", {
									granted: formatExact(quota.pools[pool].granted, locale),
									used: formatExact(quota.pools[pool].used, locale),
								})}
								{quota.overflow[pool].overflow
									? ` · ${t("me.quota.poolOverflow", { rate: quota.overflow[pool].rate })}`
									: ` · ${t("me.quota.poolNoOverflow")}`}
								{quota.overflow[pool].floor === null
									? ""
									: ` · ${t("me.quota.poolFloor", { amount: formatExact(quota.overflow[pool].floor, locale) })}`}
							</p>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

import type { QuotaPool, QuotaResponse } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { ChartColumn, Gift } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface QuotaLowBannerProps {
	quota: QuotaResponse;
	/** Opens 邀请好友得额度. */
	onOpenInvite: () => void;
	/** Opens the usage list on the quota page. */
	onOpenUsage: () => void;
}

const POOL_ORDER: QuotaPool[] = ["main", "background", "coding", "external", "tools"];

/**
 * Which balance is actually stopping a reply. The main pool answers for itself. Another pool
 * counts only once its own grant is gone and it can no longer draw on main, because the floor is
 * what stops that draw — an empty background pool above the floor still runs. `external` is left
 * out on purpose: it pays for other people talking to this account's Bot, so its exhaustion never
 * blocks the account's own chat.
 */
export function exhaustedPools(quota: QuotaResponse): QuotaPool[] {
	if (quota.pools.main.remaining <= 0) return ["main"];
	return POOL_ORDER.filter((pool) => pool in quota.pools).filter((pool) => {
		if (pool === "main" || pool === "external" || quota.pools[pool].remaining > 0) return false;
		const rule = quota.overflow[pool];
		if (!rule.overflow) return true;
		return rule.floor !== null && quota.pools.main.remaining <= rule.floor;
	});
}

/**
 * A chat banner that names the balance that ran out and the date the monthly grant returns, with
 * the two things a reader can do today: invite someone, or look at what spent it. There is no
 * purchase button until there is something to buy (额度方案 第九节).
 */
export function QuotaLowBanner({ quota, onOpenInvite, onOpenUsage }: QuotaLowBannerProps) {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const pools = exhaustedPools(quota);
	if (pools.length === 0) return null;
	const reset = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(quota.cycle.resetsAt));
	const labels = new Intl.ListFormat(locale, { type: "conjunction" }).format(
		pools.map((pool) => t(`me.quota.pools.${pool}`)),
	);
	return (
		<section
			role="status"
			className="flex flex-wrap items-center gap-x-[var(--spacing-3)] gap-y-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]"
		>
			<p className="min-w-0 flex-1">
				<span className="text-[var(--color-text-primary)]">{t("me.quota.bannerUsedUp", { pools: labels })}</span>
				{" · "}
				{t("me.quota.bannerResets", { date: reset })}
			</p>
			<div className="flex shrink-0 items-center gap-[var(--spacing-1)]">
				<Button size="sm" variant="link" onClick={onOpenInvite}>
					<Gift size={16} aria-hidden="true" />
					{t("me.quota.bannerInvite")}
				</Button>
				<Button size="sm" variant="link" onClick={onOpenUsage}>
					<ChartColumn size={16} aria-hidden="true" />
					{t("me.quota.bannerUsage")}
				</Button>
			</div>
		</section>
	);
}

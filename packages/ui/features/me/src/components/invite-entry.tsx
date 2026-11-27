import { cn } from "@yonder/ui-components";
import { useInvite } from "@yonder/ui-data";
import { ChevronRight, Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatExact, formatQuota } from "./quota-number.tsx";

/** What one more invitation earns, or null once there is nothing left to earn. */
function useOpenReward(): { amount: string; remaining: number | null } | null {
	const { i18n } = useTranslation();
	const { data } = useInvite();
	if (!data || data.rewardRule.inviterGets <= 0 || data.activation?.remaining === 0) return null;
	const { maxInvites } = data.rewardRule;
	if (maxInvites !== null && data.stats.invitedCount >= maxInvites) return null;
	return {
		amount: formatQuota(data.rewardRule.inviterGets, i18n.resolvedLanguage ?? i18n.language),
		remaining: data.activation?.remaining ?? null,
	};
}

/** The desktop rail's way into the invitation page, right above settings; the badge is the reward. */
export function InviteRailButton({ section, onOpen }: { section: string | null; onOpen: (path: string) => void }) {
	const { t } = useTranslation();
	const current = section === "invite";
	const reward = useOpenReward();
	const label = reward ? t("inviteExperience.railLabel", { amount: reward.amount }) : t("inviteExperience.title");
	return (
		<button
			type="button"
			onClick={() => onOpen("/me/invite")}
			aria-label={label}
			title={label}
			aria-current={current ? "page" : undefined}
			className={cn(
				"relative flex size-[var(--control-md)] items-center justify-center rounded-[var(--radius-control)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
				current
					? "bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
					: "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
			)}
		>
			<Gift className="icon-scaled" size={20} strokeWidth={1.7} aria-hidden="true" />
			{reward ? (
				<span
					aria-hidden="true"
					className="absolute -end-[var(--spacing-3)] -top-[var(--spacing-1)] rounded-[var(--radius-full)] bg-[var(--color-warning)] px-[var(--spacing-1)] text-[length:var(--text-micro)] font-semibold leading-[1.45] tabular-nums text-[var(--color-on-accent)] shadow-[var(--shadow-xs)]"
				>
					+{reward.amount}
				</span>
			) : null}
		</button>
	);
}

/** The phone's way in: an accent card right under the profile card in 「我」. */
export function InviteEntryCard({ selected, onOpen }: { selected: boolean; onOpen: () => void }) {
	const { t, i18n } = useTranslation();
	const reward = useOpenReward();
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-current={selected ? "true" : undefined}
			className="flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-accent)] p-[var(--spacing-4)] text-start text-[var(--color-on-accent)] shadow-[var(--shadow-xs)] transition-transform duration-[var(--duration-fast)] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
		>
			<span className="flex size-[var(--control-md)] shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-on-accent)_18%,transparent)]">
				<Gift size={18} strokeWidth={1.9} aria-hidden="true" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-body font-semibold">{t("inviteExperience.entryTitle")}</span>
				<span className="truncate text-caption opacity-85">
					{reward?.remaining != null
						? t("inviteExperience.activationRemaining", {
								remaining: formatExact(reward.remaining, i18n.resolvedLanguage ?? i18n.language),
							})
						: t("inviteExperience.tagline")}
				</span>
			</span>
			{reward ? (
				<span className="shrink-0 rounded-[var(--radius-full)] bg-[color-mix(in_srgb,var(--color-on-accent)_18%,transparent)] px-[var(--spacing-2)] py-[var(--spacing-hair)] text-caption font-semibold tabular-nums">
					{t("inviteExperience.reward", { amount: reward.amount })}
				</span>
			) : null}
			<ChevronRight size={16} aria-hidden="true" className="shrink-0 opacity-80" />
		</button>
	);
}

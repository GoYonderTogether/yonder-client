import { cn } from "@yonder/ui-components";
import { Check, UserRoundPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

const LINE = "h-[2px] flex-1 rounded-full";

/**
 * One node per invitation spot, filled once that friend has joined; each node carries what the
 * inviter receives for it. It replaces the separate count, remaining, reward and arrow lines.
 */
export function InviteTrack({ spots, joined, reward }: { spots: number; joined: number; reward: string }) {
	const { t } = useTranslation();
	const filled = Math.min(joined, spots);
	return (
		<ol aria-label={t("inviteExperience.track")} className="flex w-full">
			{Array.from({ length: spots }, (_, index) => {
				const done = index < filled;
				return (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: spots are positions, not records
						key={index}
						aria-label={t(done ? "inviteExperience.nodeJoined" : "inviteExperience.nodeOpen", {
							index: index + 1,
							amount: reward,
						})}
						className="flex min-w-0 flex-1 flex-col items-center gap-[var(--spacing-1)]"
					>
						<span
							aria-hidden="true"
							className={cn(
								"text-micro font-medium tabular-nums",
								done ? "text-[var(--color-accent-text)]" : "text-[var(--color-text-secondary)]",
							)}
						>
							+{reward}
						</span>
						<span aria-hidden="true" className="flex w-full items-center">
							<span
								className={cn(
									LINE,
									index === 0 && "invisible",
									done ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
								)}
							/>
							<span
								className={cn(
									"flex size-[var(--control-sm)] shrink-0 items-center justify-center rounded-full",
									done
										? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
										: "border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)]",
								)}
							>
								{done ? <Check size={15} strokeWidth={2.4} /> : <UserRoundPlus size={15} strokeWidth={1.8} />}
							</span>
							<span
								className={cn(
									LINE,
									index === spots - 1 && "invisible",
									index + 1 < filled ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]",
								)}
							/>
						</span>
					</li>
				);
			})}
		</ol>
	);
}

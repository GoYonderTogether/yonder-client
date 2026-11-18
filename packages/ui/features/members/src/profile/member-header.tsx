import type { MemberCard } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

export interface MemberHeaderProps {
	/** The four things a card shows, for a person and for a Bot alike (19 第四节). */
	card: MemberCard;
	/** `onOpenOwner` makes the owner line tappable; without it the line is plain text. */
	onOpenOwner?: ((handle: string) => void) | undefined;
}

/**
 * Who this is: avatar, name, public handle and, when there is one, the bio (17 第一节). Read only —
 * every action on a profile is the one button below it, so nothing here is a control except the
 * owner line of a Bot, which opens the person behind it.
 */
export function MemberHeader({ card, onOpenOwner }: MemberHeaderProps) {
	const { t } = useTranslation();
	const owner = card.owner;
	return (
		<div className="flex flex-col items-center gap-[var(--spacing-3)] px-[var(--spacing-5)] pt-[var(--spacing-6)] pb-[var(--spacing-4)]">
			<Avatar name={card.displayName} src={card.avatarUrl} color={card.avatarColor} kind={card.kind} size={80} />
			<div className="flex min-w-0 flex-col items-center gap-[var(--spacing-1)]">
				<h1 className="max-w-full truncate text-h2 text-[var(--color-text-primary)]">{card.displayName}</h1>
				<p className="tabular-nums text-caption text-[var(--color-text-secondary)]">@{card.handle}</p>
				{owner ? (
					onOpenOwner ? (
						<button
							type="button"
							onClick={() => onOpenOwner(owner.handle)}
							className="-mx-[var(--spacing-2)] rounded-[var(--radius-sm)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-caption text-[var(--color-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
						>
							{t("members.botOf", { name: owner.displayName })}
						</button>
					) : (
						<p className="text-caption text-[var(--color-text-secondary)]">
							{t("members.botOf", { name: owner.displayName })}
						</p>
					)
				) : null}
				{card.bio ? (
					<p className="mt-[var(--spacing-2)] max-w-full whitespace-pre-wrap text-body text-[var(--color-text-secondary)]">
						{card.bio}
					</p>
				) : null}
			</div>
		</div>
	);
}

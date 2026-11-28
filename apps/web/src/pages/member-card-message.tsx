import { Avatar } from "@yonder/ui-components";
import { useMemberProfile } from "@yonder/ui-data";
import { useOptionalSidePanel } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

/**
 * A member's namecard sent into a chat. The message stores only the handle, so the card is read
 * again for whoever looks at it: a closed switch, an edited card or a closed account shows here
 * the way it would on the card's own page. The face is the small card: who they are, one line of
 * facts, and nothing to decide. Tapping it opens the full card.
 */
export function MemberCardMessage({ handle }: { handle: string }) {
	const { t } = useTranslation();
	const profile = useMemberProfile(handle);
	const openMember = useOptionalSidePanel()?.openMember;
	const navigate = useNavigate();
	if (profile.isPending)
		return (
			<span role="status" className="text-caption text-[var(--color-text-secondary)]">
				{t("app.loading")}
			</span>
		);
	if (profile.isError || !profile.data)
		return <p className="text-caption text-[var(--color-text-secondary)]">{t("notFound.title")}</p>;
	const { card } = profile.data;
	const facts = [card.namecard?.city, ...(card.namecard?.projects ?? []).slice(0, 3)].filter(
		(value): value is string => typeof value === "string" && value !== "",
	);
	const open = () => {
		if (openMember) openMember(card.handle, card.displayName);
		else navigate(`/@${encodeURIComponent(card.handle)}`);
	};
	return (
		<button
			type="button"
			aria-label={t("members.openOwner", { name: card.displayName })}
			onClick={open}
			className="flex w-full max-w-[var(--width-form)] items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-[var(--card-padding)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<Avatar name={card.displayName} src={card.avatarUrl} color={card.avatarColor} kind={card.kind} size={48} />
			<span className="flex min-w-0 flex-1 flex-col gap-[var(--spacing-1)]">
				<span className="truncate text-body font-semibold text-[var(--color-text-primary)]">{card.displayName}</span>
				<span className="tabular-nums text-caption text-[var(--color-text-secondary)]">@{card.handle}</span>
				{card.bio ? <span className="truncate text-caption text-[var(--color-text-secondary)]">{card.bio}</span> : null}
				{facts.length ? (
					<span className="truncate text-caption text-[var(--color-text-tertiary)]">{facts.join(" · ")}</span>
				) : null}
			</span>
		</button>
	);
}

import type { MemberKind } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * What a row draws. Deliberately not tied to one type: a `Member` and a `ConversationMember` both
 * satisfy it, and the row never needs an id — the caller owns the key and any selection.
 */
export interface MemberRowMember {
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null | undefined;
}

export interface MemberRowProps {
	member: MemberRowMember;
	/**
	 * A Bot's row names its owner, so a stranger can judge who is behind it (17 3.3). Absent when the
	 * card did not give an owner — a Bot whose owner's card this viewer may not see.
	 */
	ownerName?: string | null | undefined;
	/** An extra line under the name, e.g. the subtitle of a search result. */
	subtitle?: ReactNode;
	/** A small mark on the row, such as 「我的 Bot」. */
	badge?: ReactNode;
	/** Opens the member's card. Without it the row is plain text. */
	onOpen?: (() => void) | undefined;
	/** Actions for the owner (remove, transfer); they sit beside the row's button, never inside it. */
	actions?: ReactNode;
}

/**
 * One member: avatar, name, and what tells two people with the same name apart — a Bot's owner, a
 * person's public handle. Used by the member list, the add-members picker and the group page.
 * Lives inside a `ListGroup` (`<ul>`): it renders the `<li>`.
 */
export function MemberRow({ member, ownerName, subtitle, badge, onOpen, actions }: MemberRowProps) {
	const { t } = useTranslation();
	const line = ownerName
		? t("members.botOf", { name: ownerName })
		: (subtitle ?? <span className="tabular-nums">@{member.handle}</span>);
	const body = (
		<>
			<Avatar
				name={member.displayName}
				src={member.avatarUrl}
				color={member.avatarColor}
				kind={member.kind}
				size={40}
			/>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-center gap-[var(--spacing-2)]">
					<span className="truncate text-body text-[var(--color-text-primary)]">{member.displayName}</span>
					{badge ? (
						<span className="shrink-0 rounded-[var(--radius-xs)] bg-[var(--color-bg-subtle)] px-[var(--spacing-1)] text-micro text-[var(--color-text-secondary)]">
							{badge}
						</span>
					) : null}
				</span>
				<span className="truncate text-caption text-[var(--color-text-tertiary)]">{line}</span>
			</span>
		</>
	);
	return (
		<li className="group/row relative flex items-center">
			{onOpen ? (
				<button
					type="button"
					onClick={onOpen}
					className="flex min-h-[var(--row-height)] min-w-0 flex-1 items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-start transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
				>
					{body}
				</button>
			) : (
				<div className="flex min-h-[var(--row-height)] min-w-0 flex-1 items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)]">
					{body}
				</div>
			)}
			{actions ? <span className="flex shrink-0 items-center pe-[var(--spacing-2)]">{actions}</span> : null}
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}

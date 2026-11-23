import { canRemoveMember } from "@yonder/chat-model";
import type { ConversationMember } from "@yonder/protocol";
import { Button, IconButton, ListGroup } from "@yonder/ui-components";
import { UserMinus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MemberRow } from "../profile/member-row.tsx";

export interface MemberListProps {
	members: readonly ConversationMember[];
	/** The reader's own member id, so the list can mark them and never offer to remove them. */
	personId?: string | undefined;
	/** The group owner's id; only they get per-row actions (19 第三节). */
	ownerId?: string | undefined;
	/** Opens a member's card. */
	onOpen?: ((member: ConversationMember) => void) | undefined;
	/** Remove someone: anyone for the owner, only their own Bot for a member. The caller confirms first. */
	onRemove?: ((member: ConversationMember) => void) | undefined;
	/** Owner only: hand the group to a person. */
	onTransfer?: ((member: ConversationMember) => void) | undefined;
	/** Disables the actions while one of them is in flight. */
	busy?: boolean | undefined;
}

/**
 * Everyone in the group (17 3.3): people first, then Bots, so the two kinds are never mixed while
 * scanning. Only `owner` and `member` exist among the people here; any future role that is neither
 * is not something this list invents an action for.
 */
export function MemberList({
	members,
	personId,
	ownerId,
	onOpen,
	onRemove,
	onTransfer,
	busy = false,
}: MemberListProps) {
	const { t } = useTranslation();
	const rank = (member: ConversationMember) => (member.kind === "person" ? 0 : 1);
	const ordered = [...members].sort((left, right) => rank(left) - rank(right));
	const isOwner = Boolean(ownerId) && personId === ownerId;

	return (
		<ListGroup>
			{ordered.map((member) => {
				const self = member.memberId === personId;
				const bot = member.kind === "bot";
				const removable = canRemoveMember(ownerId ? { ownerId } : {}, personId, member);
				const badge = [member.memberId === ownerId && t("members.group.owner"), self && t("members.group.you")]
					.filter(Boolean)
					.join(" · ");
				return (
					<MemberRow
						key={member.memberId}
						member={member}
						badge={badge}
						onOpen={onOpen ? () => onOpen(member) : undefined}
						actions={
							!self && (isOwner || removable) ? (
								<>
									{isOwner && !bot && onTransfer ? (
										<Button
											size="sm"
											variant="ghost"
											disabled={busy}
											onClick={() => onTransfer(member)}
											aria-label={t("members.group.transferMember", { name: member.displayName })}
										>
											{t("members.group.transfer")}
										</Button>
									) : null}
									{removable && onRemove ? (
										<IconButton
											size="sm"
											aria-label={t("members.group.removeMember", { name: member.displayName })}
											disabled={busy}
											onClick={() => onRemove(member)}
										>
											<UserMinus size={16} aria-hidden />
										</IconButton>
									) : null}
								</>
							) : null
						}
					/>
				);
			})}
		</ListGroup>
	);
}

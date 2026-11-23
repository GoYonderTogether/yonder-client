import type { Conversation } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { Bot, LogOut, Trash2, UserPlus, UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The group's management rows. A member who is not the owner gets exactly one: bringing in one of
 * their own Bots (`addOwnBots`). Everything else here is the owner's.
 */
export function GroupActions({
	conversation,
	busy,
	owner,
	onAddMembers,
	onTransfer,
	onBotSettings,
}: {
	conversation: Conversation;
	busy: boolean;
	owner: boolean;
	onAddMembers: () => void;
	onTransfer: () => void;
	onBotSettings: () => void;
}) {
	const { t } = useTranslation();
	const canTransfer = conversation.members.some(
		(member) => member.kind === "person" && member.memberId !== conversation.ownerId,
	);
	return (
		<ListGroup title={t("members.group.manage")}>
			<ListRow
				leading={<UserPlus size={18} aria-hidden />}
				title={t(owner ? "members.group.addMembers" : "members.group.addOwnBot")}
				onClick={onAddMembers}
				disabled={busy}
			/>
			{owner && canTransfer ? (
				<ListRow
					leading={<UserRoundCheck size={18} aria-hidden />}
					title={t("members.group.transfer")}
					onClick={onTransfer}
					disabled={busy}
				/>
			) : null}
			{owner && conversation.groupBotPayer !== undefined ? (
				<ListRow
					leading={<Bot size={18} aria-hidden />}
					title={t("members.group.botSettings")}
					chevron
					onClick={onBotSettings}
					disabled={busy}
				/>
			) : null}
		</ListGroup>
	);
}

export function GroupExit({ owner, busy, onClick }: { owner: boolean; busy: boolean; onClick: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="mt-auto">
			<ListGroup>
				<ListRow
					leading={owner ? <Trash2 size={18} aria-hidden /> : <LogOut size={18} aria-hidden />}
					title={t(owner ? "members.group.dissolve" : "members.group.leave")}
					tone="danger"
					disabled={busy}
					onClick={onClick}
				/>
			</ListGroup>
		</div>
	);
}

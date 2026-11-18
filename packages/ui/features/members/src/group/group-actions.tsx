import type { Conversation } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { Bot, LogOut, Trash2, UserPlus, UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export function GroupActions({
	conversation,
	busy,
	onAddMembers,
	onTransfer,
	onBotSettings,
}: {
	conversation: Conversation;
	busy: boolean;
	onAddMembers: () => void;
	onTransfer: () => void;
	onBotSettings: () => void;
}) {
	const { t } = useTranslation();
	const canTransfer = conversation.members.some(
		(member) => member.kind === "person" && member.memberId !== conversation.ownerId,
	);
	return (
		<ListGroup>
			<ListRow
				leading={<UserPlus size={18} aria-hidden />}
				title={t("members.group.addMembers")}
				onClick={onAddMembers}
				disabled={busy}
			/>
			{canTransfer ? (
				<ListRow
					leading={<UserRoundCheck size={18} aria-hidden />}
					title={t("members.group.transfer")}
					onClick={onTransfer}
					disabled={busy}
				/>
			) : null}
			{conversation.groupBotPayer !== undefined ? (
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
		<ListGroup className="mt-auto">
			<ListRow
				leading={owner ? <Trash2 size={18} aria-hidden /> : <LogOut size={18} aria-hidden />}
				title={t(owner ? "members.group.dissolve" : "members.group.leave")}
				tone="danger"
				disabled={busy}
				onClick={onClick}
			/>
		</ListGroup>
	);
}

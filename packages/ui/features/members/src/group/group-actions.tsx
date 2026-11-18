import type { Conversation } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { LogOut, Trash2, UserPlus, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface GroupActionsProps {
	conversation: Conversation;
	owner: boolean;
	/** A closed group is read only, so it offers nothing here at all (19 3.2). */
	closed: boolean;
	busy: boolean;
	onAddMembers: () => void;
	onTransfer: () => void;
	onDissolve: () => void;
	onLeave: () => void;
}

function Entry({
	icon,
	title,
	tone = "default",
	onClick,
	disabled,
}: {
	icon: ReactNode;
	title: string;
	tone?: "default" | "danger";
	onClick: () => void;
	disabled: boolean;
}) {
	return (
		<ListRow
			leading={<span aria-hidden>{icon}</span>}
			title={title}
			tone={tone}
			onClick={onClick}
			disabled={disabled}
		/>
	);
}

/**
 * The group's actions, one row each. The owner sees what an owner can do and never "leave"; everyone
 * else sees only leaving. Nothing here is destructive without a confirmation in `GroupInfo`.
 */
export function GroupActions({
	conversation,
	owner,
	closed,
	busy,
	onAddMembers,
	onTransfer,
	onDissolve,
	onLeave,
}: GroupActionsProps) {
	const { t } = useTranslation();
	if (closed) return null;
	const people = conversation.members.some(
		(member) => member.kind === "person" && member.memberId !== conversation.ownerId,
	);
	return (
		<ListGroup>
			{owner ? (
				<>
					<Entry
						icon={<UserPlus size={18} />}
						title={t("members.group.addMembers")}
						onClick={onAddMembers}
						disabled={busy}
					/>
					{people ? (
						<Entry
							icon={<UserRoundCheck size={18} />}
							title={t("members.group.transfer")}
							onClick={onTransfer}
							disabled={busy}
						/>
					) : null}
					<Entry
						icon={<Trash2 size={18} />}
						title={t("members.group.dissolve")}
						tone="danger"
						onClick={onDissolve}
						disabled={busy}
					/>
				</>
			) : (
				<Entry
					icon={<LogOut size={18} />}
					title={t("members.group.leave")}
					tone="danger"
					onClick={onLeave}
					disabled={busy}
				/>
			)}
		</ListGroup>
	);
}

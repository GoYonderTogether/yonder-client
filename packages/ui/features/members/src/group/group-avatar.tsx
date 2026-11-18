import type { ConversationMember } from "@yonder/protocol";
import { Avatar, IconTile } from "@yonder/ui-components";
import { UsersRound } from "lucide-react";

export function GroupAvatar({ members }: { members: readonly ConversationMember[] }) {
	if (!members.length)
		return (
			<IconTile>
				<UsersRound size={18} />
			</IconTile>
		);
	return (
		<span
			aria-hidden
			className="grid size-[var(--spacing-10)] shrink-0 grid-cols-2 place-items-center gap-[var(--spacing-1)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-1)]"
		>
			{members.slice(0, 4).map((member) => (
				<Avatar
					key={member.memberId}
					name={member.displayName}
					src={member.avatarUrl}
					kind={member.kind}
					color={member.avatarColor}
					size={16}
				/>
			))}
		</span>
	);
}

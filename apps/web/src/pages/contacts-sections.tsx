import { GroupAvatar } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

import { conversationTitle } from "./conversation-presentation.tsx";

export interface ContactSections {
	/** Bots the signed-in person created. */
	bots: Member[];
	/** Real people saved as friends. */
	friends: Member[];
	/** Open group chats the person belongs to. */
	groups: Conversation[];
}

export function splitContacts(
	members: readonly Member[] | undefined,
	conversations: readonly Conversation[] | undefined,
	personId: string | undefined,
): ContactSections {
	return {
		bots:
			members?.filter((member) => member.kind === "bot" && member.ownerId !== null && member.ownerId === personId) ??
			[],
		friends: members?.filter((member) => member.kind === "person") ?? [],
		groups: conversations?.filter((conversation) => conversation.kind === "group" && !conversation.closedReason) ?? [],
	};
}

export function GroupRows({
	groups,
	personId,
	onOpen,
}: {
	groups: readonly Conversation[];
	personId: string | undefined;
	onOpen: (conversationId: string) => void;
}) {
	const { t } = useTranslation();
	if (groups.length === 0) return null;
	return (
		<ListGroup title={t("chatActions.contactsGroups")}>
			{groups.map((group) => (
				<ListRow
					key={group.id}
					leading={<GroupAvatar members={group.members} />}
					title={conversationTitle(group, personId)}
					onClick={() => onOpen(group.id)}
				/>
			))}
		</ListGroup>
	);
}

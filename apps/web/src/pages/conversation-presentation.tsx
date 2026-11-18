import { conversationPeer } from "@yonder/chat-model";
import { GroupAvatar } from "@yonder/feature-members";
import type { Conversation } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";

export { conversationPeer };

export function primaryConversation(items: Conversation[] | undefined, botId: string | undefined) {
	return (
		items?.find((item) => item.isPrimary) ??
		items?.find((item) => item.kind === "direct" && item.members.some((member) => member.memberId === botId))
	);
}

export function selectedConversation(
	items: Conversation[] | undefined,
	selection: string | null,
	botId: string | undefined,
) {
	return selection && selection !== MAIN_CONVERSATION
		? items?.find((item) => item.id === selection)
		: primaryConversation(items, botId);
}

export function conversationTitle(conversation: Conversation, personId: string | undefined) {
	return (
		conversation.title ??
		(conversation.kind === "group"
			? conversation.members
					.filter((member) => member.memberId !== personId)
					.map((member) => member.displayName)
					.join("、")
			: conversationPeer(conversation, personId)?.displayName) ??
		""
	);
}

export function ConversationAvatar({
	conversation,
	personId,
}: {
	conversation: Conversation;
	personId: string | undefined;
}) {
	const peer = conversationPeer(conversation, personId);
	if (conversation.kind !== "group")
		return (
			<Avatar
				name={peer?.displayName ?? ""}
				src={peer?.avatarUrl}
				color={peer?.avatarColor}
				kind={peer?.kind}
				size={40}
			/>
		);
	return <GroupAvatar members={conversation.members} />;
}

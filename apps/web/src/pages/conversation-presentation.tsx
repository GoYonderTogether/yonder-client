import { conversationPeer, visitAvatarOverlay } from "@yonder/chat-model";
import { GroupAvatar } from "@yonder/feature-members";
import type { Conversation } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { Bell } from "lucide-react";

export { conversationPeer };

export function primaryConversation(items: Conversation[] | undefined, botId: string | undefined) {
	return (
		items?.find((item) => item.isPrimary) ??
		items?.find(
			(item) => !item.visit && item.kind === "direct" && item.members.some((member) => member.memberId === botId),
		)
	);
}

export function messageListUnread(items: Conversation[] | undefined, primaryId: string | undefined, phone: boolean) {
	return (items ?? []).reduce((total, item) => {
		if (item.hiddenFromMessages || item.visit?.role === "host" || (phone && (item.id === primaryId || item.muted)))
			return total;
		return total + (item.unreadCount ?? 0);
	}, 0);
}

export function selectedConversation(
	items: Conversation[] | undefined,
	selection: string | null,
	botId: string | undefined,
	incomingOnly = false,
) {
	if (incomingOnly) return items?.find((item) => item.id === selection && item.visit?.role === "host");
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
	const overlay = visitAvatarOverlay(conversation, personId);
	return (
		<span
			data-conversation-avatar-slot
			aria-hidden="true"
			className="relative grid size-[var(--spacing-10)] shrink-0 place-items-center"
		>
			{conversation.kind === "system" ? (
				<span className="grid size-full place-items-center rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">
					<Bell size={24} />
				</span>
			) : conversation.kind === "group" ? (
				<GroupAvatar members={conversation.members} />
			) : (
				<Avatar
					name={peer?.displayName ?? ""}
					src={peer?.avatarUrl}
					color={peer?.avatarColor}
					kind={peer?.kind}
					size={40}
				/>
			)}
			{overlay ? (
				<span
					data-visit-avatar-overlay
					className="absolute -bottom-[var(--spacing-hair)] -end-[var(--spacing-hair)] flex rounded-[var(--radius-full)] bg-[var(--color-bg-page)] p-[var(--spacing-hair)]"
				>
					<Avatar
						name={overlay.displayName}
						src={overlay.avatarUrl}
						color={overlay.avatarColor}
						kind={overlay.kind}
						size={16}
					/>
				</span>
			) : null}
		</span>
	);
}

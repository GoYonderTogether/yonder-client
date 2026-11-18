import type { Conversation } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { Bell } from "lucide-react";

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

/**
 * The member a direct chat is *with*. A visit chat has three members — the visitor, someone
 * else's Bot and its owner watching — so "the first one who is not me" would show the Bot to the
 * visitor and the Bot to the host alike (19 第 2.4 节). The visit says who is who: the host talks
 * to the visitor, the visitor talks to the Bot.
 */
export function conversationPeer(conversation: Conversation, personId: string | undefined) {
	const visit = conversation.visit;
	if (visit && conversation.kind === "direct") {
		if (visit.role === "host")
			return conversation.members.find((member) => member.kind === "person" && member.memberId !== personId);
		return conversation.members.find((member) => member.memberId === visit.botId);
	}
	return conversation.members.find((member) => member.memberId !== personId);
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
	if (conversation.kind === "system") return <Bell size={24} aria-hidden="true" />;
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
	return (
		<span
			className="grid size-[var(--spacing-10)] shrink-0 grid-cols-2 place-items-center gap-[var(--spacing-1)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-1)]"
			aria-hidden="true"
		>
			{conversation.members.slice(0, 4).map((member) => (
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

/**
 * What an incoming realtime event does to a page's own copy of the data (08-前端缓存和同步
 * 第六节), the same three rules `packages/ui/data/src/realtime/events.ts` applies to the web
 * query cache. The mini program keeps page state rather than a cache, so they are functions over
 * an array: a member event replaces the copy every conversation embeds, a conversation event
 * drops the row, and a removed member leaves the lists still showing it.
 */
import type { Conversation, Member } from "@yonder/protocol";

/** `member.updated` carries the whole member, so no request is needed to rename what it embeds. */
export function patchConversation(conversation: Conversation, member: Member): Conversation {
	if (!conversation.members.some((item) => item.memberId === member.id)) return conversation;
	return {
		...conversation,
		members: conversation.members.map((item) =>
			item.memberId === member.id
				? {
						...item,
						displayName: member.displayName,
						handle: member.handle,
						avatarUrl: member.avatarUrl,
						avatarColor: member.avatarColor,
					}
				: item,
		),
	};
}

export function patchConversations(items: Conversation[], member: Member): Conversation[] {
	return items.map((item) => patchConversation(item, member));
}

/** `conversation.removed`: it left this account's list, so nothing of it is shown any more. */
export function removeConversation(items: Conversation[], conversationId: string): Conversation[] {
	return items.filter((item) => item.id !== conversationId);
}

/** `member.removed`: a deleted Bot no longer appears in a group's members. */
export function removeMemberFromConversations(items: Conversation[], memberId: string): Conversation[] {
	return items.map((item) =>
		item.members.some((member) => member.memberId === memberId)
			? { ...item, members: item.members.filter((member) => member.memberId !== memberId) }
			: item,
	);
}

/** The account's own default Bot first, then by name; the server's list order is not this one. */
export function sortOwnedBots(bots: Member[]): Member[] {
	return [...bots].sort(
		(left, right) =>
			Number(right.isDefault) - Number(left.isDefault) ||
			left.displayName.localeCompare(right.displayName) ||
			left.id.localeCompare(right.id),
	);
}

/** A changed Bot replaces its row; a Bot created on another device joins the list. */
export function upsertOwnedBot(bots: Member[], member: Member, meId: string): Member[] {
	if (member.kind !== "bot" || member.ownerId !== meId) return bots;
	return sortOwnedBots([...bots.filter((item) => item.id !== member.id), member]);
}

export function withoutMember(bots: Member[], memberId: string): Member[] {
	return bots.filter((item) => item.id !== memberId);
}

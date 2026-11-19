import type { Conversation, ConversationMember } from "@yonder/protocol";
import type { Locale } from "../../lib/i18n";

/**
 * Members this group actually shows. Only `owner` and `member` count: an observer belongs to the
 * visitor flow and is never a member of this group. A missing role is a member, so a conversation
 * read before the roles existed does not come back empty. Typed structurally so this file needs no
 * protocol change when the role union grows.
 */
export function groupMembers(members: readonly ConversationMember[]): ConversationMember[] {
	return members.filter((member: { role?: string }) => member.role !== "observer");
}

/** People first, then Bots; each part keeps the server's order (17 3.3). */
export function orderedMembers(members: readonly ConversationMember[]): ConversationMember[] {
	const visible = groupMembers(members);
	return [
		...visible.filter((member) => member.kind === "person"),
		...visible.filter((member) => member.kind === "bot"),
	];
}

export function isOwner(conversation: Conversation, ownId: string | undefined): boolean {
	if (!ownId) return false;
	return conversation.ownerId
		? conversation.ownerId === ownId
		: conversation.members.some((member) => member.memberId === ownId && member.role === "owner");
}

export function isClosed(conversation: Conversation): boolean {
	return Boolean(conversation.closedReason);
}

/** A removal is offered on everyone except me and the owner, and never in a closed group. */
export function canRemove(conversation: Conversation, ownId: string | undefined, member: ConversationMember): boolean {
	if (!isOwner(conversation, ownId) || isClosed(conversation)) return false;
	if (member.memberId === ownId || member.role === "owner") return false;
	return member.memberId !== conversation.ownerId;
}

/** Ownership passes to a person only (a Bot cannot own a group), never to me. */
export function canTransfer(
	conversation: Conversation,
	ownId: string | undefined,
	member: ConversationMember,
): boolean {
	return canRemove(conversation, ownId, member) && member.kind === "person";
}

/** Leaving is for members, not the owner, and only while the group is open. */
export function canLeave(conversation: Conversation, ownId: string | undefined): boolean {
	return Boolean(ownId) && !isClosed(conversation) && !isOwner(conversation, ownId);
}

export type RemoveCopy = { title: string; content: string; confirm: string };

export function removeCopy(name: string, locale: Locale): RemoveCopy {
	return locale === "zh-CN"
		? { title: "移出群聊", content: `将 ${name} 移出群聊？`, confirm: "移出" }
		: { title: "Remove from group", content: `Remove ${name} from the group?`, confirm: "Remove" };
}

export function transferCopy(name: string, locale: Locale): RemoveCopy {
	return locale === "zh-CN"
		? { title: "转让群主", content: `将群主转让给 ${name}？之后只有 TA 能管理这个群。`, confirm: "转让" }
		: {
				title: "Transfer ownership",
				content: `Make ${name} the group owner? Only they can manage the group afterwards.`,
				confirm: "Transfer",
			};
}

export function dissolveCopy(locale: Locale): RemoveCopy {
	return locale === "zh-CN"
		? { title: "解散群聊", content: "解散后所有成员都不能再发消息，聊天记录保留。确认解散？", confirm: "解散" }
		: {
				title: "Dissolve group",
				content: "Nobody can send messages afterwards. The chat history stays. Dissolve the group?",
				confirm: "Dissolve",
			};
}

export function leaveCopy(locale: Locale): RemoveCopy {
	return locale === "zh-CN"
		? { title: "退出群聊", content: "退出后这个群会从你的消息列表里消失。确认退出？", confirm: "退出" }
		: {
				title: "Leave group",
				content: "The group disappears from your message list. Leave it?",
				confirm: "Leave",
			};
}

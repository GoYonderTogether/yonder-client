import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { conversationPeer } from "./conversation-peer.ts";

/** Matches the server's active group member limit, including the owner. */
export const GROUP_MEMBER_LIMIT = 100;

export function addableContacts(contacts: readonly Member[], members: readonly ConversationMember[]): Member[] {
	const present = new Set(members.map((member) => member.memberId));
	return contacts.filter((member) => !present.has(member.id));
}

export function filterContacts(contacts: Member[], query: string): Member[] {
	const needle = query.toLocaleLowerCase();
	return needle
		? contacts.filter((member) => `${member.displayName} ${member.handle}`.toLocaleLowerCase().includes(needle))
		: contacts;
}

/** Conversations are pinned before they are sorted by date. This picker only uses actual chat activity. */
export function recentContacts(
	conversations: readonly Conversation[],
	eligible: ReadonlyMap<string, Member>,
	personId: string | undefined,
): Member[] {
	if (!personId) return [];
	const chats = conversations
		.filter((chat) => chat.kind === "direct" && chat.lastMessageAt)
		.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
	const contacts = chats.flatMap((chat) => {
		const peer = conversationPeer(chat, personId);
		return peer ? (eligible.get(peer.memberId) ?? []) : [];
	});
	return [...new Set(contacts)].slice(0, 5);
}

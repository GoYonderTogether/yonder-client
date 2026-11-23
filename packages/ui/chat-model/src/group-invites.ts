import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { conversationPeer } from "./conversation-peer.ts";

/** Matches the server's active group member limit, including the owner. */
export const GROUP_MEMBER_LIMIT = 100;

export function addableContacts(contacts: readonly Member[], members: readonly ConversationMember[]): Member[] {
	const present = new Set(members.map((member) => member.memberId));
	return contacts.filter((member) => !present.has(member.id));
}

/**
 * Whether this Bot is the viewer's own. The server names a Bot's owner on the member only when the
 * Bot belongs to someone else (`botOwner`), so a Bot without it is one of the viewer's own: there is
 * nothing to compare, and nothing the viewer could have been told about a stranger's Bot to mistake.
 */
export function isOwnBot(member: ConversationMember): boolean {
	return member.kind === "bot" && !member.botOwner;
}

/**
 * What the viewer may do about who is in the group. The group's owner adds anyone from their
 * contacts and removes anyone but themself. Any other member brings in and takes out only their own
 * Bots, which is the one say a member has over membership (服务端 groups.ts). A closed group allows
 * nothing, and a Bot is never removed by anyone but its owner or the group's owner.
 */
export function groupMemberRights(
	group: Pick<Conversation, "ownerId" | "closedReason">,
	viewerId: string | undefined,
): { addAnyone: boolean; addOwnBots: boolean } {
	if (!viewerId || group.closedReason) return { addAnyone: false, addOwnBots: false };
	const owner = Boolean(group.ownerId) && viewerId === group.ownerId;
	return { addAnyone: owner, addOwnBots: true };
}

/** The contacts a viewer may add to this group: everyone for the owner, only their own Bots otherwise. */
export function addableFor(
	group: Pick<Conversation, "ownerId" | "members" | "closedReason">,
	contacts: readonly Member[],
	viewerId: string | undefined,
): Member[] {
	const rights = groupMemberRights(group, viewerId);
	const open = addableContacts(contacts, group.members);
	if (rights.addAnyone) return open;
	return rights.addOwnBots ? open.filter((member) => member.kind === "bot" && member.ownerId === viewerId) : [];
}

/** Whether the viewer may take this member out: anyone for the group's owner, their own Bot for a member. */
export function canRemoveMember(
	group: Partial<Pick<Conversation, "ownerId" | "closedReason">>,
	viewerId: string | undefined,
	member: ConversationMember,
): boolean {
	if (!viewerId || group.closedReason || member.memberId === viewerId) return false;
	if (group.ownerId && viewerId === group.ownerId) return true;
	return isOwnBot(member);
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

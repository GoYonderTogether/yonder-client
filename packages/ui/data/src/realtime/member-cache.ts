/**
 * A member is repeated in four places: the profile (`me`), the contact list, each conversation's
 * header row, and the Bot the account answers with. A name or avatar change has to land in all of
 * them or the list keeps showing the old one until a refetch (15-Bot生命周期 第五节, 08 第六节).
 *
 * These are the only writers of that shape; the realtime events and the Bot hooks both call them.
 */
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { isNewChatHistoryCutoff } from "@yonder/chat-model";
import type { Conversation, Member, MeResponse, MessagePage } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import { discardMessageImages } from "./message-cache.ts";

type ConversationList = { items: Conversation[] };
type ContactList = { items: Member[] };

/** The conversation row embeds the name and picture; patch them where the member appears. */
function patchConversation(conversation: Conversation, member: Member): Conversation {
	if (!conversation.members.some((item) => item.memberId === member.id)) return conversation;
	return {
		...conversation,
		members: conversation.members.map((item) =>
			item.memberId === member.id
				? {
						...item,
						kind: member.kind,
						handle: member.handle,
						displayName: member.displayName,
						avatarUrl: member.avatarUrl,
						avatarColor: member.avatarColor ?? null,
					}
				: item,
		),
	};
}

/** An older payload must not overwrite a newer one: `version` is the server's own ordering. */
function newer(current: Member | undefined, member: Member): Member {
	return current && current.version > member.version ? current : member;
}

export function writeMember(client: QueryClient, member: Member): void {
	client.setQueryData<MeResponse>(keys.me(), (current) => {
		if (!current) return current;
		const person = current.member.id === member.id ? newer(current.member, member) : current.member;
		const bot = current.bot.id === member.id ? newer(current.bot, member) : current.bot;
		return person === current.member && bot === current.bot ? current : { ...current, member: person, bot };
	});
	client.setQueryData<ContactList>(keys.contacts(), (current) =>
		current ? { items: current.items.map((item) => (item.id === member.id ? newer(item, member) : item)) } : current,
	);
	client.setQueryData<ConversationList>(keys.conversations.list(), (current) =>
		current ? { items: current.items.map((item) => patchConversation(item, member)) } : current,
	);
}

/** A deleted Bot disappears from the contact list and from every conversation it was in. */
export function removeMember(client: QueryClient, memberId: string): void {
	client.setQueryData<ContactList>(keys.contacts(), (current) =>
		current ? { items: current.items.filter((item) => item.id !== memberId) } : current,
	);
	client.setQueryData<ConversationList>(keys.conversations.list(), (current) =>
		current
			? {
					items: current.items.map((conversation) =>
						conversation.members.some((item) => item.memberId === memberId)
							? {
									...conversation,
									members: conversation.members.filter((item) => item.memberId !== memberId),
								}
							: conversation,
					),
				}
			: current,
	);
}

/** A mutation response and a realtime event both carry the server's conversation version. */
export function writeConversation(client: QueryClient, conversation: Conversation): void {
	client.setQueryData<ConversationList>(keys.conversations.list(), (current) => {
		const items = current?.items ?? [];
		const existing = items.find((item) => item.id === conversation.id);
		if (!existing) return { items: [conversation, ...items] };
		if (existing.version > conversation.version) return current;
		if (
			existing.historyClearedThrough &&
			isNewChatHistoryCutoff(existing.historyClearedThrough, conversation.historyClearedThrough)
		)
			return current;
		return { items: items.map((item) => (item.id === conversation.id ? conversation : item)) };
	});
}

/** A conversation left the list: drop it and its history, so nothing can reopen a dead chat. */
export function removeConversation(client: QueryClient, conversationId: string): void {
	const history = client.getQueryData<InfiniteData<MessagePage>>(keys.messages.latest(conversationId));
	discardMessageImages(
		client,
		(history?.pages ?? []).flatMap((page) => page.items),
	);
	client.setQueryData<ConversationList>(keys.conversations.list(), (current) =>
		current ? { items: current.items.filter((item) => item.id !== conversationId) } : current,
	);
	client.removeQueries({ queryKey: keys.messages.all(conversationId) });
}

/** Drop the Bot's own private chat: the two of us were the only members in it. */
export function removeDirectConversationWith(client: QueryClient, memberId: string): void {
	const current = client.getQueryData<ConversationList>(keys.conversations.list());
	for (const conversation of current?.items ?? []) {
		if (conversation.kind !== "direct" || !conversation.members.some((item) => item.memberId === memberId)) continue;
		removeConversation(client, conversation.id);
	}
}

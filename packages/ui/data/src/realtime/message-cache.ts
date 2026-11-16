import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { mergeMessage } from "@yonder/chat-model";
import type { Conversation, MessagePage, Run } from "@yonder/protocol";
import type { CachedMessage } from "../hooks/chat.ts";
import { keys } from "../query/keys.ts";

/** Keep one message per server id (or client nonce while a send is being confirmed). */
export function updateMessage(client: QueryClient, message: CachedMessage): void {
	client.setQueryData<InfiniteData<MessagePage>>(keys.messages.latest(message.conversationId), (current) => {
		// Do not create an incomplete history cache for a conversation that is not open.
		if (!current) return current;
		const pages = current.pages;
		let found = false;
		const next = pages.map((page) => ({
			...page,
			items: page.items.map((old) => {
				if (old.id !== message.id && (!message.clientNonce || old.clientNonce !== message.clientNonce)) return old;
				found = true;
				return mergeMessage(old, message);
			}),
		}));
		if (!found) next[0]?.items.push(message);
		return { pages: next, pageParams: current.pageParams };
	});

	if (message.pending || message.sendFailed || !message.body?.trim()) return;
	client.setQueryData<{ items: Conversation[] }>(keys.conversations.list(), (current) => {
		if (!current) return current;
		return {
			items: current.items.map((conversation) => {
				if (
					conversation.id !== message.conversationId ||
					(conversation.lastMessage?.createdAt && conversation.lastMessage.createdAt > message.createdAt)
				)
					return conversation;
				return {
					...conversation,
					lastMessageAt: message.createdAt,
					lastMessage: { body: message.body, senderKind: message.senderKind, createdAt: message.createdAt },
				};
			}),
		};
	});
}

export function updateRun(client: QueryClient, run: Run): void {
	client.setQueryData<InfiniteData<MessagePage>>(keys.messages.latest(run.conversationId), (current) => {
		if (!current) return current;
		return {
			...current,
			pages: current.pages.map((page) => ({
				...page,
				items: page.items.map((message) => (message.id === run.messageId ? { ...message, run } : message)),
			})),
		};
	});
}

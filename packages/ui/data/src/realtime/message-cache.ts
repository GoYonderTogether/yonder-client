import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { mergeMessage } from "@yonder/chat-model";
import type { Conversation, MessagePage, Run } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import type { CachedMessage } from "./cached-message.ts";

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

	if (message.pending || message.sendFailed) return;
	// A group lifecycle message has no body but still belongs in the list preview: the row renders it
	// from `system` in the reader's language (19 第三节).
	const isSystem = message.type === "system";
	if (!isSystem && !message.voice && !message.body?.trim()) return;
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
					lastMessage: {
						body: message.body,
						senderKind: message.senderKind,
						createdAt: message.createdAt,
						type: message.type,
						...(message.system ? { system: message.system } : {}),
						...(message.voice ? { voice: message.voice } : {}),
					},
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
				items: page.items.map((message) =>
					message.id === run.messageId
						? {
								...message,
								run: {
									...run,
									...(run.activity ? {} : message.run?.activity ? { activity: message.run.activity } : {}),
								},
							}
						: message,
				),
			})),
		};
	});
}

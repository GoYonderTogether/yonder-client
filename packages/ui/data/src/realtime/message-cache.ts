import type { InfiniteData, Query, QueryClient } from "@tanstack/react-query";
import { chatHistoryTimeOffset, isNewChatHistoryCutoff, mergeMessage } from "@yonder/chat-model";
import type { ChatHistoryCutoff, Conversation, Message, MessagePage, Run } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import type { CachedMessage } from "./cached-message.ts";

type ConversationList = { items: Conversation[] };
// Scope deleted ids to the cached history's lifetime so delayed events cannot restore the row.
const deletedMessages = new WeakMap<Query, Set<string>>();

export function withFeedback(message: Message, value: Message["feedback"] | null): Message {
	const { feedback: _feedback, ...rest } = message;
	return value ? { ...rest, feedback: value } : rest;
}

export function editCachedMessage(
	client: QueryClient,
	conversationId: string,
	messageId: string,
	edit: (message: Message) => Message,
): Message | undefined {
	let previous: Message | undefined;
	client.setQueryData<InfiniteData<MessagePage>>(keys.messages.latest(conversationId), (current) => {
		if (!current) return current;
		return {
			...current,
			pages: current.pages.map((page) => ({
				...page,
				items: page.items.map((item) => {
					if (item.id !== messageId) return item;
					previous ??= item;
					return edit(item);
				}),
			})),
		};
	});
	return previous;
}

function markUnavailableReply(message: Message, sourceId: string, kind: "recalled" | "missing"): Message {
	const reply = message.replyTo;
	if (!reply || reply.id !== sourceId) return message;
	return { ...message, replyTo: { id: reply.id, senderId: reply.senderId, snippet: "", [kind]: true } };
}

export function removeMessage(client: QueryClient, conversationId: string, messageId: string): Message | undefined {
	const historyKey = keys.messages.latest(conversationId);
	const query = client.getQueryCache().find({ queryKey: historyKey, exact: true });
	if (query) {
		const deleted = deletedMessages.get(query) ?? new Set<string>();
		deleted.add(messageId);
		deletedMessages.set(query, deleted);
	}

	let removed: Message | undefined;
	client.setQueryData<InfiniteData<MessagePage>>(historyKey, (current) => {
		if (!current) return current;
		return {
			...current,
			pages: current.pages.map((page) => ({
				...page,
				items: page.items.flatMap((item) => {
					if (item.id === messageId) {
						removed ??= item;
						return [];
					}
					return [markUnavailableReply(item, messageId, "missing")];
				}),
			})),
		};
	});

	const removedAt = removed?.createdAt;
	client.setQueryData<ConversationList>(
		keys.conversations.list(),
		(current) =>
			current && {
				items: current.items.map((item) =>
					item.id === conversationId && removedAt && item.lastMessage?.createdAt === removedAt
						? { ...item, lastMessage: null }
						: item,
				),
			},
	);
	return removed;
}

function cachedConversation(client: QueryClient, id: string) {
	return client.getQueryData<ConversationList>(keys.conversations.list())?.items.find((item) => item.id === id);
}

export function applyChatHistoryClear(client: QueryClient, id: string, cutoff: ChatHistoryCutoff): void {
	const listKey = keys.conversations.list();
	const historyKey = keys.messages.latest(id);
	const conversation = cachedConversation(client, id);
	if (conversation && isNewChatHistoryCutoff(cutoff, conversation.historyClearedThrough)) {
		void client.cancelQueries({ queryKey: listKey });
		client.setQueryData<ConversationList>(
			listKey,
			(current) =>
				current && {
					items: current.items.map((item) => {
						if (item.id !== id) return item;
						const last = item.lastMessage?.createdAt;
						return {
							...item,
							historyClearedThrough: cutoff,
							...(!last || chatHistoryTimeOffset(last, cutoff) <= 0
								? { lastMessage: null, lastMessageAt: null, unreadCount: 0 }
								: {}),
						};
					}),
				},
		);
	}
	const current = client.getQueryData<InfiniteData<MessagePage>>(historyKey);
	if (!isNewChatHistoryCutoff(cutoff, current?.pages[0]?.historyClearedThrough)) return;
	void client.cancelQueries({ queryKey: historyKey });
	// TanStack cancellation restores the fetch-start snapshot; clear the latest realtime state instead.
	client.setQueryData<InfiniteData<MessagePage>>(historyKey, () => {
		if (!current) return current;
		const pages = current.pages.map((page) => {
			const items = page.items.filter(
				(message: CachedMessage) =>
					message.pending || message.sendFailed || chatHistoryTimeOffset(message.createdAt, cutoff) > 0,
			);
			return {
				...page,
				items,
				historyClearedThrough: cutoff,
				...(items.length < page.items.length ? { nextCursor: null, hasMore: false } : {}),
			};
		});
		const end = pages.findIndex((page) => !page.hasMore);
		return end < 0
			? { ...current, pages }
			: { pages: pages.slice(0, end + 1), pageParams: current.pageParams.slice(0, end + 1) };
	});
	void client.invalidateQueries({ queryKey: historyKey });
}

/** Keep one message per server id (or client nonce while a send is being confirmed). */
export function updateMessage(client: QueryClient, message: CachedMessage): void {
	const queryKey = keys.messages.latest(message.conversationId);
	const query = client.getQueryCache().find({ queryKey, exact: true });
	if (query && deletedMessages.get(query)?.has(message.id)) return;
	const history = client.getQueryData<InfiniteData<MessagePage>>(queryKey);
	const previous = history?.pages
		.find((page) => page.items.some((item) => item.id === message.id))
		?.items.find((item) => item.id === message.id);
	if (previous && (previous.version > message.version || (previous.recalled && !message.recalled))) return;
	const cutoff = history?.pages[0]?.historyClearedThrough;
	const listedCutoff = cachedConversation(client, message.conversationId)?.historyClearedThrough;
	const latest = listedCutoff && isNewChatHistoryCutoff(listedCutoff, cutoff) ? listedCutoff : cutoff;
	if (latest && !message.pending && !message.sendFailed) {
		const time = chatHistoryTimeOffset(message.createdAt, latest);
		if (time <= 0 && message.clientNonce)
			client.setQueryData<InfiniteData<MessagePage>>(
				queryKey,
				(current) =>
					current && {
						...current,
						pages: current.pages.map((page) => ({
							...page,
							items: page.items.filter(
								(item) => !item.id.startsWith("temp_") || item.clientNonce !== message.clientNonce,
							),
						})),
					},
			);
		if (time === 0 && message.id !== latest.messageId) {
			void client.invalidateQueries({ queryKey });
			void client.invalidateQueries({ queryKey: keys.conversations.list() });
		}
		if (time <= 0) return;
	}
	client.setQueryData<InfiniteData<MessagePage>>(queryKey, (current) => {
		// Do not create an incomplete history cache for a conversation that is not open.
		if (!current) return current;
		const pages = current.pages;
		let found = false;
		const next = pages.map((page) => ({
			...page,
			items: page.items.map((old) => {
				if (old.id !== message.id && (!message.clientNonce || old.clientNonce !== message.clientNonce))
					return message.recalled ? markUnavailableReply(old, message.id, "recalled") : old;
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
	if (!isSystem && !message.recalled && !message.voice && !message.meeting && !message.body?.trim()) return;
	// A reply in a hidden conversation (清空历史) brings the conversation list back in step, so the row
	// does not keep showing an older preview than the message that just landed.
	const conversation = cachedConversation(client, message.conversationId);
	const listKey = keys.conversations.list();
	if (message.recalled && conversation?.lastMessage?.createdAt === message.createdAt)
		void client.cancelQueries({ queryKey: listKey });
	if (!message.streaming && conversation?.hiddenFromMessages) void client.invalidateQueries({ queryKey: listKey });
	client.setQueryData<ConversationList>(listKey, (current) => {
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
						...(!message.recalled && message.voice ? { voice: message.voice } : {}),
						...(!message.recalled && message.meeting ? { recordingNote: true } : {}),
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

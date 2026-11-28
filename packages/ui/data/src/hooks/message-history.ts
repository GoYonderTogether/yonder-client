import { type InfiniteData, type QueryClient, replaceEqualDeep } from "@tanstack/react-query";
import { chatHistoryTimeOffset, isNewChatHistoryCutoff, mergeMessage } from "@yonder/chat-model";
import type { ChatHistoryCutoff, MessagePage } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import type { CachedMessage } from "../realtime/cached-message.ts";
import { withFeedback } from "../realtime/message-cache.ts";

type History = InfiniteData<MessagePage, string | undefined>;
const fetchedPages = new WeakMap<MessagePage, { before: History | undefined }>();

/** Mark network pages, not local writes. TanStack commits the entire InfiniteData only after all pages resolve. */
export async function fetchHistoryPage(
	client: QueryClient,
	conversationId: string,
	load: () => Promise<MessagePage>,
): Promise<MessagePage> {
	const before = client.getQueryData<History>(keys.messages.latest(conversationId));
	const page = { ...(await load()) };
	fetchedPages.set(page, { before });
	return page;
}

function indexMessages(pages: readonly MessagePage[] = []) {
	const ids = new Map<string, CachedMessage>();
	const nonces = new Map<string, CachedMessage>();
	for (const page of pages) {
		for (const item of page.items) {
			ids.set(item.id, item);
			if (item.clientNonce) nonces.set(item.clientNonce, item);
		}
	}
	return {
		ids,
		find: (item: CachedMessage) => ids.get(item.id) ?? (item.clientNonce ? nonces.get(item.clientNonce) : undefined),
	};
}

function newestCutoff(pages: MessagePage[]): ChatHistoryCutoff | undefined {
	return pages.reduce<ChatHistoryCutoff | undefined>(
		(latest, { historyClearedThrough: cutoff }) => (cutoff && isNewChatHistoryCutoff(cutoff, latest) ? cutoff : latest),
		undefined,
	);
}

export function shareMessageHistory(oldData: unknown, newData: unknown): unknown {
	const current = oldData as History | undefined;
	const incoming = newData as History;
	const first = incoming.pages.find((page) => fetchedPages.has(page));
	if (!first) return replaceEqualDeep(current, incoming);

	const fetched = incoming.pages.indexOf(first);
	const before = fetchedPages.get(first)?.before;
	for (const page of incoming.pages) fetchedPages.delete(page);
	if (!current) return incoming;

	const currentCutoff = newestCutoff(current.pages);
	const incomingCutoff = newestCutoff(incoming.pages);
	// A pre-clear request has stale rows and cursors. The clear path already requests fresh history.
	if (currentCutoff && isNewChatHistoryCutoff(currentCutoff, incomingCutoff)) return current;

	const original = indexMessages(before?.pages);
	const live = indexMessages(current.pages);
	const network = indexMessages(incoming.pages.slice(fetched));
	const ids = new Set<string>();
	const nonces = new Set<string>();
	const remember = (item: CachedMessage) => {
		if (ids.has(item.id) || (item.clientNonce && nonces.has(item.clientNonce))) return false;
		ids.add(item.id);
		if (item.clientNonce) nonces.add(item.clientNonce);
		return true;
	};
	const keepAfterClear = (item: CachedMessage) =>
		!incomingCutoff ||
		(!item.queuedLocally && (item.pending || item.sendFailed)) ||
		chatHistoryTimeOffset(item.createdAt, incomingCutoff) > 0;
	const reconcile = (item: CachedMessage, latest: CachedMessage | undefined) => {
		if (!latest) return item;
		if (item.id.startsWith("temp_"))
			return latest.id.startsWith("temp_") && latest === original.find(latest) ? item : latest;
		let merged = latest.recalled && !item.recalled ? latest : mergeMessage(latest, item);
		const originalMessage = original.find(latest);
		// Feedback is viewer state and can change at the same message version.
		if (originalMessage && latest.version >= item.version && latest.feedback !== originalMessage.feedback)
			merged = withFeedback(merged, latest.feedback);
		const updatedReply = latest.replyTo;
		if (
			(updatedReply?.recalled || updatedReply?.missing) &&
			updatedReply.id === merged.replyTo?.id &&
			updatedReply !== originalMessage?.replyTo
		) {
			merged = { ...merged, replyTo: updatedReply };
		}
		// A run-only event does not bump the message version. Keep a live run changed during this request.
		if (
			latest.run &&
			latest.run !== originalMessage?.run &&
			latest.version >= item.version &&
			(!item.run || latest.run.id === item.run.id)
		) {
			return { ...merged, run: latest.run };
		}
		return merged;
	};
	const pages = incoming.pages.map((page, index) => {
		// Loading older history must use the current contents of pages TanStack copied before awaiting HTTP.
		const copied = index < fetched;
		if (copied) {
			const currentIndex = current.pageParams.indexOf(incoming.pageParams[index]);
			if (currentIndex >= 0) page = current.pages[currentIndex] ?? page;
		}
		const items = page.items.map((item) => {
			if (!copied) return reconcile(item, live.find(item));
			const fetchedItem = network.find(item);
			return fetchedItem ? reconcile(fetchedItem, item) : item;
		});
		const needsCutoff = incomingCutoff && isNewChatHistoryCutoff(incomingCutoff, page.historyClearedThrough);
		return { ...page, items: items.filter((item) => (!needsCutoff || keepAfterClear(item)) && remember(item)) };
	});
	if (fetched === 0) {
		// Keep rows delivered after the refresh began; do not union old snapshots into the new pagination window.
		for (const item of live.ids.values()) {
			if (item !== original.find(item) && keepAfterClear(item) && remember(item)) pages[0]?.items.push(item);
		}
	}
	return replaceEqualDeep(current, { ...incoming, pages });
}

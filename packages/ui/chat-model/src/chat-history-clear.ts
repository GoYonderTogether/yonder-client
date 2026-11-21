import type { ChatHistoryCutoff } from "@yonder/protocol";

export function isNewChatHistoryCutoff(cutoff: ChatHistoryCutoff, previous: ChatHistoryCutoff | undefined): boolean {
	if (!previous) return true;
	return (
		cutoff.createdAt > previous.createdAt ||
		(cutoff.createdAt === previous.createdAt && cutoff.messageId > previous.messageId)
	);
}

/** Cached rows tied at the public timestamp need a server read for exact ordering. */
export function chatHistoryTimeOffset(createdAt: string, cutoff: ChatHistoryCutoff): number {
	return Date.parse(createdAt) - Date.parse(cutoff.createdAt.replace(/(\.\d{3})\d+Z$/, "$1Z"));
}

import type { Conversation } from "@yonder/protocol";

/**
 * The Bot whose page the chat's title and avatar open, or `null` when there is none to open.
 *
 * A one-to-one chat in this app is with a Bot the account owns; a chat with someone else's Bot is
 * a visit and is left to the visit flow. `ConversationMember` carries no `ownerId`, so ownership is
 * not decided here — the Bot page loads the Bot from the account's own list and says it is gone if
 * it is not the caller's. Guessing wrong therefore shows an honest "not found", never another
 * account's Bot.
 */
export function chatBotId(conversation: Conversation | undefined): string | null {
	if (conversation?.kind !== "direct" || conversation.visit) return null;
	return conversation.members.find((member) => member.kind === "bot")?.memberId ?? null;
}

/** The same for one message's sender: only a Bot speaking in a one-to-one chat has a page. */
export function senderBotId(conversation: Conversation | undefined, senderId: string): string | null {
	if (chatBotId(conversation) !== senderId) return null;
	return senderId;
}

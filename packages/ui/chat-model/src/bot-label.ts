import type { Conversation, ConversationMember, Member } from "@yonder/protocol";

export const BOT_ROLE_LIMIT = 24;

export function botRoleProblem(value: string): "length" | "controls" | null {
	if (/[\p{Cc}\p{Cs}]/u.test(value)) return "controls";
	return [...value.trim()].length > BOT_ROLE_LIMIT ? "length" : null;
}

/** Conversation members contain no private Bot metadata. Look up only this account's own copy. */
export function ownedBotFor(
	botId: string,
	viewerId: string | undefined,
	primary: Member | undefined,
	contacts: readonly Member[] | undefined,
): Member | undefined {
	const bot = primary?.id === botId ? primary : contacts?.find((member) => member.id === botId);
	return viewerId && bot?.kind === "bot" && bot.ownerId === viewerId ? bot : undefined;
}

export function conversationBotOwner(member: ConversationMember, conversation: Conversation | undefined) {
	return member.botOwner === undefined && conversation?.visit?.role === "visitor" ? null : member.botOwner;
}

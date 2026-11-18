import type { MemberCard } from "@yonder/protocol";

/**
 * Placeholder for the visit entry (R6: another person's Bot opens a chat directly). The visit
 * session registers it; until then the card draws no button, so nothing on screen is dead.
 */
export type BotChatStarter = (card: MemberCard) => void;

let starter: BotChatStarter | null = null;

export function registerBotChatStarter(next: BotChatStarter | null): void {
	starter = next;
}

export function botChatStarter(): BotChatStarter | null {
	return starter;
}

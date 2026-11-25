import { isTwoPartyAgentChat } from "@yonder/chat-model";
import type { Conversation, ConversationMember, Member, Message, SkillSummary } from "@yonder/protocol";
import type { CompletionItem } from "./tokens.ts";

/**
 * Who a mention can reach, decided by the conversation the composer writes into. A group reaches
 * only its own current members; the owner's private chat with their own Bot keeps the address book
 * because `@` there points the Bot at someone; any other private chat reaches only its two people.
 */
export type MentionScope = "group" | "agent" | "direct";

export interface CompletionContext {
	skills: readonly SkillSummary[];
	contacts: readonly Member[];
	members: readonly ConversationMember[];
	bot: Member | undefined;
	/** The writer; never offered as a mention. */
	selfId: string | undefined;
	mentionScope: MentionScope;
	/** Who spoke in this conversation, most recent first; the mention list leads with them. */
	recentMemberIds: readonly string[];
	compactLabel?: string | undefined;
}

/**
 * Who spoke here lately, most recent first. The loaded history is the cheap source: per sender keep
 * the newest `createdAt`, then sort those few names. It reads the same list the timeline already
 * shows, so no extra request or protocol field is needed for an order the reader recognizes.
 */
export function recentSpeakerIds(messages: readonly Message[] | undefined, limit = 12): string[] {
	const latest = new Map<string, string>();
	for (const { senderId, type, createdAt } of messages ?? []) {
		// A system line names nobody to mention; a person and a Bot both speak.
		if (!senderId || type === "system") continue;
		const seen = latest.get(senderId);
		if (!seen || createdAt > seen) latest.set(senderId, createdAt);
	}
	return [...latest.entries()]
		.sort((first, second) => second[1].localeCompare(first[1]))
		.slice(0, limit)
		.map(([id]) => id);
}

function row(member: Member | ConversationMember, keyboardHint: boolean): CompletionItem {
	return {
		id: "memberId" in member ? member.memberId : member.id,
		kind: "member",
		name: member.displayName,
		// Matched against, never shown: someone finds a contact by typing its handle.
		handle: member.handle,
		memberKind: member.kind,
		avatarUrl: member.avatarUrl,
		keyboardHint,
	};
}

/** Recent speakers lead; everyone else keeps the order the conversation lists them in. */
function recentFirst(members: readonly ConversationMember[], recentMemberIds: readonly string[]): ConversationMember[] {
	const rank = new Map(recentMemberIds.map((id, index) => [id, index]));
	const spoke = members
		.filter((member) => rank.has(member.memberId))
		.sort((first, second) => (rank.get(first.memberId) ?? 0) - (rank.get(second.memberId) ?? 0));
	return [...spoke, ...members.filter((member) => !rank.has(member.memberId))];
}

function mentionRows(context: CompletionContext): CompletionItem[] {
	const { members, contacts, bot, selfId, mentionScope, recentMemberIds } = context;
	// The owner's own Bot chat is the one place where the candidate list is driven by a keyboard
	// flow; the key hint belongs only there.
	const keyboardHint = mentionScope === "agent";
	if (mentionScope === "group")
		return recentFirst(members, recentMemberIds)
			.filter((member) => member.memberId !== selfId)
			.map((member) => row(member, keyboardHint));
	if (mentionScope === "direct")
		return members.filter((member) => member.memberId !== selfId).map((member) => row(member, keyboardHint));
	// `agent`: the address book plus the default Bot, then whoever is actually in this chat.
	const people = new Map<string, CompletionItem>();
	for (const contact of contacts) people.set(contact.id, row(contact, keyboardHint));
	if (bot) people.set(bot.id, row(bot, keyboardHint));
	for (const member of recentFirst(members, recentMemberIds)) people.set(member.memberId, row(member, keyboardHint));
	return [...people.values()];
}

/**
 * Two people can share a display name. Only then does the row need its handle to be told apart;
 * showing every handle would put a second, shorter name under each row for no choice it informs.
 */
function markDuplicates(rows: readonly CompletionItem[]): CompletionItem[] {
	const counts = new Map<string, number>();
	const key = (entry: CompletionItem) => entry.name.trim().toLocaleLowerCase();
	for (const entry of rows) counts.set(key(entry), (counts.get(key(entry)) ?? 0) + 1);
	return rows.map((entry) => ((counts.get(key(entry)) ?? 0) > 1 ? { ...entry, showHandle: true } : entry));
}

export function completionItems(context: CompletionContext): CompletionItem[] {
	const { skills, compactLabel } = context;
	return [
		...(compactLabel
			? [{ id: "command:compact", kind: "command" as const, name: "compact", description: compactLabel }]
			: []),
		...skills
			.filter((skill) => skill.enabled)
			.map(
				(skill): CompletionItem => ({
					id: skill.id,
					kind: "skill",
					name: skill.name,
					displayNameZh: skill.displayNameZh,
					description: skill.description,
					source: skill.source,
				}),
			),
		...markDuplicates(mentionRows(context)),
	];
}

/**
 * What the composer's one call site needs: the chat decides who `@` reaches. `chat` carries the
 * conversation, its Bot flag and the loaded history, so the frame names the chat once.
 */
export function composerCompletionItems(
	chat: {
		target: Conversation | undefined;
		hasBot: boolean;
		messages: readonly Message[] | undefined;
	},
	skills: readonly SkillSummary[],
	contacts: readonly Member[],
	bot: Member | undefined,
	selfId: string | undefined,
	compactLabel: string | undefined,
): CompletionItem[] {
	const { target: conversation, messages } = chat;
	return completionItems({
		skills: chat.hasBot ? skills : [],
		contacts,
		members: conversation?.members ?? [],
		bot,
		selfId,
		mentionScope: !conversation
			? "agent"
			: conversation.kind === "group"
				? "group"
				: isTwoPartyAgentChat(conversation, selfId)
					? "agent"
					: "direct",
		recentMemberIds: recentSpeakerIds(messages),
		compactLabel,
	});
}

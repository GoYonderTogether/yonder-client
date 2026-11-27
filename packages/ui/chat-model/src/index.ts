export { agentChatStatus, isTwoPartyAgentChat } from "./agent-chat.ts";
export { BOT_FACE_IDS, type BotFaceId, botFaceFor, botFacePaths, firstCharacter, tintFor } from "./avatar.ts";
export { BOT_ROLE_LIMIT, botRoleProblem, conversationBotOwner, ownedBotFor } from "./bot-label.ts";
export { chatHistoryTimeOffset, isNewChatHistoryCutoff } from "./chat-history-clear.ts";
export { connectorRequestReason } from "./connector-requests.ts";
export { conversationPeer } from "./conversation-peer.ts";
export {
	addableContacts,
	addableFor,
	canRemoveMember,
	filterContacts,
	GROUP_MEMBER_LIMIT,
	groupMemberRights,
	isOwnBot,
	recentContacts,
} from "./group-invites.ts";
export { optionCardAttachments, optionCardState } from "./option-cards.ts";
export {
	attachmentsOutsideQuestionCard,
	emptyQuestionDraft,
	emptyQuestionDraftAnswer,
	type QuestionDraft,
	type QuestionDraftAnswer,
	questionAnswerText,
	questionDraftAnswers,
	questionDraftPageReady,
} from "./question-cards.ts";
export {
	type FailureTone,
	isSilentFailure,
	runFailureText,
	scheduleFailureText,
} from "./run-failure.ts";
export { runSources } from "./run-sources.ts";
export { visitAvatarOverlay, visitBot, visitRelayTarget } from "./visit-presentation.ts";

import type { Message } from "@yonder/protocol";
import { runSources } from "./run-sources.ts";

/** Preserve a newer server message and an already received run when a snapshot omits it. */
export function mergeMessage<T extends Message>(old: T, incoming: T): T {
	if (!old.id.startsWith("temp_") && old.version > incoming.version) return old;
	return {
		...incoming,
		...(incoming.run == null && old.run
			? { run: old.run }
			: incoming.run && old.run?.id === incoming.run.id && !incoming.run.activity && old.run.activity
				? { run: { ...incoming.run, activity: old.run.activity } }
				: {}),
	};
}

/** An opaque, safe card reference. Authorization still happens in the card API. */
export function isAgentCardId(id: unknown): id is string {
	return typeof id === "string" && /^[a-z\d_-]{1,128}$/iu.test(id);
}

type MessageCapabilities = {
	agentCards?: boolean;
	recordingNotes?: boolean;
	taskSessions?: boolean;
	connectorIntakeOwnerLayout?: boolean;
};

/** A system-owned card caused by the owner's grant, not a message authored by the owner. */
export function isConnectorIntakeCard(message: Message): boolean {
	return (
		message.senderKind === "bot" &&
		Boolean(message.taskSession) &&
		/^task-entry:connector-intake:apple-(calendar|photos|notes|voice-memos)$/.test(message.clientNonce ?? "")
	);
}

const hasAgentCard = (message: Message, support: MessageCapabilities) =>
	support.agentCards && message.senderKind === "bot" && isAgentCardId(message.cardId);

/** A finished Bot reply can become readable after a message sent later in the chat. */
export function newestReadableMessage(
	items: readonly Message[],
	personId: string,
	support: MessageCapabilities = {},
): string | undefined {
	let newest: Message | undefined;
	for (const message of items) {
		if (
			message.id.startsWith("temp_") ||
			message.senderId === personId ||
			message.streaming ||
			message.system?.event === "memory_updated" ||
			(message.type === "text" &&
				!message.body?.trim() &&
				!message.attachments.length &&
				!message.outwardRequest &&
				!message.friendRequestId &&
				!message.connectorRequestId &&
				!message.questionCard &&
				!(support.recordingNotes && message.meeting) &&
				!(support.taskSessions && message.taskSession) &&
				!hasAgentCard(message, support))
		)
			continue;
		const at = message.readableAt ?? message.createdAt;
		const previous = newest?.readableAt ?? newest?.createdAt;
		if (!newest || !previous || at > previous || (at === previous && message.id > newest.id)) newest = message;
	}
	return newest?.id;
}

/**
 * `repeats` maps a failed reply's id to how many identical failures in a row it stands for (2 or
 * more). The server folds the Bot's own history by the same rule (server docs/architecture.md「系统行」).
 */
export type MessageBlock<T> =
	| { time: Date; messageId: string; atStart: boolean }
	| { run: T[]; repeats?: Map<string, number> };

/** A reply that failed and said nothing: the owner sees only the reason under it. */
function failedReason(message: Message): string | null {
	return message.type === "text" &&
		message.senderKind === "bot" &&
		message.run?.status === "failed" &&
		!message.body?.trim() &&
		!message.attachments.length
		? (message.run.failureReason?.trim() ?? "") || "unknown"
		: null;
}

/**
 * A time label breaks a sender run, and a system message stands on its own. Identical failures in a
 * row from the same Bot are one line with a count: the newest one stays, so its retry is the one shown.
 */
export function groupMessages<T extends Message>(
	items: readonly T[],
	hasFullHistory = false,
	support: MessageCapabilities = {},
) {
	const blocks: MessageBlock<T>[] = [];
	let previous: Date | undefined;
	for (const item of items) {
		if (isEmptyBotReply(item) && !hasAgentCard(item, support)) continue;
		const at = new Date(item.createdAt);
		const milliseconds = at.getTime();
		if (Number.isFinite(milliseconds)) {
			const atStart = hasFullHistory && blocks.length === 0;
			if (
				atStart ||
				(previous && (milliseconds - previous.getTime() >= 5 * 60_000 || at.toDateString() !== previous.toDateString()))
			) {
				blocks.push({ time: at, messageId: item.id, atStart });
			}
			previous = at;
		}
		const last = blocks.at(-1);
		const run = last && "run" in last ? last.run : undefined;
		const sender = run?.[0];
		const reason = failedReason(item);
		const earlier = run?.at(-1);
		if (
			last &&
			"run" in last &&
			run &&
			earlier &&
			reason !== null &&
			failedReason(earlier) === reason &&
			earlier.senderId === item.senderId
		) {
			const count = (last.repeats?.get(earlier.id) ?? 1) + 1;
			last.repeats ??= new Map();
			last.repeats.delete(earlier.id);
			last.repeats.set(item.id, count);
			run[run.length - 1] = item;
			continue;
		}
		if (
			run &&
			item.type !== "system" &&
			sender?.type !== "system" &&
			sender?.senderId === item.senderId &&
			(!support.connectorIntakeOwnerLayout || (!isConnectorIntakeCard(item) && !isConnectorIntakeCard(sender)))
		) {
			run.push(item);
		} else {
			blocks.push({ run: [item] });
		}
	}
	return blocks;
}

/** Only a server-accepted owner turn with a live, still-empty Bot response can show waiting dots. */
export function findPendingBotReply(
	items: readonly Message[] | undefined,
	botId: string,
	ownerId: string,
): Message | undefined {
	if (!items) return undefined;
	const accepted = new Set(
		items
			.filter((item) => item.senderId === ownerId && item.type === "text" && !item.id.startsWith("temp_"))
			.map(({ id }) => id),
	);
	return items.find(
		(message) =>
			message.senderId === botId &&
			(message.run?.status === "queued" || message.run?.status === "running") &&
			message.run.messageId === message.id &&
			accepted.has(message.run.userMessageId) &&
			isEmptyBotReply(message) &&
			!message.cardId &&
			!message.meeting &&
			!message.taskSession &&
			!message.channelAttemptId,
	);
}

/** A reply record can exist before it has content and stay empty after a run finishes. */
function isEmptyBotReply(message: Message): boolean {
	return (
		message.type === "text" &&
		message.senderKind === "bot" &&
		(message.streaming || message.run?.messageId === message.id) &&
		!message.body?.trim() &&
		!message.attachments.length &&
		!message.reaction &&
		!message.outwardRequest &&
		!message.friendRequestId &&
		!message.connectorRequestId &&
		!message.questionCard &&
		!message.options?.length &&
		message.run?.status !== "failed" &&
		!runSources(message.run).length
	);
}

export function isHttpLink(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

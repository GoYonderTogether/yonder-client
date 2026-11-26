import type { Conversation, Message } from "@yonder/protocol";
import { conversationPeer } from "./conversation-peer.ts";

export function visitBot(conversation: Conversation) {
	return conversation.members.find((member) => member.memberId === conversation.visit?.botId && member.kind === "bot");
}

export function visitAvatarOverlay(conversation: Conversation, personId: string | undefined) {
	if (conversation.visit?.role === "host") return visitBot(conversation);
	if (conversation.visit?.role !== "visitor") return undefined;
	const owner = conversationPeer(conversation, personId)?.botOwner;
	return owner ? { ...owner, kind: "person" as const, avatarColor: undefined } : undefined;
}

/** Messages are in chronological order. Only saved, readable visitor text can anchor a relay. */
export function visitRelayTarget(
	items: readonly (Message & { pending?: boolean; sendFailed?: boolean })[],
	personId: string | undefined,
) {
	const pending = items.some((message) => message.outwardRequest?.state === "open");
	let messageId: string | undefined;
	for (const message of items) {
		if (
			message.senderKind === "person" &&
			message.senderId === personId &&
			!message.pending &&
			!message.sendFailed &&
			message.body?.trim()
		)
			messageId = message.id;
	}
	const alreadyRelayed =
		messageId && items.some((message) => message.outwardRequest && message.replyToId === messageId);
	return { messageId: !pending && !alreadyRelayed ? messageId : undefined, pending };
}

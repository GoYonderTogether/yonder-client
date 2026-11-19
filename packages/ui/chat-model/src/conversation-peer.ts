import type { Conversation } from "@yonder/protocol";

/** In a visit, the host sees the visitor and the visitor sees the Bot. */
export function conversationPeer(conversation: Conversation, personId: string | undefined) {
	const visit = conversation.visit;
	if (visit && conversation.kind === "direct") {
		if (visit.role === "host")
			return conversation.members.find((member) => member.kind === "person" && member.memberId !== personId);
		return conversation.members.find((member) => member.memberId === visit.botId);
	}
	return conversation.members.find((member) => member.memberId !== personId);
}

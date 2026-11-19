import type { Conversation, ItemSummary, Message } from "@yonder/protocol";
import { conversationPeer } from "./conversation-peer.ts";

export function isTwoPartyAgentChat(conversation: Conversation, personId: string | undefined): boolean {
	return (
		conversation.kind === "direct" &&
		conversation.members.length === 2 &&
		conversation.members.some((member) => member.kind === "person" && member.memberId === personId) &&
		conversationPeer(conversation, personId)?.kind === "bot"
	);
}

export function agentChatStatus(
	items: readonly Message[] | undefined,
	botId: string,
	subtasks: readonly ItemSummary[] | undefined,
): { kind: "typing" } | { kind: "processing"; titles: string[] } | undefined {
	if (
		items?.some(
			({ senderId, run, streaming, body }) =>
				senderId === botId && streaming && body?.trim() && (!run || run.status === "running"),
		)
	)
		return { kind: "typing" };
	const titles = subtasks
		?.filter((task) => task.botMemberId === botId && task.source === "subtask" && task.state === "running")
		.map((task) => task.title);
	return titles?.length ? { kind: "processing", titles } : undefined;
}

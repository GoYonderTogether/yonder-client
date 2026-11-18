import type { Conversation, Message } from "@yonder/protocol";
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
): { kind: "queued" | "working" | "replying"; activity?: string } | undefined {
	if (!items) return undefined;
	for (let index = items.length - 1; index >= 0; index--) {
		const message = items[index];
		if (message?.senderId !== botId) continue;
		const { run, streaming, body } = message;
		if (run?.status === "queued") return { kind: "queued" };
		if (run?.status === "running") {
			const activity = run.activity?.at(-1)?.label.trim();
			if (activity) return { kind: "working", activity };
			return { kind: streaming && body ? "replying" : "working" };
		}
		if (!run && streaming) return { kind: "replying" };
	}
	return undefined;
}

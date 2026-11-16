import { mergeMessage } from "@yonder/chat-model";
import type { Message, Run } from "@yonder/protocol";
export type ChatMessage = Message & { sendFailed?: boolean; pending?: boolean; skillIds?: string[] };
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
	const rows = [...current];
	for (const item of incoming) {
		const index = rows.findIndex(
			(row) => row.id === item.id || Boolean(item.clientNonce && row.clientNonce === item.clientNonce),
		);
		if (index < 0) rows.push(item);
		else rows[index] = mergeMessage(rows[index], item);
	}
	return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function updateRun(current: ChatMessage[], run: Run): ChatMessage[] {
	return current.map((message) =>
		message.id === run.messageId
			? { ...message, run, streaming: run.status === "queued" || run.status === "running" }
			: message,
	);
}
export function conversationTitle(
	members: { memberId: string; displayName: string }[],
	ownId?: string,
	title?: string | null,
): string {
	return (
		title ||
		members
			.filter((member) => member.memberId !== ownId)
			.map((member) => member.displayName)
			.join("、")
	);
}
